// أقرب المهام غير المكتملة لكارت «مهام اليوم» في الرئيسية: تاريخ فعلي لكل مهمة
// (جدولة مركز المهام أولًا ثم اليوم المجدول، واليومية تُحسب لليوم)، مع الساعة
// فقط إن حدّدها المستخدم فعلًا — لا عدّاد ولا وقت مفترض لمهمة بلا وقت.
import type {Task, TaskSchedule} from './app-state';
import {isTaskDone} from './task-periods';
import {slotClockTime} from './day-timing';
import {localDateKey} from './day-tracking';

export type HomeTask = {id: string; title: string; date: string; time: string; overdue: boolean};

export function nearestTasks(
  tasks: Task[],
  schedules: Record<string, TaskSchedule>,
  prayers: Record<string, string>,
  now: Date = new Date(),
  limit = 3,
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
    .sort((a, b) => a.date === b.date
      ? (a.time || '99:99').localeCompare(b.time || '99:99')
      : a.date.localeCompare(b.date))
    .slice(0, limit);
}
