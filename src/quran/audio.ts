// خدمة تلاوة القرآن الكريم من MP3Quran.net (API v3) + كتالوج محلي سريع (244+ قارئ)
// توفر القائمة الكاملة للقراء المشهورين وجميع الروايات، مع تخزين مؤقت محلي يعمل دون اتصال.

export type ReciterMoshaf = {
  id: number;
  name: string;
  server: string;
  surahTotal: number;
  surahList: number[];
};

export type Reciter = {
  id: number;
  name: string;
  letter: string;
  moshaf: ReciterMoshaf[];
  famous?: boolean;
};

type RawMoshaf = {
  id: number;
  name: string;
  server: string;
  surah_total?: number;
  surahTotal?: number;
  surah_list?: string;
  surahList?: number[];
};

type RawReciter = {
  id: number;
  name: string;
  letter?: string;
  moshaf?: RawMoshaf[];
};

const API_URL = 'https://www.mp3quran.net/api/v3/reciters?language=ar';
const BUNDLED_URL = '/quran/reciters.json';
const STORAGE_KEY = 'rabbani-quran-reciters-v1';
const STORAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * ترتيب أشهر القراء في العالم الإسلامي ليظهروا في مقدمة القائمة وفي تبويب «الأشهر».
 */
export const FAMOUS_RECITER_IDS: readonly number[] = [
  123, // مشاري العفاسي
  102, // ماهر المعيقلي
  92,  // ياسر الدوسري
  54,  // عبدالرحمن السديس
  31,  // سعود الشريم
  51,  // عبدالباسط عبدالصمد
  112, // محمد صديق المنشاوي
  118, // محمود خليل الحصري
  30,  // سعد الغامدي
  5,   // أحمد بن علي العجمي
  86,  // ناصر القطامي
  81,  // فارس عباد
  20,  // خالد الجليل
  12,  // إدريس أبكر
  109, // محمد أيوب
  74,  // علي بن عبدالرحمن الحذيفي
  106, // محمد الطبلاوي
  4,   // شيخ أبو بكر الشاطري
  89,  // هاني الرفاعي
  221, // رعد محمد الكردي
  231, // هزاع البلوشي
  107, // محمد اللحيدان
  62,  // عبدالله عواد الجهني
  60,  // عبدالله بصفر
  43,  // صلاح البدير
  76,  // علي جابر
  111, // محمد جبريل
  1,   // إبراهيم الأخضر
  121, // محمود علي البنا
  125, // مصطفى إسماعيل
  67,  // عبدالمحسن القاسم
  219, // وديع اليمني
  253, // إسلام صبحي
  259, // أحمد النفيس
  21,  // خالد القحطاني
  160, // عادل الكلباني
  80,  // عمر القزابري (ورش)
  16,  // العيون الكوشي (ورش)
  38,  // شيرزاد عبدالرحمن طاهر
  72,  // عبدالولي الأركاني
  61,  // عبدالله خياط
  105, // محمد البراك
  87,  // نبيل الرفاعي
  178, // إبراهيم الدوسري
  56,  // عبدالعزيز الزهراني
  226, // خالد الغامدي
  108, // محمد المحيسني
];

const FAMOUS_RANK = new Map<number, number>(FAMOUS_RECITER_IDS.map((id, idx) => [id, idx]));

/** الحد الأدنى المضمون في حال فشل قراءة الملف المحلي والشبكة معًا. */
const EMERGENCY_FALLBACK_RECITERS: RawReciter[] = [
  {id: 123, name: 'مشاري العفاسي', letter: 'م', moshaf: [{id: 123, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/mishary-alafasy/r2/', surah_total: 114, surah_list: range114()}]},
  {id: 102, name: 'ماهر المعيقلي', letter: 'م', moshaf: [{id: 102, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/maher-muaiqly/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 92, name: 'ياسر الدوسري', letter: 'ي', moshaf: [{id: 92, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/yasser-dosari/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 54, name: 'عبدالرحمن السديس', letter: 'ع', moshaf: [{id: 54, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/abdulrahman-sudais/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 31, name: 'سعود الشريم', letter: 'س', moshaf: [{id: 31, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/saud-shuraim/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 51, name: 'عبدالباسط عبدالصمد', letter: 'ع', moshaf: [{id: 51, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/abdulbasit-abdulsamad/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 112, name: 'محمد صديق المنشاوي', letter: 'م', moshaf: [{id: 112, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/muhammad-minshawi/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 118, name: 'محمود خليل الحصري', letter: 'م', moshaf: [{id: 118, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/mahmoud-husary/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 30, name: 'سعد الغامدي', letter: 'س', moshaf: [{id: 30, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/saad-ghamdi/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 5, name: 'أحمد بن علي العجمي', letter: 'أ', moshaf: [{id: 5, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/ahmad-ajmi/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 86, name: 'ناصر القطامي', letter: 'ن', moshaf: [{id: 86, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/nasser-qatami/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 81, name: 'فارس عباد', letter: 'ف', moshaf: [{id: 81, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/fares-abbad/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 20, name: 'خالد الجليل', letter: 'خ', moshaf: [{id: 20, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/khalid-jalil/r1/', surah_total: 114, surah_list: range114()}]},
  {id: 12, name: 'إدريس أبكر', letter: 'إ', moshaf: [{id: 12, name: 'حفص عن عاصم - مرتل', server: 'https://cdn.mp3quran.net/audio/idrees-abkar/r1/', surah_total: 114, surah_list: range114()}]},
];

function range114(): string {
  return Array.from({length: 114}, (_, i) => i + 1).join(',');
}

export function isFamousReciter(id: number): boolean {
  return FAMOUS_RANK.has(id);
}

export function normalizeArabicSearch(raw: string): string {
  return raw
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/عبد\s+ال/g, 'عبدال')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function moshafCategory(moshafName: string): 'hafs' | 'warsh' | 'qalun' | 'other' {
  const n = normalizeArabicSearch(moshafName);
  if (n.includes('ورش')) return 'warsh';
  if (n.includes('قالون')) return 'qalun';
  if (n.includes('حفص')) return 'hafs';
  return 'other';
}

function parseSurahList(raw: RawMoshaf): number[] {
  if (Array.isArray(raw.surahList) && raw.surahList.length > 0) {
    return raw.surahList.filter(n => Number.isFinite(n) && n >= 1 && n <= 114);
  }
  return String(raw.surah_list ?? '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n >= 1 && n <= 114);
}

function normalizeServer(raw: string): string {
  let server = String(raw ?? '').trim().replace(/\/+$/, '');
  if (server.startsWith('//')) server = `https:${server}`;
  else if (/^http:\/\//i.test(server)) server = `https://${server.slice('http://'.length)}`;
  return server ? `${server}/` : '';
}

export function parseRecitersPayload(rawList: RawReciter[]): Reciter[] {
  const mapped: Reciter[] = [];
  const seenIds = new Set<number>();

  for (const r of rawList) {
    if (!r || !Number.isFinite(r.id) || !r.name) continue;
    if (seenIds.has(r.id)) continue;
    const moshaf: ReciterMoshaf[] = [];
    for (const m of r.moshaf ?? []) {
      const server = normalizeServer(m.server);
      const surahList = parseSurahList(m);
      if (!server || surahList.length === 0) continue;
      moshaf.push({
        id: Number(m.id),
        name: String(m.name || 'حفص عن عاصم - مرتل'),
        server,
        surahTotal: Number(m.surah_total ?? m.surahTotal ?? surahList.length),
        surahList,
      });
    }
    if (!moshaf.length) continue;
    // رتب المصاحف بحيث يكون الكامل (114 سورة) أو المرتل أولًا
    moshaf.sort((a, b) => {
      const aFull = a.surahList.length >= 114 ? 1 : 0;
      const bFull = b.surahList.length >= 114 ? 1 : 0;
      if (aFull !== bFull) return bFull - aFull;
      return b.surahList.length - a.surahList.length;
    });
    seenIds.add(r.id);
    mapped.push({
      id: Number(r.id),
      name: String(r.name).trim(),
      letter: String(r.letter || r.name.trim()[0] || ''),
      moshaf,
      famous: FAMOUS_RANK.has(Number(r.id)),
    });
  }

  mapped.sort((a, b) => {
    const rankA = FAMOUS_RANK.get(a.id);
    const rankB = FAMOUS_RANK.get(b.id);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return a.name.localeCompare(b.name, 'ar');
  });

  return mapped;
}

export function searchReciters(list: Reciter[], query: string): Reciter[] {
  const normQuery = normalizeArabicSearch(query);
  if (!normQuery) return list;
  const tokens = normQuery.split(' ').filter(Boolean);
  return list.filter(reciter => {
    const hay = normalizeArabicSearch(`${reciter.name} ${reciter.moshaf.map(m => m.name).join(' ')}`);
    return tokens.every(token => hay.includes(token));
  });
}

function readCachedFromStorage(): {reciters: Reciter[]; fresh: boolean} | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {savedAt?: number; reciters?: RawReciter[]};
    if (!Array.isArray(parsed?.reciters) || parsed.reciters.length === 0) return null;
    const list = parseRecitersPayload(parsed.reciters);
    if (list.length === 0) return null;
    const fresh = typeof parsed.savedAt === 'number' && Date.now() - parsed.savedAt < STORAGE_TTL_MS;
    return {reciters: list, fresh};
  } catch {
    return null;
  }
}

function writeCachedToStorage(rawReciters: RawReciter[]): void {
  try {
    if (typeof localStorage === 'undefined' || !rawReciters.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({savedAt: Date.now(), reciters: rawReciters}));
  } catch {
    // تجاهل امتلاء localStorage؛ يبقى الملف المجمّع متاحًا دائمًا
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  if (typeof AbortController === 'undefined') return fetch(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {signal: ctrl.signal});
  } finally {
    clearTimeout(timer);
  }
}

let inMemoryPromise: Promise<Reciter[]> | null = null;
let backgroundRefreshStarted = false;

export async function refreshRecitersFromNetwork(): Promise<Reciter[] | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  try {
    const res = await fetchWithTimeout(API_URL, 9000);
    if (!res.ok) return null;
    const json = await res.json();
    const rawList = (json?.reciters ?? []) as RawReciter[];
    const parsed = parseRecitersPayload(rawList);
    if (parsed.length > 0) {
      writeCachedToStorage(rawList);
      inMemoryPromise = Promise.resolve(parsed);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * تحميل قائمة القراء الكاملة (244+ قارئًا):
 * - يُعيد القائمة المخزنة محليًا أو المضمّنة في التطبيق فورًا (يعمل دون إنترنت).
 * - يُحدّث القائمة في الخلفية من MP3Quran v3 API عند توفر الإنترنت.
 */
export async function loadReciters(options?: {forceRefresh?: boolean; onNetworkUpdate?: (list: Reciter[]) => void}): Promise<Reciter[]> {
  if (options?.forceRefresh) {
    const fresh = await refreshRecitersFromNetwork();
    if (fresh) return fresh;
  }

  if (inMemoryPromise) return inMemoryPromise;

  inMemoryPromise = (async () => {
    const stored = readCachedFromStorage();
    if (stored) {
      if (!stored.fresh && !backgroundRefreshStarted) {
        backgroundRefreshStarted = true;
        void refreshRecitersFromNetwork().then(updated => {
          if (updated) options?.onNetworkUpdate?.(updated);
        });
      }
      return stored.reciters;
    }

    // جلب الملف المحلي المدمج داخل التطبيق (public/quran/reciters.json)
    try {
      const res = await fetchWithTimeout(BUNDLED_URL, 4000);
      if (res.ok) {
        const json = await res.json();
        const rawList = (json?.reciters ?? []) as RawReciter[];
        const parsed = parseRecitersPayload(rawList);
        if (parsed.length > 0) {
          if (!backgroundRefreshStarted) {
            backgroundRefreshStarted = true;
            void refreshRecitersFromNetwork().then(updated => {
              if (updated) options?.onNetworkUpdate?.(updated);
            });
          }
          return parsed;
        }
      }
    } catch {
      // تجاهل وسينتقل إلى الشبكة أو الحد الأدنى المضمون
    }

    const fromNet = await refreshRecitersFromNetwork();
    if (fromNet && fromNet.length > 0) return fromNet;

    return parseRecitersPayload(EMERGENCY_FALLBACK_RECITERS);
  })();

  return inMemoryPromise;
}

export function audioUrl(moshaf: ReciterMoshaf, surah: number): string {
  const padded = String(surah).padStart(3, '0');
  let server = moshaf.server.trim().replace(/\/+$/, '');
  if (server.startsWith('//')) server = `https:${server}`;
  else if (/^http:\/\//i.test(server)) server = `https://${server.slice('http://'.length)}`;
  return `${server}/${padded}.mp3`.replace(/ /g, '%20');
}

export function reciterHasSurah(moshaf: ReciterMoshaf, surah: number): boolean {
  return moshaf.surahList.includes(surah);
}

export function defaultMoshaf(reciter: Reciter): ReciterMoshaf | undefined {
  return reciter.moshaf.find(m => m.surahList.length >= 114) ?? reciter.moshaf[0];
}
