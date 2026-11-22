import { getNativeBackgroundAudioPlugin, type NativeAudioStateSnapshot } from './native-bridge';
import type { AudioCategory, AudioPlayerState, AudioTrack } from './types';
import {
  expandAudioFallbackUrls,
  isBundledWebAssetUrl,
  isLocalOrBundledAudioUrl,
  isWebOnlyAudioUrl,
  loadLocalAudioObjectUrlForWebView,
  resolveAudioUrlForNative,
  resolveAudioUrlForWeb,
} from './url-resolver';

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
  private usingWebFallback = false;
  private nativeFallbackAttemptKey: string | null = null;
  private activeWebBlobRevoke: (() => void) | null = null;

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
    if ((this.usingWebFallback || this.audioEl) && (snap.status === 'idle' || snap.status === 'error')) {
      return;
    }

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

    if (snap.status === 'error' && track?.url) {
      const attemptKey = `${idx}:${track.id}:${track.url}`;
      const canTryWeb = isLocalOrBundledAudioUrl(track.url) || typeof navigator === 'undefined' || navigator.onLine !== false;
      if (canTryWeb && this.nativeFallbackAttemptKey !== attemptKey && typeof Audio !== 'undefined') {
        this.nativeFallbackAttemptKey = attemptKey;
        this.usingWebFallback = true;
        const fallbackQueue = this.state.queue.length > 0 ? this.state.queue : [track];
        const fallbackIdx = idx >= 0 && idx < fallbackQueue.length ? idx : 0;
        this.state = {
          ...this.state,
          category: snap.category ?? track.category ?? this.state.category,
          queue: fallbackQueue,
        };
        void getNativeBackgroundAudioPlugin()?.stop().catch(() => {});
        void this.startWebTrack(fallbackIdx);
        return;
      }
    }

    if (snap.status === 'playing') {
      this.usingWebFallback = false;
      this.nativeFallbackAttemptKey = null;
    }

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
    const sanitizedTracks: AudioTrack[] = tracks.map((t) => {
      const safeWeb = resolveAudioUrlForWeb(t.url) ?? t.url;
      const expandedWeb = expandAudioFallbackUrls(t.url, t.fallbackUrls, 'web');
      return {
        ...t,
        url: safeWeb,
        fallbackUrls: expandedWeb.slice(1),
      };
    });
    const idx = Math.max(0, Math.min(startIndex, sanitizedTracks.length - 1));
    const resolvedCategory = category ?? sanitizedTracks[idx].category;

    this.usingWebFallback = false;
    this.nativeFallbackAttemptKey = null;

    const hasWebOnlyTrack = sanitizedTracks.some((t) => isWebOnlyAudioUrl(t.url) || !resolveAudioUrlForNative(t.url));
    const native = !hasWebOnlyTrack ? getNativeBackgroundAudioPlugin() : null;
    if (native) {
      this.destroyWebAudio();
      this.setState({
        status: 'loading',
        category: resolvedCategory,
        queue: sanitizedTracks,
        currentIndex: idx,
        currentTrack: sanitizedTracks[idx],
        currentTime: 0,
        duration: 0,
        error: null,
      });
      try {
        await native.playQueue({
          queue: sanitizedTracks.map((t, i) => {
            const orig = tracks[i] ?? t;
            const nativeCandidates = expandAudioFallbackUrls(orig.url, orig.fallbackUrls, 'native');
            return {
              id: t.id,
              title: t.title,
              subtitle: t.subtitle ?? '',
              url: nativeCandidates[0] ?? resolveAudioUrlForNative(orig.url) ?? t.url,
              fallbackUrls: nativeCandidates.slice(1),
              category: t.category,
              isLive: Boolean(t.isLive),
            };
          }),
          startIndex: idx,
          category: resolvedCategory,
        });
        return;
      } catch {
        this.usingWebFallback = true;
      }
    }

    this.state = {
      ...this.state,
      category: resolvedCategory,
      queue: sanitizedTracks,
    };
    await this.startWebTrack(idx);
  }

  async playSingle(track: AudioTrack): Promise<void> {
    await this.playQueue([track], 0, track.category);
  }

  async pause(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native && !this.usingWebFallback && !this.audioEl) {
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
    if (native && !this.usingWebFallback && !this.audioEl) {
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
    if (native && !this.usingWebFallback && !this.audioEl) {
      await native.next();
      return;
    }
    if (this.state.currentIndex + 1 < this.state.queue.length) {
      await this.startWebTrack(this.state.currentIndex + 1);
    }
  }

  async previous(): Promise<void> {
    const native = getNativeBackgroundAudioPlugin();
    if (native && !this.usingWebFallback && !this.audioEl) {
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
    if (native && !this.usingWebFallback && !this.audioEl) {
      await native.seekTo({ positionSec: clamped });
      return;
    }
    if (this.audioEl && Number.isFinite(this.audioEl.duration)) {
      this.audioEl.currentTime = Math.min(clamped, this.audioEl.duration);
      this.setState({ ...this.state, currentTime: this.audioEl.currentTime });
    }
  }

  async stop(): Promise<void> {
    this.usingWebFallback = false;
    this.nativeFallbackAttemptKey = null;
    const native = getNativeBackgroundAudioPlugin();
    if (native) {
      await native.stop().catch(() => {});
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
    if (native && !this.usingWebFallback && !this.audioEl) {
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

  private revokeWebBlobUrl() {
    if (this.activeWebBlobRevoke) {
      try { this.activeWebBlobRevoke(); } catch { /* ignore */ }
      this.activeWebBlobRevoke = null;
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
    this.revokeWebBlobUrl();
  }

  private async startWebTrack(index: number, candidateIndex = 0): Promise<void> {
    const queue = this.state.queue;
    if (index < 0 || index >= queue.length) {
      await this.stop();
      return;
    }
    if (typeof Audio === 'undefined') return;

    const track = queue[index];
    const token = ++this.webLoadToken;
    this.destroyWebAudio();

    const candidates = expandAudioFallbackUrls(track.url, track.fallbackUrls, 'web');
    const resolvedUrl = candidates[candidateIndex] ?? resolveAudioUrlForWeb(track.url);
    if (!resolvedUrl) {
      this.setState({
        status: 'error',
        category: track.category,
        queue,
        currentIndex: index,
        currentTrack: track,
        currentTime: 0,
        duration: 0,
        error: 'مسار الصوت غير صالح.',
      });
      this.updateWebMediaSessionPlaybackState();
      return;
    }

    const audio = new Audio();
    audio.preload = 'auto';
    this.audioEl = audio;

    if (candidateIndex === 0) {
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
    }

    let attemptSettled = false;
    const handleAttemptFailure = (reason?: unknown) => {
      if (attemptSettled || token !== this.webLoadToken) return;
      attemptSettled = true;
      if (candidateIndex + 1 < candidates.length) {
        void this.startWebTrack(index, candidateIndex + 1);
        return;
      }
      const errName = reason instanceof Error ? reason.name : '';
      const offline = !isLocalOrBundledAudioUrl(resolvedUrl) && typeof navigator !== 'undefined' && navigator.onLine === false;
      this.setState({
        ...this.state,
        status: 'error',
        error: offline
          ? 'لا يوجد اتصال بالإنترنت لتشغيل هذا المقطع.'
          : errName === 'NotAllowedError'
            ? 'اضغط زر التشغيل لبدء الاستماع.'
            : 'تعذر تحميل أو تشغيل الصوت. تحقق من الاتصال ثم أعد المحاولة.',
      });
      this.updateWebMediaSessionPlaybackState();
    };

    audio.addEventListener('playing', () => {
      if (token !== this.webLoadToken) return;
      attemptSettled = true;
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
      handleAttemptFailure();
    });

    try {
      let effectiveUrl = resolvedUrl;
      if (!isHlsUrl(effectiveUrl) && isBundledWebAssetUrl(effectiveUrl)) {
        const localBlob = await loadLocalAudioObjectUrlForWebView(effectiveUrl);
        if (token !== this.webLoadToken) {
          localBlob?.revoke();
          return;
        }
        if (localBlob) {
          this.activeWebBlobRevoke = localBlob.revoke;
          effectiveUrl = localBlob.url;
        }
      }

      if (isHlsUrl(effectiveUrl)) {
        const { default: Hls } = await import('hls.js');
        if (token !== this.webLoadToken) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 60 });
          this.hlsInstance = hls as unknown as HlsInstance;
          hls.loadSource(effectiveUrl);
          hls.attachMedia(audio);
          hls.on(Hls.Events.ERROR, (_ev, data) => {
            if (token !== this.webLoadToken || !data.fatal) return;
            handleAttemptFailure();
          });
        } else {
          audio.src = effectiveUrl;
        }
      } else {
        audio.src = effectiveUrl;
      }
      await audio.play();
    } catch (err) {
      handleAttemptFailure(err);
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
