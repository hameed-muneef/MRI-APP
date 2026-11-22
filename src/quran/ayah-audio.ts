// تلاوة على مستوى الآية (per-ayah) من Quran.com API v4
// يوفر روابط صوتية لكل آية على حدة (بدقة تلاوة الآية).
// يُستخدم إلى جانب تلاوة MP3Quran.net (على مستوى السورة).

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

export async function fetchAyahAudioUrl(recitationId: number, surah: number, ayah: number): Promise<string | null> {
  const key = `${recitationId}:${surah}:${ayah}`;
  if (CACHE.has(key)) return CACHE.get(key)!;
  try {
    const res = await fetch(`https://api.quran.com/api/v4/recitations/${recitationId}/by_ayah/${surah}:${ayah}`);
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
  // Quran.com API supports fetching all ayahs of a surah at once
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
