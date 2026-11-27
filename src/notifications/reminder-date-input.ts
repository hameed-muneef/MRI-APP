// قراءة تواريخ التكرار المحددة التي يكتبها المستخدم: نفصلها ونرفض ما ليس تاريخًا
// حقيقيًا بصيغة YYYY-MM-DD، حتى لا يُحفظ منبه بتواريخ لا يمكن أن يرنّ فيها.
export function parseSpecificDates(raw: string): {dates: string[]; invalid: string[]} {
  const parts = raw.split(/[،,]/).map(part => part.trim()).filter(Boolean);
  const dates: string[] = [];
  const invalid: string[] = [];
  for (const part of parts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) { invalid.push(part); continue; }
    const year = Number(part.slice(0, 4));
    const month = Number(part.slice(5, 7));
    const day = Number(part.slice(8, 10));
    const parsed = new Date(year, month - 1, day, 12);
    const real = parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
    if (!real) { invalid.push(part); continue; }
    if (!dates.includes(part)) dates.push(part);
  }
  return {dates, invalid};
}

/**
 * تاريخ انتهاء التكرار يجب ألا يسبق تاريخ البداية: منبه ينتهي قبل أن يبدأ
 * يُحفظ «مفعّلًا» ولا يرنّ أبدًا، فيبقى في القائمة بلا فائدة.
 * يُعيد رسالة الخطأ، أو null حين يكون التاريخ صالحًا أو فارغًا.
 */
export function endDateError(startDate: string, endDate: string): string | null {
  const value = endDate.trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'اكتب تاريخ الانتهاء بصيغة YYYY-MM-DD.';
  const start = startDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && value < start) {
    return 'تاريخ انتهاء التكرار يجب أن يكون في تاريخ البداية أو بعده.';
  }
  return null;
}
