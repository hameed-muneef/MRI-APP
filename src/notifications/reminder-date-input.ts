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
