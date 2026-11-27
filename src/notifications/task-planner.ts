// مخطط تنبيهات المهام اليومية المجدولة (نطاق عمل خالص):
// يحوّل المهام المجدولة في «مركز المهام» (والأنشطة المؤكدة في «يومي مع الله» عند التفعيل)
// إلى أحداث تنبيه قابلة للجدولة عبر محرك الإشعارات المدمج (ويب + Push + Capacitor).

import type {Task, TaskSchedule} from '../app-state';
import type {DayPlan} from '../DayPlanner';
import {activitySchedule, slotClockTime} from '../day-timing';
import {goalStepCompletionKey, goalSteps, type Goal} from '../goal-plan';
import {isTaskDone} from '../task-periods';
import {
  getTaskNotificationSettings,
  isQuietHoursActive,
  type NotificationPreference,
} from './types';

export type TaskEventKind = 'before' | 'at';

export type TaskEvent = {
  key: string;
  taskId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  kind: TaskEventKind;
  beforeMinutes: number;
  at: Date;
  taskTitle: string;
  sourceLabel: string;
  title: string;
  body: string;
  alarmMode?: boolean;
};

export type TaskScheduleContext = {
  tasks: readonly Task[];
  goals?: readonly Goal[];
  taskSchedules: Readonly<Record<string, TaskSchedule>>;
  dayPlan?: DayPlan;
  prayers?: Record<string, string>;
};

export type ScheduledTaskEntry = {
  id: string;
  title: string;
  sourceLabel: string;
  date: string;
  time: string;
  confirmed: boolean;
  beforeMinutes: number;
  alarmMode?: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function localYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localYmd(d);
}

function parseLocalDateTime(ymd: string, hhmm: string): Date | null {
  if (!DATE_RE.test(ymd) || !TIME_RE.test(hhmm)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const dt = new Date(y, m - 1, d, h, min, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function formatClock12Ar(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h < 12 ? 'ص' : 'م';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function isScheduledItemDone(
  id: string,
  scheduleDate: string,
  todayYmd: string,
  tasks: readonly Task[],
  goals: readonly Goal[],
  now: Date,
): boolean {
  if (id.startsWith('goal:')) {
    for (const goal of goals) {
      for (const step of goalSteps(goal)) {
        if (`goal:${goal.id}:${step.id}` === id) {
          if (step.period === 'daily' && scheduleDate !== todayYmd) return false;
          return Boolean(step.done?.[goalStepCompletionKey(step, now)]);
        }
      }
    }
    return false;
  }
  const task = tasks.find(t => t.id === id);
  if (!task) return false;
  if (task.period === 'daily' && scheduleDate !== todayYmd) return false;
  return isTaskDone(task, now);
}

function clampLeadMinutes(minutes: number | undefined, fallback: number): number {
  if (minutes === undefined || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, Math.min(180, Math.round(minutes)));
}

/**
 * يستخرج المهام اليومية المجدولة النشطة (غير المكتملة والمفعّل تنبيهها) وفق إعدادات المستخدم.
 */
export function collectScheduledTasks(
  ctx: TaskScheduleContext,
  prefs: NotificationPreference,
  now = new Date(),
  daysAhead = 7,
): ScheduledTaskEntry[] {
  const settings = getTaskNotificationSettings(prefs);
  const prayers = ctx.prayers ?? {};
  const goals = ctx.goals ?? [];
  const todayYmd = localYmd(now);
  const maxYmd = addDaysYmd(todayYmd, Math.max(0, daysAhead));
  const entries: ScheduledTaskEntry[] = [];

  for (const [id, schedule] of Object.entries(ctx.taskSchedules ?? {})) {
    if (!schedule || schedule.notifyEnabled === false) continue;
    const confirmed = Boolean(schedule.confirmedDate);
    if (!settings.include_initial && !confirmed) continue;

    const date = schedule.confirmedDate ?? schedule.initialDate;
    const time =
      schedule.confirmedTime ??
      schedule.initialTime ??
      slotClockTime(schedule.confirmedSlot ?? schedule.initialSlot, prayers);
    if (!date || !time || !DATE_RE.test(date) || !TIME_RE.test(time)) continue;
    if (date < todayYmd || date > maxYmd) continue;
    if (isScheduledItemDone(id, date, todayYmd, ctx.tasks ?? [], goals, now)) continue;

    entries.push({
      id,
      title: schedule.title || ctx.tasks.find(t => t.id === id)?.title || 'مهمة مجدولة',
      sourceLabel: schedule.sourceLabel || 'مركز المهام',
      date,
      time,
      confirmed,
      beforeMinutes: clampLeadMinutes(schedule.remindBeforeMinutes, settings.remind_before_minutes),
      alarmMode: schedule.alarmMode === true,
    });
  }

  // تضمين الأنشطة المؤكدة في «يومي مع الله» لليوم عند تفعيل الخيار
  if (settings.include_day_plan && ctx.dayPlan?.activities) {
    const anchors: Record<string, string> = {
      ...prayers,
      'بداية العمل': ctx.dayPlan.workStart ?? '',
      'موعد النوم': ctx.dayPlan.sleep ?? '',
      'منتصف الليل': '00:00',
    };
    const seenIds = new Set(entries.map(e => `${e.date}:${e.id}`));
    for (const [slotId, items] of Object.entries(ctx.dayPlan.activities)) {
      if (!Array.isArray(items) || !items.length) continue;
      const computed = activitySchedule(slotId, items, anchors);
      items.forEach((activity, index) => {
        if (!activity || activity.scheduleStatus !== 'confirmed') return;
        if (activity.id.startsWith('confirmed:')) return; // محقون ديناميكيًا من taskSchedules
        if (ctx.dayPlan?.completed?.[activity.id] === todayYmd) return;
        const startTime = computed[index]?.start.time;
        if (!startTime || !TIME_RE.test(startTime)) return;
        const dayActId = `dayplan:${activity.id}`;
        if (seenIds.has(`${todayYmd}:${dayActId}`)) return;
        seenIds.add(`${todayYmd}:${dayActId}`);
        entries.push({
          id: dayActId,
          title: activity.title,
          sourceLabel: 'يومي مع الله',
          date: todayYmd,
          time: startTime,
          confirmed: true,
          beforeMinutes: settings.remind_before_minutes,
        });
      });
    }
  }

  return entries;
}

/**
 * يبني أحداث الإشعار (قبل الموعد / عند الموعد) للمهام المجدولة.
 */
export function dailyTaskEvents(
  ctx: TaskScheduleContext,
  prefs: NotificationPreference,
  now = new Date(),
  daysAhead = 2,
): TaskEvent[] {
  const settings = getTaskNotificationSettings(prefs);
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.task === false || !settings.enabled) {
    return [];
  }

  const entries = collectScheduledTasks(ctx, prefs, now, daysAhead);
  const events: TaskEvent[] = [];

  for (const entry of entries) {
    const taskAt = parseLocalDateTime(entry.date, entry.time);
    if (!taskAt) continue;
    const clockLabel = formatClock12Ar(entry.time);
    const sourceSuffix = entry.sourceLabel ? ` · ${entry.sourceLabel}` : '';

    if (entry.beforeMinutes > 0) {
      const beforeAt = new Date(taskAt.getTime() - entry.beforeMinutes * 60000);
      const beforeText = entry.beforeMinutes === 1 ? 'دقيقة واحدة' : entry.beforeMinutes === 2 ? 'دقيقتين' : `${entry.beforeMinutes} دقيقة`;
      events.push({
        key: `task:${entry.date}:${entry.id}:${entry.time}:before:${entry.beforeMinutes}`,
        taskId: entry.id,
        date: entry.date,
        time: entry.time,
        kind: 'before',
        beforeMinutes: entry.beforeMinutes,
        at: beforeAt,
        taskTitle: entry.title,
        sourceLabel: entry.sourceLabel,
        title: `اقتراب موعد مهمة: ${entry.title}`,
        body: `متبقي ${beforeText} على الموعد (${clockLabel})${sourceSuffix}`,
        alarmMode: entry.alarmMode === true,
      });
    }

    if (settings.notify_at_time) {
      events.push({
        key: `task:${entry.date}:${entry.id}:${entry.time}:at:0`,
        taskId: entry.id,
        date: entry.date,
        time: entry.time,
        kind: 'at',
        beforeMinutes: 0,
        at: taskAt,
        taskTitle: entry.title,
        sourceLabel: entry.sourceLabel,
        title: `حان وقت المهمة: ${entry.title}`,
        body: `موعد التنفيذ الآن (${clockLabel})${sourceSuffix}`,
        alarmMode: entry.alarmMode === true,
      });
    }
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function isTaskEventAllowed(
  _event: Pick<TaskEvent, 'taskId' | 'kind'>,
  prefs: NotificationPreference,
  now = new Date(),
): boolean {
  const settings = getTaskNotificationSettings(prefs);
  if (!prefs.global_enabled || prefs.dnd_enabled) return false;
  if (prefs.categories?.task === false) return false;
  if (!settings.enabled) return false;
  return !isQuietHoursActive(prefs, now);
}

/** يرجع التنبيهات القادمة للمهام المجدولة مرتبة بالأقرب للعرض في الإعدادات ومركز المهام */
export function upcomingTaskAlerts(
  ctx: TaskScheduleContext,
  prefs: NotificationPreference,
  now = new Date(),
  limit = 8,
): TaskEvent[] {
  const nowMs = now.getTime();
  return dailyTaskEvents(ctx, prefs, now, 7)
    .filter(event => event.at.getTime() > nowMs && !isQuietHoursActive(prefs, event.at))
    .slice(0, Math.max(0, limit));
}
