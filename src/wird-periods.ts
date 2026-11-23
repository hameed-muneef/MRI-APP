import type {Period, Wird} from './app-state';

export function periodKey(period: Period, now = new Date()): string {
  if (period === 'daily') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (period === 'monthly') return `${now.getFullYear()}-${now.getMonth() + 1}`;
  const start = new Date(Date.UTC(now.getFullYear(), 0, 1));
  const calendarDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return `${now.getFullYear()}-W${Math.ceil((((calendarDay - start.getTime()) / 86400000) + start.getUTCDay() + 1) / 7)}`;
}

export function normalizeWird(wird: Wird, now = new Date()): Wird {
  const key = periodKey(wird.period, now);
  return wird.periodKey === key ? wird : {...wird, count: 0, periodKey: key};
}

export function normalizeWirds(wirds: Wird[], now = new Date()): Wird[] {
  let changed = false;
  const next = wirds.map(wird => {
    const normalized = normalizeWird(wird, now);
    if (normalized !== wird) changed = true;
    return normalized;
  });
  return changed ? next : wirds;
}

export function changeWirdCount(wirds: Wird[], id: string, delta: number, now = new Date()): Wird[] {
  return normalizeWirds(wirds, now).map(wird => wird.id === id
    ? {...wird, count: Math.max(0, wird.count + delta)}
    : wird);
}
