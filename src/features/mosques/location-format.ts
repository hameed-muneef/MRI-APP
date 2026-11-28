const ARABIC_CHAR_RE = /[\u0600-\u06FF]/;
const PLUS_CODE_RE = /^[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}$/i;
const ONLY_DIGITS_RE = /^\d+$/;
const TRAILING_POSTCODE_RE = /\s+\b\d{4,8}\b/g;

const NOISE_TOKENS = new Set([
  'egypt',
  'saudi arabia',
  'united arab emirates',
  'uae',
  'jordan',
  'kuwait',
  'qatar',
  'bahrain',
  'oman',
  'morocco',
  'algeria',
  'tunisia',
  'libya',
  'iraq',
  'yemen',
  'lebanon',
  'syria',
  'palestine',
  'sudan',
  'mauritania',
  'somalia',
  'djibouti',
  'comoros',
  'مصر',
  'المملكة العربية السعودية',
  'السعودية',
  'الإمارات العربية المتحدة',
  'الإمارات',
  'الأردن',
  'الكويت',
  'قطر',
  'البحرين',
  'عمان',
  'المغرب',
  'الجزائر',
  'تونس',
  'ليبيا',
  'العراق',
  'اليمن',
  'لبنان',
  'سوريا',
  'فلسطين',
  'السودان',
  'underconstruction',
  'under construction',
]);

function normalizeKey(token: string): string {
  return token.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanToken(raw: string): string {
  return raw
    .replace(TRAILING_POSTCODE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ينظف عنوان المسجد القادم من بيانات OpenStreetMap بإزالة التكرار والرموز البريدية
 * والأكواد الجغرافية، مع تفضيل الأجزاء العربية وتقليص السطور لتبدو البطاقة مرتبة.
 */
export function formatMosqueLocation(raw?: string): string {
  if (!raw) return '';

  const parts = raw
    .split(/[,،]+/)
    .map(cleanToken)
    .filter((token) => {
      if (!token) return false;
      if (PLUS_CODE_RE.test(token)) return false;
      if (ONLY_DIGITS_RE.test(token) && token.length <= 3) return false;
      return !NOISE_TOKENS.has(normalizeKey(token));
    });

  if (parts.length === 0) return '';

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = normalizeKey(part);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  const arabicParts = unique.filter((part) => ARABIC_CHAR_RE.test(part));
  const selected = arabicParts.length > 0 ? arabicParts : unique;

  return selected.slice(0, 3).join('، ');
}
