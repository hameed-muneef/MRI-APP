import { getNativeBackgroundAudioPlugin, type NativeAudioStateSnapshot } from './native-bridge';
import type { AudioCategory, AudioPlayerState, AudioTrack } from './types';

type HlsInstance = {
  loadSource(url: string): void;
  attachMedia(el: HTMLMediaElement): void;
  on(event: string, cb: (event: unknown, data: { fatal?: boolean }) => void): void;
  destroy(): void;
};

type StateListener = (state: AudioPlayerState) => void;

const INITIAL_STATE: AudioPlayerState = {
  status: 'idle',
  category: null,
  queue: [],
  currentIndex: -1,
  currentTrack: null,
  currentTime: 0,
  duration: 0,
  error: null,
};

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url);
}

export function formatAudioClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

class BackgroundAudioEngine {
  private state: AudioPlayerState = { ...INITIAL_STATE };
  private listeners = new Set<StateListener>();
  private audioEl: HTMLAudioElement | null = null;
  private hlsInstance: HlsInstance | null = null;
  private webLoadToken = 0;
  private sleepTimerHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  private nativeInitDone = false;

  constructor() {
    this.initNativeSync();
  }

  private initNativeSync() {
    if (this.nativeInitDone || typeof window === 'undefined') return;
    const plugin = getNativeBackgroundAudioPlugin();
    if (!plugin) return;
    this.nativeInitDone = true;

    void plugin.addListener('stateChange', (snap) => {
      this.applyNativeSnapshot(snap);
    }).catch(() => {});

    void plugin.getState().then((snap) => {
      if (snap && snap.status && snap.status !== 'idle') {
        this.applyNativeSnapshot(snap);
      }
    }).catch(() => {});
  }

  private applyNativeSnapshot(snap: NativeAudioStateSnapshot) {
    if (snap.status === 'idle') {
      this.setState({ ...INITIAL_STATE });
      return;
    }

    const idx = typeof snap.currentIndex === 'number' ? snap.currentIndex : -1;
    const matchedFromQueue = idx >= 0 && idx < this.state.queue.length
      ? this.state.queue[idx]
      : (snap.currentTrack ? this.state.queue.find((t) => t.id === snap.currentTrack?.id) : undefined);

    const track: AudioTrack | null = matchedFromQueue ?? (snap.currentTrack
      ? {
          id: snap.currentTrack.id,
          title: snap.currentTrack.title,
          subtitle: snap.currentTrack.subtitle,
          url: snap.currentTrack.url,
          category: snap.currentTrack.category,
          isLive: snap.currentTrack.isLive,
        }
      : null);

    this.setState({
      ...this.state,
      status: snap.status,
      category: snap.category ?? track?.category ?? this.state.category,
      currentIndex: idx,
      currentTrack: track,
      currentTime: Number.isFinite(snap.currentTime) ? snap.currentTime : 0,
      duration: Number.isFinite(snap.duration) ? snap.duration : 0,
      error: snap.error ?? null,
    });
  }

  private setState(next: AudioPlayerState) {
    this.state = next;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  getState(): AudioPlayerState {
    return this.state;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async playQueue(tracks: AudioTrack[], startIndex = 0, category?: AudioCategory): Promise<void> {
    if (!tracks.length) return;
    const idx = Math.max(0, Math.min(startIndex, tracks.length - 1));
    const resolvedCategory = category ?? tracks[idx].category;

    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      this.destroyWebAudio();
      this.setState({
        status: 'loading',
        category: resolvedCategory,
        queue: tracks,
        currentIndex: idx,
        currentTrack: tracks[idx],
        currentTime: 0,
        duration: 0,
        error: null,
      });
      await native.playQueue({
        queue: tracks.map((t) => ({
          id: t.id,
          title: t.title,
          subtitle: t.subtitle ?? '',
          url: t.url,
          category: t.category,
          isLive: Boolean(t.isLive),
        })),
        startIndex: idx,
        category: resolvedCategory,
      });
      return;
    }

    this.state = {
      ...this.state,
      category: resolvedCategory,
      queue: tracks,
    };
    await this.startWebTrack(idx);
  }

  async playSingle(track: AudioTrack): Promise<void> {
    await this.playQueue([track], 0, track.category);
  }

  async pause(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.pause();
      return;
    }
    if (this.audioEl && !this.audioEl.paused) {
      this.audioEl.pause();
    }
    if (this.state.status === 'playing' || this.state.status === 'loading') {
      this.setState({ ...this.state, status: 'paused' });
      this.updateWebMediaSessionPlaybackState();
    }
  }

  async resume(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.resume();
      return;
    }
    if (!this.state.currentTrack) return;
    if (!this.audioEl || this.state.status === 'error' || this.state.currentTrack.isLive) {
      await this.startWebTrack(Math.max(0, this.state.currentIndex));
      return;
    }
    try {
      await this.audioEl.play();
      this.setState({ ...this.state, status: 'playing', error: null });
      this.updateWebMediaSessionPlaybackState();
    } catch {
      this.setState({ ...this.state, status: 'error', error: 'تعذر استئناف التشغيل الصوتي.' });
    }
  }

  async togglePlayPause(): Promise<void> {
    if (this.state.status === 'playing' || this.state.status === 'loading') {
      await this.pause();
    } else if (this.state.status === 'paused' || this.state.status === 'error') {
      await this.resume();
    }
  }

  async next(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.next();
      return;
    }
    if (this.state.currentIndex + 1 < this.state.queue.length) {
      await this.startWebTrack(this.state.currentIndex + 1);
    }
  }

  async previous(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.previous();
      return;
    }
    if (this.audioEl && this.audioEl.currentTime > 4) {
      this.audioEl.currentTime = 0;
      this.setState({ ...this.state, currentTime: 0 });
      return;
    }
    if (this.state.currentIndex > 0) {
      await this.startWebTrack(this.state.currentIndex - 1);
    }
  }

  async seekTo(positionSec: number): Promise<void> {
    const track = this.state.currentTrack;
    if (!track || track.isLive) return;
    const clamped = Math.max(0, positionSec);
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.seekTo({ positionSec: clamped });
      return;
    }
    if (this.audioEl && Number.isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.min(clamped, this.audioEl.duration);
      this.setState({ ...this.state, currentTime: this.audioEl.currentTime });
    }
  }

  async stop(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.stop();
    }
    this.clearSleepTimer();
    this.webLoadToken += 1;
    this.destroyWebAudio();
    this.clearWebMediaSession();
    this.setState({ ...INITIAL_STATE });
  }

  /** Sleep timer: stop playback after `minutes`. 0 = cancel. */
  async setSleepTimer(minutes: number): Promise<{ minutes: number }> {
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      return native.setSleepTimer({ minutes });
    }
    this.clearSleepTimer();
    if (minutes > 0) {
      this.sleepTimerHandle = globalThis.setTimeout(() => {
        this.sleepTimerHandle = null;
        void this.stop();
      }, minutes * 60 * 1000);
    }
    return { minutes };
  }

  private clearSleepTimer() {
    if (this.sleepTimerHandle != null) {
      globalThis.clearTimeout(this.sleepTimerHandle);
      this.sleepTimerHandle = null;
    }
  }

  private destroyHls() {
    if (this.hlsInstance) {
      try {
        this.hlsInstance.destroy();
      } catch { /* ignore */ }
      this.hlsInstance = null;
    }
  }

  private destroyWebAudio() {
    this.destroyHls();
    if (this.audioEl) {
      try {
        this.audioEl.pause();
        this.audioEl.removeAttribute('src');
        this.audioEl.load();
      } catch { /* ignore */ }
      this.audioEl = null;
    }
  }

  private async startWebTrack(index: number): Promise<void> {
    const queue = this.state.queue;
    if (index < 0 || index >= queue.length) {
      await this.stop();
      return;
    }
    if (typeof Audio === 'undefined') return;

    const track = queue[index];
    const token = ++this.webLoadToken;
    this.destroyWebAudio();

    const audio = new Audio();
    audio.preload = 'auto';
    this.audioEl = audio;

    this.setState({
      status: 'loading',
      category: track.category,
      queue,
      currentIndex: index,
      currentTrack: track,
      currentTime: 0,
      duration: 0,
      error: null,
    });

    this.installWebMediaSession(track);

    audio.addEventListener('playing', () => {
      if (token !== this.webLoadToken) return;
      this.setState({
        ...this.state,
        status: 'playing',
        error: null,
      });
      this.updateWebMediaSessionPlaybackState();
    });

    audio.addEventListener('pause', () => {
      if (token !== this.webLoadToken) return;
      if (!audio.ended && this.state.status === 'playing') {
        this.setState({ ...this.state, status: 'paused' });
        this.updateWebMediaSessionPlaybackState();
      }
    });

    audio.addEventListener('timeupdate', () => {
      if (token !== this.webLoadToken || track.isLive) return;
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const cur = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      if (Math.abs(cur - this.state.currentTime) >= 0.4 || dur !== this.state.duration) {
        this.setState({ ...this.state, currentTime: cur, duration: dur });
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      if (token !== this.webLoadToken || track.isLive) return;
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      this.setState({ ...this.state, duration: dur });
    });

    audio.addEventListener('ended', () => {
      if (token !== this.webLoadToken) return;
      if (track.isLive) {
        void this.startWebTrack(index);
      } else if (index + 1 < this.state.queue.length) {
        void this.startWebTrack(index + 1);
      } else {
        void this.stop();
      }
    });

    audio.addEventListener('error', () => {
      if (token !== this.webLoadToken) return;
      this.setState({
        ...this.state,
        status: 'error',
        error: 'تعذر تشغيل الصوت. تحقق من الاتصال بالإنترنت.',
      });
      this.updateWebMediaSessionPlaybackState();
    });

    try {
      if (isHlsUrl(track.url)) {
        const { default: Hls } = await import('hls.js');
        if (token !== this.webLoadToken) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
          this.hlsInstance = hls as unknown as HlsInstance;
          hls.loadSource(track.url);
          hls.attachMedia(audio);
          hls.on(Hls.Events.ERROR, (_ev, data) => {
            if (token !== this.webLoadToken || !data.fatal) return;
            this.setState({
              ...this.state,
              status: 'error',
              error: 'تعذر تشغيل البث المباشر حاليًا.',
            });
          });
        } else {
          audio.src = track.url;
        }
      } else {
        audio.src = track.url;
      }
      await audio.play();
    } catch {
      if (token !== this.webLoadToken) return;
      this.setState({
        ...this.state,
        status: 'error',
        error: 'تعذر تشغيل الصوت. اضغط للمحاولة مرة أخرى.',
      });
      this.updateWebMediaSessionPlaybackState();
    }
  }

  private installWebMediaSession(track: AudioTrack) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      if (typeof MediaMetadata !== 'undefined') {
        ms.metadata = new MediaMetadata({
          title: track.title,
          artist: track.subtitle || (track.category === 'azkar' ? 'أذكار المسلم' : track.category === 'haramain' ? 'بث الحرمين المباشر' : 'القرآن الكريم'),
          album: 'الربانيون',
          artwork: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        });
      }
      ms.setActionHandler('play', () => { void this.resume(); });
      ms.setActionHandler('pause', () => { void this.pause(); });
      ms.setActionHandler('stop', () => { void this.stop(); });
      ms.setActionHandler('previoustrack', this.state.queue.length > 1 && !track.isLive ? () => { void this.previous(); } : null);
      ms.setActionHandler('nexttrack', this.state.queue.length > 1 && !track.isLive ? () => { void this.next(); } : null);
      ms.setActionHandler('seekto', !track.isLive ? (details) => {
        if (typeof details.seekTime === 'number') void this.seekTo(details.seekTime);
      } : null);
    } catch { /* ignore unsupported MediaSession fields */ }
  }

  private updateWebMediaSessionPlaybackState() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState =
        this.state.status === 'playing' || this.state.status === 'loading'
          ? 'playing'
          : this.state.status === 'paused'
            ? 'paused'
            : 'none';
    } catch { /* ignore */ }
  }

  private clearWebMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch { /* ignore */ }
  }
}

export const backgroundAudio = new BackgroundAudioEngine();
