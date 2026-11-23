// تلاوة على مستوى الآية (per-ayah) من Quran.com API v4 + EveryAyah.com
// يوفر روابط صوتية لكل آية على حدة لأكثر من 25 قارئًا مشهورًا،
// ويُستخدم إلى جانب تلاوة MP3Quran.net (244+ قارئًا على مستوى السورة).

export type AyahAudioResult = {verseKey: string; url: string};

const BASE_AUDIO = 'https://verses.quran.com/';
const CACHE = new Map<string, string>();

export type QuranComReciter = {id: number; name: string; style?: string | null};

export const QURAN_COM_RECITERS: QuranComReciter[] = [
  {id: 7, name: 'مشاري راشد العفاسي'},
  {id: 3, name: 'عبدالرحمن السديس'},
  {id: 4, name: 'أبو بكر الشاطرى'},
  {id: 5, name: 'هاني الرفاعي'},
  {id: 10, name: 'سعود الشريم'},
  {id: 11, name: 'محمد الطبلاوي'},
  {id: 2, name: 'عبد الباسط عبد الصمد (مرتل)'},
  {id: 1, name: 'عبد الباسط عبد الصمد (مجود)'},
  {id: 6, name: 'محمود خليل الحصري'},
  {id: 12, name: 'محمود خليل الحصري (معلم)'},
  {id: 9, name: 'محمد صديق المنشاوي (مرتل)'},
  {id: 8, name: 'محمد صديق المنشاوي (مجود)'},
];

export const DEFAULT_RECITATION_ID = 7;
export const DEFAULT_MP3QURAN_RECITER_ID = 123; // مشاري العفاسي

/**
 * ربط معرّف القارئ في MP3Quran.net بمعرّف Quran.com (إن وُجد) للآيات.
 */
const MP3QURAN_TO_QURANCOM_ID: Record<number, number> = {
  123: 7,  // مشاري العفاسي
  54: 3,   // عبدالرحمن السديس
  4: 4,    // أبو بكر الشاطري
  89: 5,   // هاني الرفاعي
  31: 10,  // سعود الشريم
  106: 11, // محمد الطبلاوي
  51: 2,   // عبدالباسط عبدالصمد (مرتل)
  118: 6,  // محمود خليل الحصري
  112: 9,  // محمد صديق المنشاوي (مرتل)
};

/**
 * مجلدات EveryAyah.com المعتمدة والمُتحقَّق منها لتلاوة الآيات لأشهر القراء الإضافيين.
 */
const MP3QURAN_TO_EVERYAYAH_FOLDER: Record<number, string> = {
  102: 'MaherAlMuaiqly128kbps',
  92: 'Yasser_Ad-Dussary_128kbps',
  86: 'Nasser_Alqatami_128kbps',
  30: 'Ghamadi_40kbps',
  5: 'Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net',
  81: 'Fares_Abbad_64kbps',
  109: 'Muhammad_Ayyoub_128kbps',
  74: 'Hudhaify_128kbps',
  76: 'Ali_Jaber_64kbps',
  111: 'Muhammad_Jibreel_128kbps',
  43: 'Salah_Al_Budair_128kbps',
  60: 'Abdullah_Basfar_192kbps',
  62: 'Abdullaah_3awwaad_Al-Juhaynee_128kbps',
  178: 'warsh/warsh_ibrahim_aldosary_128kbps',
};

export function everyAyahUrl(folder: string, surah: number, ayah: number): string {
  const s = String(surah).padStart(3, '0');
  const a = String(ayah).padStart(3, '0');
  return `https://everyayah.com/data/${folder}/${s}${a}.mp3`;
}

export type AyahReciterSource =
  | {kind: 'qurancom'; recitationId: number}
  | {kind: 'everyayah'; folder: string}
  | null;

export function resolveAyahSourceForMp3QuranReciter(mp3ReciterId: number, moshafName?: string): AyahReciterSource {
  // معالجة حالات المجود والمعلم لدى القراء الثلاثة الكبار
  if (mp3ReciterId === 51 && moshafName?.includes('مجود')) return {kind: 'qurancom', recitationId: 1};
  if (mp3ReciterId === 112 && moshafName?.includes('مجود')) return {kind: 'qurancom', recitationId: 8};
  if (mp3ReciterId === 118 && moshafName?.includes('معلم')) return {kind: 'qurancom', recitationId: 12};

  const qcId = MP3QURAN_TO_QURANCOM_ID[mp3ReciterId];
  if (qcId) return {kind: 'qurancom', recitationId: qcId};

  const folder = MP3QURAN_TO_EVERYAYAH_FOLDER[mp3ReciterId];
  if (folder) return {kind: 'everyayah', folder};

  return null;
}

export function normalizeQuranAudioUrl(raw: unknown, base = BASE_AUDIO): string | null {
  if (!raw) return null;
  let full = String(raw).trim();
  if (!full || /^(?:javascript|vbscript|data):/i.test(full)) return null;
  if (full.startsWith('//')) {
    full = `https:${full}`;
  } else if (/^http:\/\//i.test(full)) {
    full = `https://${full.slice('http://'.length)}`;
  } else if (!/^https:\/\//i.test(full)) {
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    full = `${normalizedBase}${full.replace(/^\/+/, '')}`;
  }
  return full.replace(/([^:])\/\/+/g, '$1/').replace(/ /g, '%20');
}

export async function fetchAyahAudioUrl(recitationId: number, surah: number, ayah: number, signal?: AbortSignal): Promise<string | null> {
  const key = `${recitationId}:${surah}:${ayah}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  try {
    const res = await fetch(`https://api.quran.com/api/v4/recitations/${recitationId}/by_ayah/${surah}:${ayah}`, {signal});
    if (!res.ok) return null;
    const json = await res.json();
    const full = normalizeQuranAudioUrl(json?.audio_files?.[0]?.url);
    if (full) {
      CACHE.set(key, full);
      return full;
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveSingleAyahUrl(
  mp3ReciterId: number,
  moshafName: string | undefined,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const src = resolveAyahSourceForMp3QuranReciter(mp3ReciterId, moshafName);
  if (!src) return null;
  if (src.kind === 'everyayah') return everyAyahUrl(src.folder, surah, ayah);
  return fetchAyahAudioUrl(src.recitationId, surah, ayah);
}

// جلب صوت سورة كاملة (ملف MP3 واحد) — لقراءة متواصلة بدون تقطّع بين الآيات.
export async function fetchChapterAudioUrl(recitationId: number, chapter: number): Promise<string | null> {
  const key = `ch:${recitationId}:${chapter}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  try {
    const res = await fetch(`https://api.quran.com/api/v4/chapter_recitations/${recitationId}/${chapter}`);
    if (!res.ok) return null;
    const json = await res.json();
    const full = normalizeQuranAudioUrl(json?.audio_file?.audio_url, 'https://download.quranicaudio.com/');
    if (full) {
      CACHE.set(key, full);
      return full;
    }
    return null;
  } catch {
    return null;
  }
}

const ALL_CHAPTERS_CACHE = new Map<number, Map<number, string>>();

export async function fetchAllChapterAudioUrls(recitationId: number): Promise<Map<number, string>> {
  const cached = ALL_CHAPTERS_CACHE.get(recitationId);
  if (cached && cached.size > 0) return cached;
  const map = new Map<number, string>();
  try {
    const res = await fetch(`https://api.quran.com/api/v4/chapter_recitations/${recitationId}`);
    if (!res.ok) return map;
    const json = await res.json();
    for (const file of json?.audio_files ?? []) {
      const ch = Number(file?.chapter_id);
      const full = normalizeQuranAudioUrl(file?.audio_url, 'https://download.quranicaudio.com/');
      if (Number.isFinite(ch) && ch >= 1 && ch <= 114 && full) {
        map.set(ch, full);
        CACHE.set(`ch:${recitationId}:${ch}`, full);
      }
    }
    if (map.size > 0) {
      ALL_CHAPTERS_CACHE.set(recitationId, map);
    }
  } catch { /* ignore */ }
  return map;
}

// Fetch a batch of ayahs for a surah (for sequential playback)
export async function fetchSurahAyahAudioUrls(recitationId: number, surah: number, _ayahs: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  try {
    const res = await fetch(`https://api.quran.com/api/v4/recitations/${recitationId}/by_chapter/${surah}`);
    if (!res.ok) return result;
    const json = await res.json();
    for (const af of json?.audio_files ?? []) {
      const ak = af.verse_key?.split(':')[1];
      const full = normalizeQuranAudioUrl(af?.url);
      if (ak && full) {
        result.set(Number(ak), full);
      }
    }
  } catch { /* ignore */ }
  return result;
}

export async function resolveSurahAyahUrls(
  mp3ReciterId: number,
  moshafName: string | undefined,
  surah: number,
  ayahs: number[],
): Promise<Map<number, string>> {
  const src = resolveAyahSourceForMp3QuranReciter(mp3ReciterId, moshafName);
  if (!src) return new Map();
  if (src.kind === 'everyayah') {
    const map = new Map<number, string>();
    for (const a of ayahs) map.set(a, everyAyahUrl(src.folder, surah, a));
    return map;
  }
  return fetchSurahAyahAudioUrls(src.recitationId, surah, ayahs);
}
