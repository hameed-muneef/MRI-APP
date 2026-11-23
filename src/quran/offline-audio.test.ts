import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reciter, ReciterMoshaf } from './audio';
import {
  deleteReciterAudioPack,
  deleteSingleSurahOffline,
  downloadReciterAudioPack,
  getOfflineAudioPack,
  getSelectedReciterPref,
  isSurahOfflineDownloaded,
  listOfflineAudioPacks,
  OFFLINE_AUDIO_CACHE_NAME,
  offlineTrackId,
  saveSelectedReciterPref,
  totalOfflineAudioBytes,
} from './offline-audio';

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const mock = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true, writable: true });
  return store;
}

const SAMPLE_MOSHAF: ReciterMoshaf = {
  id: 9201,
  name: 'حفص عن عاصم - مرتل',
  server: 'https://cdn.example.com/yasser/',
  surahTotal: 114,
  surahList: Array.from({ length: 114 }, (_, i) => i + 1),
};

const SAMPLE_RECITER: Reciter = {
  id: 92,
  name: 'ياسر الدوسري',
  letter: 'ي',
  moshaf: [SAMPLE_MOSHAF],
  famous: true,
};

describe('quran/offline-audio manager', () => {
  let origFetch: typeof globalThis.fetch;
  let origCaches: CacheStorage | undefined;

  beforeEach(() => {
    installMemoryLocalStorage();
    origFetch = globalThis.fetch;
    origCaches = globalThis.caches;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origCaches !== undefined) {
      Object.defineProperty(globalThis, 'caches', { value: origCaches, configurable: true, writable: true });
    } else {
      delete (globalThis as { caches?: CacheStorage }).caches;
    }
    vi.restoreAllMocks();
  });

  it('builds consistent offline track identifiers', () => {
    expect(offlineTrackId(9201, 1)).toBe('quran:reciter:9201:s:001');
    expect(offlineTrackId(9201, 114)).toBe('quran:reciter:9201:s:114');
  });

  it('migrates legacy quran-reciter-id and persists new selected reciter preference', () => {
    localStorage.setItem('quran-reciter-id', '7');
    expect(getSelectedReciterPref()).toEqual({ reciterId: 123, moshafId: 0 });

    saveSelectedReciterPref({
      reciterId: 92,
      moshafId: 9201,
      reciterName: 'ياسر الدوسري',
      moshafName: 'حفص عن عاصم - مرتل',
    });
    expect(getSelectedReciterPref()?.reciterId).toBe(92);
    expect(getSelectedReciterPref()?.moshafId).toBe(9201);
  });

  it('downloads chapters to Web Cache Storage, resumes partial batches cleanly, and deletes packs', async () => {
    const cacheEntries = new Map<string, Response>();
    const fakeCache = {
      put: vi.fn(async (req: RequestInfo | URL, res: Response) => {
        cacheEntries.set(String(req), res);
      }),
      delete: vi.fn(async (req: RequestInfo | URL) => cacheEntries.delete(String(req))),
      match: vi.fn(async (req: RequestInfo | URL) => cacheEntries.get(String(req))),
    };
    const fakeCaches = {
      open: vi.fn(async (name: string) => {
        expect(name).toBe(OFFLINE_AUDIO_CACHE_NAME);
        return fakeCache as unknown as Cache;
      }),
    };
    Object.defineProperty(globalThis, 'caches', { value: fakeCaches, configurable: true, writable: true });

    const payload = new Uint8Array(1024).fill(7);
    const controller = new AbortController();
    let fetchCalls = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls += 1;
      const url = String(input);
      if (url.endsWith('/113.mp3')) {
        controller.abort();
      }
      return new Response(payload, {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }) as unknown as typeof fetch;

    const progressUpdates: number[] = [];
    await expect(
      downloadReciterAudioPack({
        reciter: SAMPLE_RECITER,
        moshaf: SAMPLE_MOSHAF,
        chapters: [112, 113, 114],
        signal: controller.signal,
        onProgress: p => progressUpdates.push(p.completedCount),
      }),
    ).rejects.toThrow();

    // 112 completed before 113 triggered abort
    expect(isSurahOfflineDownloaded(9201, 112)).toBe(true);
    expect(isSurahOfflineDownloaded(9201, 113)).toBe(false);
    expect(progressUpdates).toContain(1);

    // Resume the same batch without re-downloading 112
    fetchCalls = 0;
    const controller2 = new AbortController();
    const pack = await downloadReciterAudioPack({
      reciter: SAMPLE_RECITER,
      moshaf: SAMPLE_MOSHAF,
      chapters: [112, 113, 114],
      signal: controller2.signal,
      onProgress: () => {},
    });

    expect(fetchCalls).toBe(2); // only 113 and 114 fetched
    expect(pack.chapters).toEqual([112, 113, 114]);
    expect(totalOfflineAudioBytes()).toBe(3072);
    expect(listOfflineAudioPacks().length).toBe(1);

    await deleteSingleSurahOffline(9201, 113);
    expect(getOfflineAudioPack(9201)?.chapters).toEqual([112, 114]);
    expect(totalOfflineAudioBytes()).toBe(2048);

    await deleteReciterAudioPack(9201);
    expect(getOfflineAudioPack(9201)).toBeUndefined();
    expect(totalOfflineAudioBytes()).toBe(0);
    expect(cacheEntries.size).toBe(0);
  });
});
