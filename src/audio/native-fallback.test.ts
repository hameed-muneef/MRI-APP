import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundAudioPluginInterface, NativeAudioStateSnapshot } from './native-bridge';
import type { AudioTrack } from './types';
import { audioUrl } from '../quran/audio';
import { normalizeQuranAudioUrl } from '../quran/ayah-audio';

let listenerCb: ((state: NativeAudioStateSnapshot) => void) | null = null;

const mockPlugin: BackgroundAudioPluginInterface = {
  playQueue: vi.fn(async () => ({ started: true })),
  playSingle: vi.fn(async () => {}),
  setPlaybackRate:vi.fn(async()=>{}),
  pause: vi.fn(async () => {}),
  resume: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  next: vi.fn(async () => {}),
  previous: vi.fn(async () => {}),
  seekTo: vi.fn(async () => {}),
  getState: vi.fn(async (): Promise<NativeAudioStateSnapshot> => ({
    status: 'idle',
    category: null,
    currentIndex: -1,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    error: null,
    queueLength: 0,
  })),
  setSleepTimer: vi.fn(async ({ minutes }: { minutes: number }) => ({ minutes })),
  diagnosticInfo: vi.fn(async () => ({
    status: 'idle' as const,
    category: null,
    currentIndex: -1,
    currentTrack: null,
    currentTime: 0,
    duration: 0,
    error: null,
    queueLength: 0,
  })),
  testAdhanNotification: vi.fn(async () => ({ scheduled: true })),
  openAdhanChannelSettings: vi.fn(async () => ({ opened: true })),
  addListener: vi.fn(async (_event: 'stateChange', cb: (state: NativeAudioStateSnapshot) => void) => {
    listenerCb = cb;
    return { remove: async () => {} };
  }),
};

vi.mock('./native-bridge', () => ({
  isNativeBackgroundAudioSupported: () => true,
  getNativeBackgroundAudioPlugin: () => mockPlugin,
}));

let origAudio: typeof Audio;
let hadWindow = false;

beforeEach(() => {
  vi.clearAllMocks();
  listenerCb = null;
  hadWindow = typeof window !== 'undefined';
  if (!hadWindow) {
    (globalThis as unknown as { window: unknown }).window = globalThis;
  }
  origAudio = globalThis.Audio;
  globalThis.Audio = function FakeWebAudio() {
    const listeners: Record<string, Array<() => void>> = {};
    const a: Record<string, unknown> = {
      src: '',
      currentTime: 0,
      duration: 90,
      paused: false,
      preload: 'auto',
      addEventListener: vi.fn((ev: string, fn: () => void) => {
        listeners[ev] = listeners[ev] || [];
        listeners[ev].push(fn);
      }),
      pause: vi.fn(() => {
        a.paused = true;
        (listeners['pause'] || []).forEach((fn) => fn());
      }),
      load: vi.fn(),
      removeAttribute: vi.fn(),
      play: vi.fn(async () => {
        a.paused = false;
        (listeners['playing'] || []).forEach((fn) => fn());
      }),
    };
    return a as unknown as HTMLAudioElement;
  } as unknown as typeof Audio;
});

afterEach(() => {
  globalThis.Audio = origAudio;
  if (!hadWindow) {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});

describe('native audio fallback to WebView HTMLAudioElement', () => {
  it('falls back to WebView audio when native service reports an error and routes controls to web', async () => {
    vi.resetModules();
    const { backgroundAudio } = await import('./background-player');
    await Promise.resolve();

    const tracks: AudioTrack[] = [
      {
        id: 'azkar:ar:1:1',
        title: 'أذكار الصباح',
        url: 'https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/audio/75.mp3',
        category: 'azkar',
      },
      {
        id: 'azkar:ar:1:2',
        title: 'أذكار الصباح 2',
        url: 'https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/audio/76.mp3',
        category: 'azkar',
      },
    ];

    await backgroundAudio.playQueue(tracks, 0, 'azkar');
    expect(mockPlugin.playQueue).toHaveBeenCalledTimes(1);
    expect(listenerCb).not.toBeNull();

    // Simulate native MediaPlayer failing on device
    listenerCb!({
      status: 'error',
      category: 'azkar',
      currentIndex: 0,
      currentTrack: tracks[0],
      currentTime: 0,
      duration: 0,
      error: 'تعذر تحميل المقطع الصوتي.',
      queueLength: 2,
    });

    // Allow microtasks from dynamic web playback start()
    await new Promise((r) => setTimeout(r, 10));

    expect(mockPlugin.stop).toHaveBeenCalled();
    expect(backgroundAudio.getState().status).toBe('playing');
    expect(backgroundAudio.getState().error).toBeNull();

    // Controls during Web fallback should NOT call native pause/next
    await backgroundAudio.pause();
    expect(mockPlugin.pause).not.toHaveBeenCalled();
    expect(backgroundAudio.getState().status).toBe('paused');

    await backgroundAudio.next();
    expect(mockPlugin.next).not.toHaveBeenCalled();
    expect(backgroundAudio.getState().currentIndex).toBe(1);

    await backgroundAudio.stop();
    expect(backgroundAudio.getState().status).toBe('idle');
  });

  it('falls back immediately if native.playQueue throws an exception', async () => {
    vi.resetModules();
    vi.mocked(mockPlugin.playQueue).mockRejectedValueOnce(new Error('TransactionTooLargeException'));
    const { backgroundAudio } = await import('./background-player');

    await backgroundAudio.playSingle({
      id: 'quran:1:1',
      title: 'الفاتحة',
      url: 'https://download.quranicaudio.com/qdc/mishari_al_afasy/murattal/1.mp3',
      category: 'quran',
    });

    expect(backgroundAudio.getState().status).toBe('playing');
    expect(backgroundAudio.getState().error).toBeNull();
  });

  it('plays Web-only blob URLs directly in WebView without calling native playQueue', async () => {
    vi.resetModules();
    const { backgroundAudio } = await import('./background-player');

    await backgroundAudio.playSingle({
      id: 'custom:1',
      title: 'أذان مخصص',
      url: 'blob:https://localhost/custom-audio',
      category: 'quran',
    });

    expect(mockPlugin.playQueue).not.toHaveBeenCalled();
    expect(backgroundAudio.getState().status).toBe('playing');
    expect(backgroundAudio.getState().error).toBeNull();
  });

  it('retries automatically with fallback CDN mirror when primary URL fails in WebView', async () => {
    vi.resetModules();
    let attempt = 0;
    globalThis.Audio = function FailFirstAudio() {
      const listeners: Record<string, Array<() => void>> = {};
      const a: Record<string, unknown> = {
        src: '',
        currentTime: 0,
        duration: 42,
        paused: false,
        preload: 'auto',
        addEventListener: vi.fn((ev: string, fn: () => void) => {
          listeners[ev] = listeners[ev] || [];
          listeners[ev].push(fn);
        }),
        pause: vi.fn(),
        load: vi.fn(),
        removeAttribute: vi.fn(),
        play: vi.fn(async () => {
          attempt += 1;
          if (attempt === 1) {
            (listeners['error'] || []).forEach((fn) => fn());
            throw new Error('Failed primary source');
          }
          (listeners['playing'] || []).forEach((fn) => fn());
        }),
      };
      return a as unknown as HTMLAudioElement;
    } as unknown as typeof Audio;

    vi.mocked(mockPlugin.playQueue).mockRejectedValueOnce(new Error('Native offline/error'));
    const { backgroundAudio } = await import('./background-player');

    await backgroundAudio.playSingle({
      id: 'azkar:ar:27:1',
      title: 'أذكار الصباح',
      url: 'https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/audio/75.mp3',
      category: 'azkar',
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(attempt).toBe(2);
    expect(backgroundAudio.getState().status).toBe('playing');
    expect(backgroundAudio.getState().error).toBeNull();
  });
});

describe('Quran audio URL normalization', () => {
  it('normalizes trailing slashes in mp3quran server URLs', () => {
    const moshaf = { id: 1, name: 'حفص', server: 'https://cdn.mp3quran.net/audio/afs', surahTotal: 114, surahList: [1] };
    expect(audioUrl(moshaf, 1)).toBe('https://cdn.mp3quran.net/audio/afs/001.mp3');
    expect(audioUrl({ ...moshaf, server: 'https://cdn.mp3quran.net/audio/afs///' }, 2)).toBe('https://cdn.mp3quran.net/audio/afs/002.mp3');
  });

  it('normalizes protocol-relative, relative, and full Quran.com URLs', () => {
    expect(normalizeQuranAudioUrl('//download.quranicaudio.com/qdc/mishari/1.mp3')).toBe('https://download.quranicaudio.com/qdc/mishari/1.mp3');
    expect(normalizeQuranAudioUrl('Alafasy/mp3/001001.mp3')).toBe('https://verses.quran.com/Alafasy/mp3/001001.mp3');
    expect(normalizeQuranAudioUrl('/qdc/mishari/1.mp3', 'https://download.quranicaudio.com/')).toBe('https://download.quranicaudio.com/qdc/mishari/1.mp3');
    expect(normalizeQuranAudioUrl('')).toBeNull();
  });
});
