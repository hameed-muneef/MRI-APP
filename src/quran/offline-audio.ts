// محرك تنزيل تلاوات القراء للاستماع دون اتصال بالإنترنت:
// - على أندرويد (Capacitor): يحفظ الملفات مباشرة في التخزين الخاص للتطبيق عبر BackgroundAudioPlugin
//   لتشغيلها من الخدمة الخلفية حتى عند إغلاق الشاشة وانقطاع الإنترنت.
// - على الويب / PWA: يحفظ الملفات في Cache Storage ('rabbani-quran-audio-v1') للتشغيل دون إنترنت.

import { getNativeBackgroundAudioPlugin } from '../audio/native-bridge';
import { audioUrl, type Reciter, type ReciterMoshaf } from './audio';

export const OFFLINE_AUDIO_CACHE_NAME = 'rabbani-quran-audio-v1';
const META_STORAGE_KEY = 'rabbani-quran-offline-audio-v1';
const SELECTED_RECITER_KEY = 'rabbani-quran-selected-reciter-v1';
const LEGACY_RECITER_ID_KEY = 'quran-reciter-id';

const LEGACY_QURANCOM_TO_MP3QURAN: Record<number, {reciterId: number; preferMoshafHint?: string}> = {
  7: {reciterId: 123}, // مشاري العفاسي
  3: {reciterId: 54},  // عبدالرحمن السديس
  4: {reciterId: 4},   // أبو بكر الشاطري
  5: {reciterId: 89},  // هاني الرفاعي
  10: {reciterId: 31}, // سعود الشريم
  11: {reciterId: 106}, // محمد الطبلاوي
  2: {reciterId: 51},  // عبدالباسط (مرتل)
  1: {reciterId: 51, preferMoshafHint: 'مجود'}, // عبدالباسط (مجود)
  6: {reciterId: 118}, // الحصري
  12: {reciterId: 118, preferMoshafHint: 'معلم'}, // الحصري (معلم)
  9: {reciterId: 112}, // المنشاوي (مرتل)
  8: {reciterId: 112, preferMoshafHint: 'مجود'}, // المنشاوي (مجود)
};

export type SelectedReciterPref = {
  reciterId: number;
  moshafId: number;
  reciterName?: string;
  moshafName?: string;
};

export type OfflineAudioPack = {
  moshafId: number;
  reciterId: number;
  reciterName: string;
  moshafName: string;
  server: string;
  chapters: number[];
  bytes: number;
  surahBytes: Record<number, number>;
  updatedAt: string;
};

export type AudioDownloadProgress = {
  pack: OfflineAudioPack;
  completedCount: number;
  totalCount: number;
  currentSurah: number;
};

export type DownloadAudioRequest = {
  reciter: Reciter;
  moshaf: ReciterMoshaf;
  chapters: number[];
  signal: AbortSignal;
  onProgress: (progress: AudioDownloadProgress) => void;
};

export function offlineTrackId(moshafId: number, surah: number): string {
  return `quran:reciter:${moshafId}:s:${String(surah).padStart(3, '0')}`;
}

export function getSelectedReciterPref(): SelectedReciterPref | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(SELECTED_RECITER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SelectedReciterPref>;
      if (Number.isFinite(parsed?.reciterId) && Number.isFinite(parsed?.moshafId)) {
        return {
          reciterId: Number(parsed.reciterId),
          moshafId: Number(parsed.moshafId),
          reciterName: parsed.reciterName,
          moshafName: parsed.moshafName,
        };
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_RECITER_ID_KEY);
    if (legacyRaw) {
      const legacyId = Number(legacyRaw);
      const mapped = LEGACY_QURANCOM_TO_MP3QURAN[legacyId];
      if (mapped) {
        return {reciterId: mapped.reciterId, moshafId: 0};
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function saveSelectedReciterPref(pref: SelectedReciterPref): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SELECTED_RECITER_KEY, JSON.stringify(pref));
  } catch { /* ignore */ }
}

function readAllPacksMap(): Record<number, OfflineAudioPack> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, OfflineAudioPack>;
    const clean: Record<number, OfflineAudioPack> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      const id = Number(k);
      if (Number.isFinite(id) && v && Array.isArray(v.chapters)) {
        clean[id] = {
          ...v,
          moshafId: id,
          chapters: [...new Set(v.chapters.filter(n => Number.isFinite(n) && n >= 1 && n <= 114))].sort((a, b) => a - b),
          bytes: Number.isFinite(v.bytes) ? v.bytes : 0,
          surahBytes: v.surahBytes ?? {},
        };
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function writeAllPacksMap(map: Record<number, OfflineAudioPack>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

export function listOfflineAudioPacks(): OfflineAudioPack[] {
  return Object.values(readAllPacksMap()).sort((a, b) => b.chapters.length - a.chapters.length);
}

export function getOfflineAudioPack(moshafId: number): OfflineAudioPack | undefined {
  return readAllPacksMap()[moshafId];
}

export function isSurahOfflineDownloaded(moshafId: number, surah: number): boolean {
  const pack = readAllPacksMap()[moshafId];
  return Boolean(pack && pack.chapters.includes(surah));
}

export function totalOfflineAudioBytes(): number {
  return listOfflineAudioPacks().reduce((sum, p) => sum + (p.bytes || 0), 0);
}

export function saveOfflineAudioPackMeta(pack: OfflineAudioPack): void {
  const map = readAllPacksMap();
  map[pack.moshafId] = pack;
  writeAllPacksMap(map);
}

export async function deleteReciterAudioPack(moshafId: number): Promise<void> {
  const map = readAllPacksMap();
  const pack = map[moshafId];

  const native = getNativeBackgroundAudioPlugin();
  if (native?.deleteOfflineAudio) {
    try {
      await native.deleteOfflineAudio({prefix: `quran:reciter:${moshafId}:`});
    } catch { /* ignore */ }
  }

  if (typeof caches !== 'undefined' && pack) {
    try {
      const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
      const fakeMoshaf: ReciterMoshaf = {
        id: pack.moshafId,
        name: pack.moshafName,
        server: pack.server,
        surahTotal: 114,
        surahList: pack.chapters,
      };
      for (const ch of pack.chapters) {
        await cache.delete(audioUrl(fakeMoshaf, ch));
      }
    } catch { /* ignore */ }
  }

  delete map[moshafId];
  writeAllPacksMap(map);
}

export async function deleteSingleSurahOffline(moshafId: number, surah: number): Promise<void> {
  const map = readAllPacksMap();
  const pack = map[moshafId];
  if (!pack) return;

  const native = getNativeBackgroundAudioPlugin();
  if (native?.deleteOfflineAudio) {
    try {
      await native.deleteOfflineAudio({id: offlineTrackId(moshafId, surah)});
    } catch { /* ignore */ }
  }

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
      const fakeMoshaf: ReciterMoshaf = {
        id: pack.moshafId,
        name: pack.moshafName,
        server: pack.server,
        surahTotal: 114,
        surahList: pack.chapters,
      };
      await cache.delete(audioUrl(fakeMoshaf, surah));
    } catch { /* ignore */ }
  }

  const removedBytes = pack.surahBytes[surah] ?? 0;
  delete pack.surahBytes[surah];
  pack.chapters = pack.chapters.filter(c => c !== surah);
  pack.bytes = Math.max(0, pack.bytes - removedBytes);
  pack.updatedAt = new Date().toISOString();

  if (pack.chapters.length === 0) delete map[moshafId];
  else map[moshafId] = pack;
  writeAllPacksMap(map);
}

async function downloadSurahToWebCache(url: string, signal: AbortSignal): Promise<number> {
  if (typeof caches === 'undefined') {
    throw new Error('التخزين المحلي للصوت غير مدعوم في هذا المتصفح.');
  }
  const res = await fetch(url, {signal});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) {
    throw new Error('استجابة غير صالحة للملف الصوتي.');
  }
  const cloneForCache = res.clone();
  const blob = await res.blob();
  if (signal.aborted) throw new DOMException('أُوقف التنزيل', 'AbortError');
  if (blob.size <= 128) throw new Error('ملف صوتي فارغ.');

  const cache = await caches.open(OFFLINE_AUDIO_CACHE_NAME);
  await cache.put(url, cloneForCache);
  return blob.size;
}

/**
 * تنزيل قائمة سور لقارئ ورواية محددين مع إمكانية الإيقاف والاستئناف.
 */
export async function downloadReciterAudioPack({
  reciter,
  moshaf,
  chapters,
  signal,
  onProgress,
}: DownloadAudioRequest): Promise<OfflineAudioPack> {
  const native = getNativeBackgroundAudioPlugin();
  const availableSet = new Set(moshaf.surahList);
  const targets = [...new Set(chapters)]
    .filter(ch => ch >= 1 && ch <= 114 && availableSet.has(ch))
    .sort((a, b) => a - b);

  const existing = getOfflineAudioPack(moshaf.id);
  const pack: OfflineAudioPack = existing
    ? {
        ...existing,
        reciterId: reciter.id,
        reciterName: reciter.name,
        moshafName: moshaf.name,
        server: moshaf.server,
        surahBytes: {...existing.surahBytes},
        chapters: [...existing.chapters],
      }
    : {
        moshafId: moshaf.id,
        reciterId: reciter.id,
        reciterName: reciter.name,
        moshafName: moshaf.name,
        server: moshaf.server,
        chapters: [],
        bytes: 0,
        surahBytes: {},
        updatedAt: new Date().toISOString(),
      };

  const onAbort = () => {
    if (native?.cancelOfflineDownloads) {
      void native.cancelOfflineDownloads().catch(() => {});
    }
  };
  signal.addEventListener('abort', onAbort, {once: true});

  try {
    let completedInBatch = targets.filter(ch => pack.chapters.includes(ch)).length;
    onProgress({pack: {...pack}, completedCount: completedInBatch, totalCount: targets.length, currentSurah: targets[0] ?? 1});

    for (const surah of targets) {
      if (signal.aborted) throw new DOMException('أُوقف التنزيل', 'AbortError');
      if (pack.chapters.includes(surah)) continue;

      const url = audioUrl(moshaf, surah);
      const trackId = offlineTrackId(moshaf.id, surah);

      let bytes = 0;
      if (native?.downloadOfflineAudio) {
        const res = await native.downloadOfflineAudio({id: trackId, url});
        bytes = Number(res?.bytes ?? 0);
      } else {
        bytes = await downloadSurahToWebCache(url, signal);
      }

      if (signal.aborted) throw new DOMException('أُوقف التنزيل', 'AbortError');

      if (!pack.chapters.includes(surah)) {
        pack.chapters.push(surah);
        pack.chapters.sort((a, b) => a - b);
      }
      pack.surahBytes[surah] = bytes;
      pack.bytes = Object.values(pack.surahBytes).reduce((sum, b) => sum + b, 0);
      pack.updatedAt = new Date().toISOString();
      saveOfflineAudioPackMeta(pack);

      completedInBatch += 1;
      onProgress({pack: {...pack}, completedCount: completedInBatch, totalCount: targets.length, currentSurah: surah});
    }

    return pack;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
