// أقرب المهام غير المكتملة لكارت «مهام اليوم» في الرئيسية: تاريخ فعلي لكل مهمة
// (جدولة مركز المهام أولًا ثم اليوم المجدول، واليومية تُحسب لليوم)، مع الساعة
// فقط إن حدّدها المستخدم فعلًا — لا عدّاد ولا وقت مفترض لمهمة بلا وقت.
import type {Task, TaskSchedule} from './app-state';
import {isTaskDone} from './task-periods';
import {slotClockTime, activitySchedule, type ActivityTiming} from './day-timing';
import {localDateKey} from './day-tracking';

export type HomeTask = {id: string; title: string; date: string; time: string; overdue: boolean};

type PlanLike = {workStart?: string; sleep?: string; activities: Record<string, {id: string; title: string; duration?: number; timing?: ActivityTiming}[]>; completed: Record<string, string>};

/** خطوات «يومي مع الله» المحددة لليوم وغير المنجزة، بوقتها المحسوب من مواقيت الصلاة. */
export function planStepsToday(plan: PlanLike | undefined, prayers: Record<string, string>, now: Date, doneIds: Set<string> = new Set()): HomeTask[] {
  if (!plan) return [];
  const todayKey = localDateKey(now);
  const out: HomeTask[] = [];
  for (const [slot, items] of Object.entries(plan.activities ?? {})) {
    if (!items?.length) continue;
    const clock = /^time-(\d{2})-(\d{2})$/.exec(slot);
    const anchors: Record<string, string> = {...prayers, 'بداية العمل': plan.workStart ?? '', 'موعد النوم': plan.sleep ?? '', ...(clock ? {[slot]: `${clock[1]}:${clock[2]}`} : {})};
    const times = activitySchedule(slot, items, anchors);
    items.forEach((item, index) => {
      if (plan.completed?.[item.id] === todayKey || doneIds.has(`${slot}:${item.id}`)) return;
      const time = times[index]?.start.time ?? '';
      if (!time) return;
      const [h, m] = time.split(':').map(Number);
      const at = new Date(now); at.setHours(h, m, 0, 0);
      if (at.getTime() < now.getTime() - 30 * 60000) return; // الأقرب وقتًا: لا نعرض ما مضى عليه أكثر من نصف ساعة
      out.push({id: `plan:${slot}:${item.id}`, title: item.title, date: todayKey, time, overdue: false});
    });
  }
  return out;
}

export function nearestTasks(
  tasks: Task[],
  schedules: Record<string, TaskSchedule>,
  prayers: Record<string, string>,
  now: Date = new Date(),
  limit = 3,
  extra: HomeTask[] = [],
): HomeTask[] {
  const todayKey = localDateKey(now);
  return tasks
    .filter(task => !isTaskDone(task, now))
    .map(task => {
      const schedule = schedules[task.id];
      const date = schedule?.confirmedDate ?? schedule?.initialDate ?? task.scheduledDate
        ?? (task.period === 'daily' ? todayKey : undefined);
      if (!date) return undefined;
      const time = schedule?.confirmedTime ?? schedule?.initialTime
        ?? slotClockTime(schedule?.confirmedSlot ?? schedule?.initialSlot, prayers);
      return {id: task.id, title: task.title, date, time, overdue: date < todayKey};
    })
    .filter((item): item is HomeTask => Boolean(item))
    .concat(extra.filter(item => item.date >= todayKey))
    .sort((a, b) => a.date === b.date
      ? (a.time || '99:99').localeCompare(b.time || '99:99')
      : a.date.localeCompare(b.date))
    .slice(0, limit);
}
