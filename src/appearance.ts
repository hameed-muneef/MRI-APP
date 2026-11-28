// مظهر المنصة: نهاري/ليلي فقط، والافتراضي نهاري. يطبّق `data-theme` على <html>
// ويحفظ الاختيار. القيم القديمة («system» أو غير المعروفة) تُهاجر إلى «نهاري»،
// والاختيار الليلي الصريح يبقى كما هو. المكوّنات تقرأ عبر `resolvedTheme`/الأحداث.

export type Appearance = 'light' | 'dark';

const STORAGE_KEY = 'rabbani-theme-v1';
export const APPEARANCE_EVENT = 'rabbani-appearance';

export function isAppearance(value: unknown): value is Appearance {
  return value === 'light' || value === 'dark';
}

export function readAppearance(storage: Pick<Storage, 'getItem'> | null): Appearance {
  try {
    const value = storage?.getItem(STORAGE_KEY);
    if (isAppearance(value)) return value;
  } catch {/* التخزين قد يكون مقفولًا */}
  // الافتراضي نهاري؛ أي قيمة قديمة («system») أو غير صالحة تعود نهارية.
  return 'light';
}

/** وصول آمن للتخزين: قد يُمنع في الإطارات المضمَّنة أو وضع الخصوصية — لا يُسقط التطبيق. */
export function safeLocalStorage(win: Pick<Window, 'localStorage'>): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {return win.localStorage} catch {return null}
}

export function saveAppearance(storage: Pick<Storage, 'setItem'> | null, value: Appearance): void {
  try {storage?.setItem(STORAGE_KEY, value)} catch {/* تجاهل */}
}

/** الوضع النهائي هو الاختيار نفسه: نهاري أو ليلي. */
export function resolvedTheme(mode: Appearance): 'light' | 'dark' {
  return mode === 'dark' ? 'dark' : 'light';
}

/** يطبّق الوضع الفعلي على المستند: السمة + لون شريط المتصفح. */
export function applyTheme(mode: Appearance, doc: Document = document): void {
  const dark = resolvedTheme(mode) === 'dark';
  const root = doc.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0E1A24' : '#F8FAFE');
}

export function installAppearance(doc: Document = document, win: Window = window): void {
  const storage = safeLocalStorage(win);
  applyTheme(readAppearance(storage), doc);
  win.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) {
      applyTheme(readAppearance(safeLocalStorage(win)), doc);
    }
  });
}

export function setAppearance(value: Appearance, doc: Document = document, win: Window = window): void {
  const storage = safeLocalStorage(win);
  saveAppearance(storage, value);
  applyTheme(value, doc);
  win.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, {detail: value}));
  // خصائص متعددة التبويبات
  const local = readAppearance(storage);
  if (local !== value) saveAppearance(storage, value);
}

export function currentAppearance(win: Window = window): Appearance {
  return readAppearance(safeLocalStorage(win));
}

export {STORAGE_KEY};
