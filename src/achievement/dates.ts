export type PeriodId = 'week' | 'month' | 'year';
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (key: string) => new Date(`${key}T12:00:00`);
export const addDaysKey = (key: string, n: number) => { const d = parse(key); d.setDate(d.getDate() + n); return dayKey(d); };
export const weekdayOf = (key: string) => parse(key).getDay(); // 0 = الأحد

/** بداية الأسبوع الإثنين، كما في خطوات الأهداف والأوراد في التطبيق. */
export function periodRange(period: PeriodId, now = new Date()): {start: string; end: string; today: string} {
  const today = dayKey(now);
  if (period === 'week') {
    const start = addDaysKey(today, -((now.getDay() + 6) % 7));
    return {start, end: addDaysKey(start, 6), today};
  }
  if (period === 'month') {
    return {start: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: dayKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)), today};
  }
  return {start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31`, today};
}

export function daysBetweenInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  for (let k = start; k <= end && out.length < 400; k = addDaysKey(k, 1)) out.push(k);
  return out;
}

export const inRange = (date: string, r: {start: string; end: string}) => date >= r.start && date <= r.end;
