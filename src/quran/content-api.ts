// ربط Quran Foundation Content API (api.quran.com) — للترجمات والتفسير.
// لا محتوى ديني مخترع: كل النصوص تُجلب من API.
import {getOfflineEntry} from './offline-store';
import asbabDataPart1 from './asbab-nuzul-1.json';
import asbabDataPart2 from './asbab-nuzul-2.json';

const CACHE_PREFIX = 'quran-content-cache-v1:';

function cacheKey(kind: string, id: number, verseKey: string): string {
  return `${CACHE_PREFIX}${kind}:${id}:${verseKey}`;
}

function readCache(kind: string, id: number, verseKey: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(kind, id, verseKey));
    if (raw === null) return undefined; // not cached
    return raw === '' ? null : raw;
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

// تفاسير — الجلالين هو الافتراضي بطلب المستخدم ويُجلب من مكتبة QUL عبر tafsir_api (انظر fetchTafsir).
// البقية من Quran.com: الميسر، السعدي، ابن كثير، القرطبي، الطبري، البغوي.
export const JALALAYN_TAFSIR_ID = 523;
export const TAFSIRS: TafsirChoice[] = [
  { id: JALALAYN_TAFSIR_ID, name: 'تفسير الجلالين', language: 'ar' },
  { id: 91, name: 'تفسير السعدي', language: 'ar' },
  { id: 16, name: 'التفسير الميسر', language: 'ar' },
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
  if (offline !== undefined) return offline;
  const cached = readCache('tr', translationId, verseKey);
  if (cached !== undefined) return cached;
  const body = await fetchJson(`${QURAN_API_BASE}/quran/translations/${translationId}?verse_key=${encodeURIComponent(verseKey)}`, signal) as { translations?: { text?: string }[] };
  const text = body?.translations?.[0]?.text;
  if (typeof text !== 'string' || !text.trim()) { writeCache('tr', translationId, verseKey, null); return null; }
  const cleaned = text.replace(/<[^>]*>/g, '').trim();
  writeCache('tr', translationId, verseKey, cleaned);
  return cleaned;
}

// جلب تفسير آية
const JALALAYN_CDN = 'https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@v1.2.3/tafsir/ar-tafsir-al-jalalayn';

export async function fetchTafsir(verseKey: string, tafsirId: number, signal?: AbortSignal): Promise<string | null> {
  if (tafsirId === JALALAYN_TAFSIR_ID) {
    const cachedJal = readCache('tf', tafsirId, verseKey);
    if (cachedJal !== undefined) return cachedJal;
    const [js, ja] = verseKey.split(':');
    const body = await fetchJson(`${JALALAYN_CDN}/${encodeURIComponent(js)}/${encodeURIComponent(ja)}.json`, signal) as { text?: string };
    const text = typeof body?.text === 'string' && body.text.trim() ? body.text.trim() : null;
    writeCache('tf', tafsirId, verseKey, text);
    return text;
  }
  const offline = await getOfflineEntry('tafsir', tafsirId, verseKey);
  if (offline !== undefined) return offline;
  const cached = readCache('tf', tafsirId, verseKey);
  if (cached !== undefined) return cached;
  const body = await fetchJson(`${QURAN_API_BASE}/tafsirs/${tafsirId}/by_ayah/${encodeURIComponent(verseKey)}`, signal) as { tafsir?: { text?: string } };
  const text = body?.tafsir?.text;
  if (typeof text !== 'string' || !text.trim()) { writeCache('tf', tafsirId, verseKey, null); return null; }
  const cleaned = text.replace(/<[^>]*>/g, '').trim();
  writeCache('tf', tafsirId, verseKey, cleaned);
  return cleaned;
}

type AsbabEntry = { surah: number; ayahs: number[]; occasions: string[] };

/** مصدر أسباب النزول المعروض: كتاب «صحيح أسباب النزول دراسة حديثية» لإبراهيم محمد العلي،
 *  بيانات mostafaahmed97/asbab-al-nuzul-dataset بترخيص MIT، مدمجة محليًا فلا تحتاج اتصالًا. */
export const ASBAB_ATTRIBUTION = 'صحيح أسباب النزول دراسة حديثية — إبراهيم محمد العلي';

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
