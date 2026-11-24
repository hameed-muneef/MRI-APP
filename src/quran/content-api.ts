// ربط Quran Foundation Content API (api.quran.com) — للترجمات والتفسير.
// لا محتوى ديني مخترع: كل النصوص تُجلب من API.
import {getOfflineEntry} from './offline-store';
import asbabDataPart1 from './asbab-nuzul-1.json';
import asbabDataPart2 from './asbab-nuzul-2.json';

const CACHE_PREFIX = 'quran-content-cache-v2:';

function cacheKey(kind: string, id: number, verseKey: string): string {
  return `${CACHE_PREFIX}${kind}:${id}:${verseKey}`;
}

/** تنظيف نصوص التفسير والترجمة من الوسوم والحواشي مع الحفاظ على فواصل الفقرات. */
export function cleanQuranText(raw: string): string {
  return raw
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|h[1-6]|blockquote)\s*>/gi, '\n\n')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : '';
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function readCache(kind: string, id: number, verseKey: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(kind, id, verseKey));
    if (raw === null) return undefined; // not cached
    return raw === '' ? null : cleanQuranText(raw);
  } catch { return undefined; }
}

function writeCache(kind: string, id: number, verseKey: string, value: string | null): void {
  try { localStorage.setItem(cacheKey(kind, id, verseKey), value ?? ''); } catch { /* quota */ }
}

export const QURAN_API_BASE = 'https://api.quran.com/api/v4';

export interface TranslationChoice { id: number; name: string; language: string; }
export interface TafsirChoice { id: number; name: string; language: string; }

// ترجمات شائعة (من Quran.com)
export const TRANSLATIONS: TranslationChoice[] = [
  { id: 20, name: 'Saheeh International', language: 'en' },
  { id: 22, name: 'Yusuf Ali', language: 'en' },
  { id: 19, name: 'Pickthall', language: 'en' },
  { id: 85, name: 'M.A.S. Abdel Haleem', language: 'en' },
];

// تفاسير — التفسير الميسر هو الافتراضي بطلب المستخدم. الكل يُجلب من Quran.com API v4.
export const TAFSIRS: TafsirChoice[] = [
  { id: 16, name: 'التفسير الميسر', language: 'ar' },
  { id: 91, name: 'تفسير السعدي', language: 'ar' },
  { id: 14, name: 'تفسير ابن كثير', language: 'ar' },
  { id: 90, name: 'تفسير القرطبي', language: 'ar' },
  { id: 15, name: 'تفسير الطبري', language: 'ar' },
  { id: 94, name: 'تفسير البغوي', language: 'ar' },
  
];

export type FetchState<T> = { status: 'idle' | 'loading' | 'success' | 'error' | 'empty'; data: T | null; error?: string };

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// جلب ترجمة آية (verse_key = "surah:ayah", e.g. "2:255")
export async function fetchTranslation(verseKey: string, translationId: number, signal?: AbortSignal): Promise<string | null> {
  const offline = await getOfflineEntry('translation', translationId, verseKey);
  if (offline !== undefined) return offline ? cleanQuranText(offline) : null;
  const cached = readCache('tr', translationId, verseKey);
  if (cached !== undefined) return cached;
  const body = await fetchJson(`${QURAN_API_BASE}/quran/translations/${translationId}?verse_key=${encodeURIComponent(verseKey)}`, signal) as { translations?: { text?: string }[] };
  const text = body?.translations?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) { writeCache('tr', translationId, verseKey, null); return null; }
  const cleaned = cleanQuranText(text);
  writeCache('tr', translationId, verseKey, cleaned || null);
  return cleaned || null;
}

// جلب تفسير آية
export async function fetchTafsir(verseKey: string, tafsirId: number, signal?: AbortSignal): Promise<string | null> {
  const offline = await getOfflineEntry('tafsir', tafsirId, verseKey);
  if (offline !== undefined) return offline ? cleanQuranText(offline) : null;
  const cached = readCache('tf', tafsirId, verseKey);
  if (cached !== undefined) return cached;
  const body = await fetchJson(`${QURAN_API_BASE}/tafsirs/${tafsirId}/by_ayah/${encodeURIComponent(verseKey)}`, signal) as { tafsir?: { text?: string } };
  const text = body?.tafsir?.text;
  if (typeof text !== 'string' || !text.trim()) { writeCache('tf', tafsirId, verseKey, null); return null; }
  const cleaned = cleanQuranText(text);
  writeCache('tf', tafsirId, verseKey, cleaned || null);
  return cleaned || null;
}

type AsbabEntry = { surah: number; ayahs: number[]; occasions: string[] };

/** مصدر أسباب النزول المعروض: قاعدة بيانات مركز تفسير للدراسات القرآنية (tafsir.net)،
 *  بترخيص CC BY 4.0، مدمجة محليًا فلا تحتاج اتصالًا؛ 201 مدخلًا، وغياب الآية يعني عدم ورودها في هذا المصدر. */
export const ASBAB_ATTRIBUTION = 'أسباب النزول — مركز تفسير للدراسات القرآنية (tafsir.net)';
export const ASBAB_PROVIDER = 'بيانات مدمجة على الجهاز، بترخيص CC BY 4.0 (creativecommons.org/licenses/by/4.0)، مع تكييف التنسيق';

const asbabEntries = [...(asbabDataPart1 as AsbabEntry[]), ...(asbabDataPart2 as AsbabEntry[])];

export function getAsbabNuzul(verseKey: string): string | null {
  const [surah, ayah] = verseKey.split(':').map(Number);
  const entry = asbabEntries.find((e) => e.surah === surah && e.ayahs.includes(ayah));
  if (!entry) return null;
  return entry.occasions.join('\n\n');
}

/** أسباب النزول من المصدر المحلي المعتمد فقط؛ لا بديل ولا نص مخترع عند غياب سبب موثّق. */
export async function fetchAsbabNuzul(verseKey: string, _signal?: AbortSignal): Promise<string | null> {
  return getAsbabNuzul(verseKey);
}

/** معاني الكلمات: شروح عربية من قاعدة بيانات مركز تفسير للدراسات القرآنية (tafsir.net)،
 *  بترخيص CC BY 4.0، مدمجة محليًا. شروح توضيحية تتضمن أحيانًا ملاحظات نحوية، وليست ترجمة آلية. */
export const WORD_MEANINGS_ATTRIBUTION = 'معاني الكلمات — مركز تفسير للدراسات القرآنية (tafsir.net)';
export const WORD_MEANINGS_PROVIDER = 'بيانات مدمجة على الجهاز، بترخيص CC BY 4.0 (creativecommons.org/licenses/by/4.0)، مع تكييف التنسيق';

export type WordMeaning = { word: string; meaning: string };

type WordMeaningsData = Record<string, [string, string][]>;

let wordMeaningsPromise: Promise<WordMeaningsData> | null = null;
function loadWordMeanings(): Promise<WordMeaningsData> {
  if (!wordMeaningsPromise) {
    wordMeaningsPromise = fetch('/quran/word-meanings-ar.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<WordMeaningsData>;
      })
      .catch((err) => {
        wordMeaningsPromise = null;
        throw err;
      });
  }
  return wordMeaningsPromise;
}

/** شروح كلمات الآية من بيانات المصدر المدمجة؛ تُعرض بنص كلمات المصدر نفسه، بلا محاذاة آليّة مع نص الآية. */
export async function fetchWordMeanings(verseKey: string): Promise<WordMeaning[] | null> {
  const data = await loadWordMeanings();
  const rows = data[verseKey];
  if (!rows || rows.length === 0) return null;
  return rows.map(([word, meaning]) => ({ word, meaning }));
}
