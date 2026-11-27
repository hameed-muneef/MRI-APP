// «الأقرب الآن»: أقرب ٣ مهام مفتوحة لليوم من الوقت الحالي، حتمية ومحلية ولا تغيّر أي جدول.
// مهمة بلا وقت لا تُعطى وقتًا مفترضًا: تُرتَّب بعد المهام المؤقتة.

export type NextUpInput = {id: string; time: string};
export type NextUpRow = {id: string; minutes: number | null; label: string; state: 'late' | 'now' | 'soon' | 'later' | 'untimed'};

const ar = (n: number) => n.toLocaleString('ar-EG');

export function relativeLabel(minutes: number): string {
  if (minutes <= 0 && minutes > -1) return 'الآن';
  if (minutes < 0) {
    const m = Math.round(-minutes);
    if (m < 60) return `متأخرة ${ar(m)} د`;
    const h = Math.floor(m / 60);
    return `متأخرة ${ar(h)} س${m % 60 ? ` و${ar(m % 60)} د` : ''}`;
  }
  const m = Math.round(minutes);
  if (m === 0) return 'الآن';
  if (m < 60) return `بعد ${ar(m)} د`;
  const h = Math.floor(m / 60);
  return `بعد ${ar(h)} س${m % 60 ? ` و${ar(m % 60)} د` : ''}`;
}

/** الفارق بالدقائق بين الآن ووقت HH:MM اليوم (سالب = فات). */
export function minutesUntil(time: string, now: Date): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const at = new Date(now);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return (at.getTime() - now.getTime()) / 60000;
}

/**
 * الترتيب: آخر مهمة فات وقتها (خلال ٣ ساعات) مثبّتة أولًا إن كانت مفتوحة،
 * ثم القادمة تصاعديًا، ثم المهام بلا وقت. الحد الأقصى `limit`.
 */
export function buildNextUp(items: NextUpInput[], now: Date, limit = 3): NextUpRow[] {
  const timed = items
    .map(item => ({id: item.id, minutes: minutesUntil(item.time, now)}))
    .filter((x): x is {id: string; minutes: number} => x.minutes !== null);
  const past = timed.filter(x => x.minutes < 0 && x.minutes >= -180).sort((a, b) => b.minutes - a.minutes);
  const upcoming = timed.filter(x => x.minutes >= 0).sort((a, b) => a.minutes - b.minutes);
  const untimed = items.filter(item => minutesUntil(item.time, now) === null);
  const rows: NextUpRow[] = [];
  if (past[0]) rows.push({id: past[0].id, minutes: past[0].minutes, label: relativeLabel(past[0].minutes), state: 'late'});
  for (const x of upcoming) {
    rows.push({id: x.id, minutes: x.minutes, label: relativeLabel(x.minutes), state: x.minutes < 1 ? 'now' : x.minutes <= 30 ? 'soon' : 'later'});
  }
  for (const u of untimed) rows.push({id: u.id, minutes: null, label: 'بلا وقت', state: 'untimed'});
  return rows.slice(0, limit);
}
