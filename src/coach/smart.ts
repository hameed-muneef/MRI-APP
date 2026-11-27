import type {AchievementEntry} from '../achievement/log';
import type {Task,TaskSchedule,Wird} from '../app-state';
import type {DayPlan} from '../DayPlanner';
import {activitySchedule,offsetTime} from '../day-timing';
import type {DayRecords} from '../day-tracking';
import {goalSteps,localGoalDate,type Goal} from '../goal-plan';
import {isPlanTask} from '../quran-mastery/plan-tasks';
import {dashboard,localDay as masteryLocalDay,revisionQueue} from '../quran-mastery/planning';
import type {MasteryStateRoot} from '../quran-mastery/types';
import type {MemorizationPassage} from '../quran/types';
import {isTaskDone} from '../task-periods';
import {
  courseCoachOn,
  courseSuggestions,
  todayList,
  type CourseCoach,
  type TodayItem,
} from './course';
import {
  coachEntitled,
  coachOn,
  finishedKeys,
  suggestionsFor,
  weeklySummary,
  type Suggestion,
} from './engine';
import {
  habitOn,
  habitSuggestions,
  type HabitSuggestion,
  type WirdWithCoach,
} from './habit';
import {COACH_MESSAGES as M} from './messages';
import type {CoachSettings} from './types';

export type TimeWindow = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night';

export type FreePrayerSlot = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  freeMinutes: number;
  window: TimeWindow;
  inWorkHours: boolean;
  estimated?: boolean;
};

export type BehaviorPatterns = {
  peakWindow: TimeWindow | null;
  peakWindowLabel: string | null;
  bestPrayerSlotId: string | null;
  weakestWeekday: number | null;
  weakestWeekdayLabel: string | null;
  weekdayVsWeekend: 'weekdays_stronger' | 'weekend_stronger' | 'balanced' | null;
  activeDaysLast14: number;
  estimatedCapacity: number;
  totalLoggedEvents: number;
};

export type RecoveryStatus = {
  active: boolean;
  gapDays: number;
  dayNumber: 1 | 2 | 3;
  normalCapacity: number;
  dailyLimit: number;
  lastActiveDate: string | null;
};

export type QuranCoachInsight = {
  hasPlanOrPassages: boolean;
  dueReviews: number;
  overdueReviews: number;
  weakCount: number;
  masteredCount: number;
  shouldConsolidateFirst: boolean;
  message: string | null;
  topDueTaskId?: string;
};

export type ColdStartInsight = {
  id: string;
  kind: 'overload' | 'tight-deadline' | 'unscheduled-today';
  title: string;
  detail: string;
  goalId?: string;
};

export type SmartTodayItem = TodayItem & {
  taskId: string;
  suggestedSlot: FreePrayerSlot | null;
  scheduledTimeToday?: string;
  /** Date (YYYY-MM-DD) of an existing schedule that is today or later. The coach never overwrites it. */
  scheduledDate?: string;
  priorityScore: number;
  priorityNote: string;
};

export type SmartTodayPlan = {
  anyCoachOn: boolean;
  globalEnabled: boolean;
  dateKey: string;
  capacity: number;
  budget: number;
  recovery: RecoveryStatus;
  patterns: BehaviorPatterns;
  freeSlots: FreePrayerSlot[];
  quran: QuranCoachInsight;
  coldStart: ColdStartInsight[];
  recommended: SmartTodayItem[];
  deferred: SmartTodayItem[];
  totalOpen: number;
};

export type WeeklyPillarSummary = {
  id: 'goals' | 'course' | 'wirds';
  label: string;
  activeCount: number;
  done: number;
  expected: number;
  rate: number | null;
};

export type WeeklyRecommendation = {
  id: string;
  kind: 'goal-suggestion' | 'habit-suggestion' | 'course-warning' | 'pattern-tip';
  title: string;
  body: string;
  goal?: Goal;
  suggestion?: Suggestion;
  wird?: WirdWithCoach;
  habitSuggestion?: HabitSuggestion;
  actionable: boolean;
};

export type WeeklyReport = {
  dateKey: string;
  overallDone: number;
  overallExpected: number;
  overallRate: number | null;
  pillars: WeeklyPillarSummary[];
  patterns: BehaviorPatterns;
  recommendations: WeeklyRecommendation[];
};

export type CoachHomeSummary = {
  anyActive: boolean;
  globalEnabled: boolean;
  recommendedCount: number;
  totalOpen: number;
  recoveryActive: boolean;
  recoveryDay: 1 | 2 | 3;
  nextSlot: FreePrayerSlot | null;
  overdueCount: number;
  subtitle: string;
};

export type SmartCoachInput = {
  goals: Goal[];
  tasks: Task[];
  wirds?: Wird[];
  courseCoach?: CourseCoach;
  coachSettings?: CoachSettings;
  prayers?: Record<string, string>;
  dayPlan?: DayPlan;
  dayRecords?: DayRecords;
  taskSchedules?: Record<string, TaskSchedule>;
  achievementLog?: AchievementEntry[];
  quranPassages?: MemorizationPassage[];
  masteryRoot?: MasteryStateRoot | null;
  now?: Date;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const WEEKDAY_NAMES = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

const WINDOW_LABELS: Record<TimeWindow, string> = {
  dawn: 'قبل الفجر',
  morning: 'الصباح والضحى',
  afternoon: 'الظهر والعصر',
  evening: 'المغرب وأول الليل',
  night: 'الليل',
};

const localDate = (now: Date): string => localGoalDate(now);

function toMin(time?: string): number | null {
  if (!time || !TIME_RE.test(time)) return null;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMin(min: number): string {
  const clamped = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00Z`).getTime();
  const db = new Date(`${b}T12:00:00Z`).getTime();
  return Math.round((da - db) / 86400000);
}

function windowOfHour(hour: number): TimeWindow {
  if (hour >= 3 && hour < 5) return 'dawn';
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 21) return 'evening';
  return 'night';
}

function slotWindowForAnchor(id: string): TimeWindow {
  if (id.startsWith('before-fajr')) return 'dawn';
  if (id.startsWith('after-fajr') || id === 'duha') return 'morning';
  if (id.startsWith('after-dhuhr') || id.startsWith('after-asr')) return 'afternoon';
  if (id.startsWith('after-maghrib')) return 'evening';
  return 'night';
}

type Interval = [number, number];

function subtractIntervals(base: Interval, busy: Interval[]): Interval[] {
  let parts: Interval[] = [base];
  for (const [bs, be] of busy) {
    if (be <= bs) continue;
    const next: Interval[] = [];
    for (const [ps, pe] of parts) {
      if (be <= ps || bs >= pe) {
        next.push([ps, pe]);
      } else {
        if (bs > ps) next.push([ps, bs]);
        if (pe > be) next.push([be, pe]);
      }
    }
    parts = next;
  }
  return parts.filter(([s, e]) => e - s >= 15);
}

function overlaps(a: Interval, b: Interval): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export function freePrayerSlots({
  prayers = {},
  dayPlan,
  taskSchedules = {},
  dateKey,
  now = new Date(),
}: {
  prayers?: Record<string, string>;
  dayPlan?: DayPlan;
  taskSchedules?: Record<string, TaskSchedule>;
  dateKey?: string;
  now?: Date;
}): FreePrayerSlot[] {
  const targetDate = dateKey ?? localDate(now);
  const isToday = targetDate === localDate(now);
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  const fajr = toMin(prayers['الفجر']);
  const shuruq = toMin(prayers['الشروق']);
  const dhuhr = toMin(prayers['الظهر']);
  const asr = toMin(prayers['العصر']);
  const maghrib = toMin(prayers['المغرب']);
  const isha = toMin(prayers['العشاء']);
  const sleep = toMin(dayPlan?.sleep);
  const workStart = toMin(dayPlan?.workStart);

  const hasValidPrayers = fajr !== null && dhuhr !== null && asr !== null && maghrib !== null && isha !== null;
  if (!hasValidPrayers) {
    const fallback: Array<{id: string; label: string; start: number; end: number; window: TimeWindow}> = [
      {id: 'after-fajr', label: 'الصباح الباكر', start: 6 * 60 + 30, end: 8 * 60, window: 'morning'},
      {id: 'after-dhuhr', label: 'بعد الظهر', start: 13 * 60, end: 14 * 60 + 30, window: 'afternoon'},
      {id: 'after-asr', label: 'بعد العصر', start: 16 * 60, end: 17 * 60 + 30, window: 'afternoon'},
      {id: 'after-maghrib', label: 'المساء', start: 19 * 60 + 30, end: 21 * 60, window: 'evening'},
    ];
    return fallback
      .filter(s => !isToday || s.end > nowMin + 20)
      .map(s => {
        const start = isToday ? Math.max(s.start, nowMin + 10) : s.start;
        return {
          id: s.id,
          label: s.label,
          startTime: fromMin(start),
          endTime: fromMin(s.end),
          freeMinutes: Math.max(15, s.end - start),
          window: s.window,
          inWorkHours: false,
          estimated: true,
        };
      });
  }

  const workBand: Interval | null =
    workStart !== null
      ? [workStart, dhuhr > workStart + 120 ? dhuhr : Math.min(22 * 60, workStart + 480)]
      : null;

  // Collect busy intervals from DayPlan confirmed/manual activities and today's scheduled tasks
  const busy: Interval[] = [];
  if (dayPlan?.activities) {
    const anchors: Record<string, string> = {
      ...prayers,
      'بداية العمل': dayPlan.workStart ?? '',
      'موعد النوم': dayPlan.sleep ?? '',
      'منتصف الليل': '00:00',
    };
    for (const [slotId, items] of Object.entries(dayPlan.activities)) {
      if (!items?.length) continue;
      if (slotId.startsWith('after-') && !anchors[slotId]) {
        const match = /^after-(fajr|dhuhr|asr|maghrib|isha)-(\d+)$/.exec(slotId);
        if (match) {
          const map: Record<string, string> = {
            fajr: 'الفجر',
            dhuhr: 'الظهر',
            asr: 'العصر',
            maghrib: 'المغرب',
            isha: 'العشاء',
          };
          anchors[slotId] = offsetTime(prayers[map[match[1]]], 30 + Number(match[2]));
        }
      }
      const computed = activitySchedule(slotId, items, anchors);
      items.forEach((act, idx) => {
        const isDefault = act.id.endsWith('-default') || act.id.endsWith('-witr') || act.id.endsWith('-istighfar');
        if (isDefault && act.scheduleStatus !== 'confirmed') return;
        const t = computed[idx];
        const s = toMin(t?.start?.time);
        if (s !== null) busy.push([s, s + (t.duration || 30)]);
      });
    }
  }

  for (const sched of Object.values(taskSchedules)) {
    const d = sched.confirmedDate ?? sched.initialDate;
    if (d !== targetDate) continue;
    const t = toMin(sched.confirmedTime ?? sched.initialTime);
    if (t !== null) busy.push([t, t + 30]);
  }

  const rawWindows: Array<{id: string; label: string; range: Interval; window: TimeWindow}> = [
    {id: 'before-fajr', label: 'قبل الفجر', range: [Math.max(0, fajr - 35), Math.max(0, fajr - 5)], window: 'dawn'},
  ];

  if (shuruq !== null && shuruq > fajr + 45) {
    rawWindows.push({id: 'after-fajr', label: 'بعد الفجر', range: [fajr + 25, shuruq - 5], window: 'morning'});
    if (dhuhr > shuruq + 45) {
      rawWindows.push({id: 'duha', label: 'وقت الضحى', range: [shuruq + 20, dhuhr - 15], window: 'morning'});
    }
  } else {
    rawWindows.push({id: 'after-fajr', label: 'بعد الفجر والصباح', range: [fajr + 25, dhuhr - 15], window: 'morning'});
  }

  rawWindows.push(
    {id: 'after-dhuhr', label: 'بعد الظهر', range: [dhuhr + 25, asr - 15], window: 'afternoon'},
    {id: 'after-asr', label: 'بعد العصر', range: [asr + 25, maghrib - 15], window: 'afternoon'},
    {id: 'after-maghrib', label: 'بعد المغرب', range: [maghrib + 25, isha - 15], window: 'evening'},
  );

  const ishaEnd = sleep !== null && sleep > isha + 40 ? Math.min(sleep - 15, 23 * 60 + 45) : Math.min(23 * 60 + 30, isha + 150);
  if (ishaEnd > isha + 40) {
    rawWindows.push({id: 'after-isha', label: 'بعد العشاء', range: [isha + 25, ishaEnd], window: 'night'});
  }

  const out: FreePrayerSlot[] = [];
  for (const w of rawWindows) {
    let [start, end] = w.range;
    if (isToday) {
      if (end <= nowMin + 20) continue;
      start = Math.max(start, Math.ceil((nowMin + 10) / 5) * 5);
    }
    if (end - start < 15) continue;
    const freeParts = subtractIntervals([start, end], busy);
    if (!freeParts.length) continue;
    // Choose longest contiguous free stretch in this prayer interval
    const best = freeParts.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    const freeMinutes = best[1] - best[0];
    const inWorkHours = Boolean(workBand && overlaps(best, workBand));
    out.push({
      id: w.id,
      label: w.label,
      startTime: fromMin(best[0]),
      endTime: fromMin(best[1]),
      freeMinutes,
      window: w.window,
      inWorkHours,
    });
  }
  return out;
}

export function analyzePatterns({
  goals,
  wirds = [],
  courseCoach,
  dayRecords,
  achievementLog,
  coachSettings,
  now = new Date(),
}: Pick<SmartCoachInput, 'goals' | 'wirds' | 'courseCoach' | 'dayRecords' | 'achievementLog' | 'coachSettings' | 'now'>): BehaviorPatterns {
  const windowCounts: Record<TimeWindow, number> = {
    dawn: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const dailyTotals = new Map<string, number>();
  let totalLoggedEvents = 0;

  const bumpDay = (dateKey: string, weight = 1) => {
    if (!DATE_RE.test(dateKey)) return;
    dailyTotals.set(dateKey, (dailyTotals.get(dateKey) ?? 0) + weight);
    const wd = new Date(`${dateKey}T12:00:00`).getDay();
    if (wd >= 0 && wd <= 6) weekdayCounts[wd] += weight;
    totalLoggedEvents += weight;
  };

  for (const entry of achievementLog ?? []) {
    bumpDay(entry.date, 1);
    const parsed = new Date(entry.at);
    if (!Number.isNaN(parsed.getTime())) {
      windowCounts[windowOfHour(parsed.getHours())] += 1;
    }
  }

  for (const [dateKey, rec] of Object.entries(dayRecords ?? {})) {
    const doneItems = rec.items.filter(it => it.status === 'done');
    if (doneItems.length > 0) bumpDay(dateKey, doneItems.length);
    for (const item of doneItems) {
      const m = toMin(item.start);
      if (m !== null) windowCounts[windowOfHour(Math.floor(m / 60))] += 1;
    }
  }

  for (const g of goals) {
    for (const step of goalSteps(g)) {
      for (const [key, isDone] of Object.entries(step.done)) {
        if (!isDone) continue;
        if (DATE_RE.test(key)) bumpDay(key, 1);
      }
    }
  }

  for (const w of wirds as WirdWithCoach[]) {
    for (const key of w.coach?.log ?? []) {
      if (DATE_RE.test(key)) bumpDay(key, 1);
    }
  }

  for (const key of courseCoach?.log?.day ?? []) {
    if (DATE_RE.test(key)) bumpDay(key, 1);
  }

  const windowEntries = (Object.entries(windowCounts) as Array<[TimeWindow, number]>).sort((a, b) => b[1] - a[1]);
  const topWindow = windowEntries[0] && windowEntries[0][1] >= 2 ? windowEntries[0][0] : null;

  // Compute last-14-days active count and median daily capacity
  const last14Keys = finishedKeys('daily', now, 14);
  const activeCounts = last14Keys
    .map(k => dailyTotals.get(k) ?? 0)
    .filter(count => count > 0)
    .sort((a, b) => a - b);

  let estimatedCapacity = 4;
  if (coachSettings?.preferredCapacity && coachSettings.preferredCapacity >= 2 && coachSettings.preferredCapacity <= 12) {
    estimatedCapacity = Math.round(coachSettings.preferredCapacity);
  } else if (activeCounts.length >= 3) {
    const mid = Math.floor(activeCounts.length / 2);
    const median = activeCounts.length % 2 === 1 ? activeCounts[mid] : Math.round((activeCounts[mid - 1] + activeCounts[mid]) / 2);
    estimatedCapacity = Math.min(8, Math.max(3, median));
  }

  // Weakest weekday detection only when meaningful evidence (>= 5 events and >= 3 active days)
  let weakestWeekday: number | null = null;
  let weekdayVsWeekend: BehaviorPatterns['weekdayVsWeekend'] = null;
  if (dailyTotals.size >= 5 && totalLoggedEvents >= 6) {
    const maxWd = Math.max(...weekdayCounts);
    let minIdx = 0;
    for (let i = 1; i < 7; i++) {
      if (weekdayCounts[i] < weekdayCounts[minIdx]) minIdx = i;
    }
    if (maxWd >= weekdayCounts[minIdx] + 2) weakestWeekday = minIdx;

    // Weekend in Arab/Islamic calendar is typically Fri(5) + Sat(6)
    const weekendAvg = (weekdayCounts[5] + weekdayCounts[6]) / 2;
    const workAvg = (weekdayCounts[0] + weekdayCounts[1] + weekdayCounts[2] + weekdayCounts[3] + weekdayCounts[4]) / 5;
    if (workAvg >= weekendAvg + 1) weekdayVsWeekend = 'weekdays_stronger';
    else if (weekendAvg >= workAvg + 1) weekdayVsWeekend = 'weekend_stronger';
    else weekdayVsWeekend = 'balanced';
  }

  const slotMap: Record<TimeWindow, string> = {
    dawn: 'before-fajr',
    morning: 'after-fajr',
    afternoon: 'after-asr',
    evening: 'after-maghrib',
    night: 'after-isha',
  };

  return {
    peakWindow: topWindow,
    peakWindowLabel: topWindow ? WINDOW_LABELS[topWindow] : null,
    bestPrayerSlotId: topWindow ? slotMap[topWindow] : null,
    weakestWeekday,
    weakestWeekdayLabel: weakestWeekday !== null ? WEEKDAY_NAMES[weakestWeekday] : null,
    weekdayVsWeekend,
    activeDaysLast14: activeCounts.length,
    estimatedCapacity,
    totalLoggedEvents,
  };
}

export function analyzeRecovery({
  goals,
  wirds = [],
  courseCoach,
  dayRecords,
  achievementLog,
  coachSettings,
  normalCapacity,
  now = new Date(),
}: Pick<SmartCoachInput, 'goals' | 'wirds' | 'courseCoach' | 'dayRecords' | 'achievementLog' | 'coachSettings' | 'now'> & {
  normalCapacity: number;
}): RecoveryStatus {
  const todayKey = localDate(now);
  const dates: string[] = [];
  const collect = (d?: string) => {
    if (d && DATE_RE.test(d) && d < todayKey) dates.push(d);
  };

  for (const entry of achievementLog ?? []) collect(entry.date);
  for (const [dateKey, rec] of Object.entries(dayRecords ?? {})) {
    if (rec.items.some(i => i.status === 'done') || (rec.prayers && Object.keys(rec.prayers).length > 0)) {
      collect(dateKey);
    }
  }
  for (const g of goals) {
    for (const s of goalSteps(g)) {
      for (const [k, ok] of Object.entries(s.done)) if (ok) collect(k);
    }
  }
  for (const w of wirds as WirdWithCoach[]) {
    for (const k of w.coach?.log ?? []) collect(k);
  }
  for (const k of courseCoach?.log?.day ?? []) collect(k);

  dates.sort();
  const lastActiveDate = dates.length ? dates[dates.length - 1] : null;
  const gapDays = lastActiveDate ? diffDays(todayKey, lastActiveDate) - 1 : 0;
  const dailyLimit = Math.max(2, Math.round(normalCapacity * 0.5));

  const stored = coachSettings?.recovery;
  if (stored?.dismissedUntil && todayKey <= stored.dismissedUntil) {
    return {active: false, gapDays, dayNumber: 1, normalCapacity, dailyLimit, lastActiveDate};
  }

  if (stored?.startedAt && DATE_RE.test(stored.startedAt) && !stored.completed) {
    const elapsed = diffDays(todayKey, stored.startedAt) + 1;
    if (elapsed >= 1 && elapsed <= 3) {
      return {
        active: true,
        gapDays: Math.max(gapDays, 3),
        dayNumber: elapsed as 1 | 2 | 3,
        normalCapacity,
        dailyLimit,
        lastActiveDate,
      };
    }
  }

  // Trigger recovery automatically when returning after >= 3 missed full days
  // (e.g., last active on Nov 20, today Nov 24 => diffDays=4 => 3 full missed days).
  if (lastActiveDate && gapDays >= 3) {
    return {
      active: true,
      gapDays,
      dayNumber: 1,
      normalCapacity,
      dailyLimit,
      lastActiveDate,
    };
  }

  return {active: false, gapDays: Math.max(0, gapDays), dayNumber: 1, normalCapacity, dailyLimit, lastActiveDate};
}

export function analyzeQuranCoach({
  masteryRoot,
  quranPassages = [],
  tasks = [],
  now = new Date(),
}: {
  masteryRoot?: MasteryStateRoot | null;
  quranPassages?: MemorizationPassage[];
  tasks?: Task[];
  now?: Date;
}): QuranCoachInsight {
  const todayKey = localDate(now);
  let dueReviews = 0;
  let overdueReviews = 0;
  let weakCount = 0;
  let masteredCount = 0;
  let hasPlanOrPassages = false;

  if (masteryRoot && (masteryRoot.passages.length > 0 || masteryRoot.plans.length > 0)) {
    hasPlanOrPassages = true;
    try {
      const dash = dashboard(masteryRoot, now);
      const queue = revisionQueue(masteryRoot, now);
      dueReviews = queue.length;
      overdueReviews = queue.filter(s => s.dueDate < masteryLocalDay(now, s.timezone)).length;
      weakCount = dash.weak;
      masteredCount = dash.mastered;
    } catch {
      /* ignore corrupted mastery state */
    }
  }

  if (quranPassages.length > 0) {
    hasPlanOrPassages = true;
    for (const p of quranPassages) {
      if (p.state === 'needs_revision') weakCount += 1;
      else if (p.state === 'mastered') masteredCount += 1;
      if (p.dueDate && p.dueDate <= todayKey && p.state !== 'mastered') {
        dueReviews += 1;
        if (p.dueDate < todayKey) overdueReviews += 1;
      }
    }
  }

  const shouldConsolidateFirst = overdueReviews >= 3 || weakCount >= 2;
  const openReviewTask = tasks.find(
    t => !isTaskDone(t, now) && ((isPlanTask(t) && t.plan?.kind !== 'day') || Boolean(t.hifz)),
  );
  const openDayPlanTask = tasks.find(t => !isTaskDone(t, now) && isPlanTask(t) && t.plan?.kind === 'day');
  const topDueTaskId = openReviewTask?.id ?? openDayPlanTask?.id;

  let message: string | null = null;
  if (shouldConsolidateFirst) {
    message = M.quranConsolidate.text({weak: weakCount, overdue: overdueReviews});
  } else if (dueReviews > 0) {
    message = M.quranDue.text({due: dueReviews});
  }

  return {
    hasPlanOrPassages,
    dueReviews,
    overdueReviews,
    weakCount,
    masteredCount,
    shouldConsolidateFirst,
    message,
    topDueTaskId,
  };
}

export function coldStartInsights({
  goals,
  wirds = [],
  courseCoach,
  tasks,
  taskSchedules = {},
  freeSlots,
  capacity,
  coachSettings,
  now = new Date(),
}: Pick<SmartCoachInput, 'goals' | 'wirds' | 'courseCoach' | 'tasks' | 'taskSchedules' | 'coachSettings' | 'now'> & {
  freeSlots: FreePrayerSlot[];
  capacity: number;
}): ColdStartInsight[] {
  const insights: ColdStartInsight[] = [];
  const todayKey = localDate(now);
  const openItems = todayList(goals, tasks, courseCoach, now, wirds, coachSettings);
  const dailyItems = openItems.filter(i => i.period === 'daily');

  if (dailyItems.length > capacity + 2) {
    insights.push({
      id: 'cold-overload',
      kind: 'overload',
      title: M.overloadTitle.text({}),
      detail: M.overloadDetail.text({count: dailyItems.length, capacity}),
    });
  }

  for (const g of goals) {
    if (!coachOn(g, coachSettings) || !g.targetDate) continue;
    const daysLeft = diffDays(g.targetDate, todayKey);
    const steps = goalSteps(g);
    const anyDone = steps.some(s => Object.values(s.done).some(Boolean));
    if (daysLeft >= 0 && daysLeft <= 7 && steps.length > 0 && !anyDone) {
      insights.push({
        id: `cold-deadline-${g.id}`,
        kind: 'tight-deadline',
        title: M.deadlineTitle.text({goal: g.title}),
        detail: M.deadlineDetail.text({days: daysLeft}),
        goalId: g.id,
      });
      break;
    }
  }

  const scheduledTodayCount = Object.values(taskSchedules).filter(
    s => (s.confirmedDate ?? s.initialDate) === todayKey,
  ).length;
  if (openItems.length >= 2 && scheduledTodayCount === 0 && freeSlots.length > 0) {
    const slot = freeSlots.find(s => !s.inWorkHours) ?? freeSlots[0];
    insights.push({
      id: 'cold-unscheduled',
      kind: 'unscheduled-today',
      title: M.unscheduledTitle.text({}),
      detail: M.unscheduledDetail.text({label: slot.label, minutes: slot.freeMinutes}),
    });
  }

  return insights;
}

export function resolveTaskId(item: TodayItem, tasks: Task[]): string {
  if (item.source === 'goal') return `goal:${item.goalId}:${item.stepId}`;
  if (item.source === 'course') return item.stepId;
  const linked = tasks.find(t => t.id === `wird-task-${item.stepId}`);
  return linked ? linked.id : `wird-task-${item.stepId}`;
}

export function buildSmartTodayPlan(input: SmartCoachInput): SmartTodayPlan {
  const now = input.now ?? new Date();
  const dateKey = localDate(now);
  const wirds = input.wirds ?? [];
  const taskSchedules = input.taskSchedules ?? {};
  const globalEnabled = Boolean(input.coachSettings?.globalEnabled) && coachEntitled();
  const anyGoal = input.goals.some(g => coachOn(g, input.coachSettings));
  const anyWird = wirds.some(w => habitOn(w as WirdWithCoach, input.coachSettings));
  const anyCourse = courseCoachOn(input.courseCoach, input.coachSettings);
  const anyCoachOn = globalEnabled || anyGoal || anyWird || anyCourse;

  const patterns = analyzePatterns({...input, now});
  const recovery = analyzeRecovery({...input, normalCapacity: patterns.estimatedCapacity, now});
  const freeSlots = freePrayerSlots({
    prayers: input.prayers,
    dayPlan: input.dayPlan,
    taskSchedules,
    dateKey,
    now,
  });
  const quran = analyzeQuranCoach({
    masteryRoot: input.masteryRoot,
    quranPassages: input.quranPassages,
    tasks: input.tasks,
    now,
  });

  const budget = recovery.active ? recovery.dailyLimit : patterns.estimatedCapacity;
  const coldStart = anyCoachOn
    ? coldStartInsights({
        ...input,
        freeSlots,
        capacity: patterns.estimatedCapacity,
        now,
      })
    : [];

  const rawItems = todayList(
    input.goals,
    input.tasks,
    input.courseCoach,
    now,
    wirds,
    input.coachSettings,
  );

  // Rank smartly using behavioral urgency, Quran consolidation, and scheduled closeness
  const scored: SmartTodayItem[] = rawItems.map(item => {
    const taskId = resolveTaskId(item, input.tasks);
    const sched = taskSchedules[taskId];
    const schedDate = sched?.confirmedDate ?? sched?.initialDate;
    const scheduledTimeToday = schedDate === dateKey ? sched?.confirmedTime ?? sched?.initialTime : undefined;
    const upcomingScheduleDate = schedDate && schedDate >= dateKey ? schedDate : undefined;

    let score = 0;
    let priorityNote = M.priorityDue.text({});

    if (item.reason === 'behind') {
      score += 40;
      priorityNote = M.priorityBehind.text({});
    } else if (item.reason === 'deadline') {
      score += 28;
      priorityNote = M.priorityDeadline.text({});
    } else {
      score += 12;
    }

    if (item.period === 'daily') score += 12;
    else if (item.period === 'weekly') score += 6;
    else score += 2;

    const matchingTask = item.source === 'course' ? input.tasks.find(t => t.id === item.stepId) : undefined;
    if (
      quran.shouldConsolidateFirst &&
      item.source === 'course' &&
      matchingTask?.plan &&
      matchingTask.plan.kind !== 'day'
    ) {
      score += 45;
      priorityNote = M.priorityConsolidate.text({});
    } else if (quran.dueReviews > 0 && item.source === 'course') {
      score += 15;
    }

    if (scheduledTimeToday) score += 8;

    return {
      ...item,
      taskId,
      suggestedSlot: null,
      scheduledTimeToday,
      scheduledDate: upcomingScheduleDate,
      priorityScore: score,
      priorityNote,
    };
  });

  scored.sort((a, b) => b.priorityScore - a.priorityScore);

  // Pair top items with available non-work prayer slots cleanly
  const availableSlots = [
    ...freeSlots.filter(s => !s.inWorkHours),
    ...freeSlots.filter(s => s.inWorkHours),
  ];

  // Put user's peak window slot first when assigning highest priority items
  const peakId = patterns.bestPrayerSlotId;
  if (peakId) {
    availableSlots.sort((a, b) => {
      const aMatch = a.id === peakId || slotWindowForAnchor(a.id) === patterns.peakWindow ? 0 : 1;
      const bMatch = b.id === peakId || slotWindowForAnchor(b.id) === patterns.peakWindow ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  let slotCursor = 0;
  const enriched = scored.map(item => {
    if (item.scheduledTimeToday || item.scheduledDate || availableSlots.length === 0) return item;
    const picked = availableSlots[slotCursor % availableSlots.length];
    slotCursor += 1;
    return {...item, suggestedSlot: picked};
  });

  const recommended = enriched.slice(0, budget);
  const deferred = enriched.slice(budget);

  return {
    anyCoachOn,
    globalEnabled,
    dateKey,
    capacity: patterns.estimatedCapacity,
    budget,
    recovery,
    patterns,
    freeSlots,
    quran,
    coldStart,
    recommended,
    deferred,
    totalOpen: enriched.length,
  };
}

export function buildWeeklyReport(input: SmartCoachInput): WeeklyReport {
  const now = input.now ?? new Date();
  const dateKey = localDate(now);
  const wirds = (input.wirds ?? []) as WirdWithCoach[];
  const patterns = analyzePatterns({...input, now});
  const dismissed = new Set(input.coachSettings?.dismissedWeekly ?? []);

  // 1) Goals pillar
  let goalsDone = 0;
  let goalsExpected = 0;
  let activeGoals = 0;
  const recommendations: WeeklyRecommendation[] = [];

  for (const goal of input.goals) {
    if (!coachOn(goal, input.coachSettings)) continue;
    activeGoals += 1;
    const sum = weeklySummary(goal, now, input.coachSettings);
    goalsDone += sum.done;
    goalsExpected += sum.expected;

    for (const s of suggestionsFor(goal, now, input.coachSettings)) {
      if (dismissed.has(s.id)) continue;
      const step = goalSteps(goal).find(st => st.id === s.stepId);
      const stepName = step ? `«${step.title}»` : '';
      const periodName = {daily: 'يوميًا', weekly: 'أسبوعيًا', monthly: 'شهريًا'} as const;
      let title = `هدف «${goal.title}»`;
      let body = '';
      if (s.kind === 'lighten') {
        title = M.lightenTitle.text({step: stepName});
        body = M.lightenBody.text({step: stepName, goal: goal.title, to: periodName[s.to ?? 'weekly']});
      } else if (s.kind === 'increase') {
        title = M.increaseTitle.text({step: stepName});
        body = M.increaseBody.text({step: stepName, goal: goal.title, to: periodName[s.to ?? 'daily']});
      } else if (s.kind === 'early-warning') {
        title = M.earlyWarningTitle.text({step: stepName});
        body = M.earlyWarningBody.text({step: stepName, goal: goal.title});
      } else {
        title = M.deadlineRiskTitle.text({goal: goal.title});
        body = M.deadlineRiskBody.text({goal: goal.title});
      }
      recommendations.push({
        id: s.id,
        kind: 'goal-suggestion',
        title,
        body,
        goal,
        suggestion: s,
        actionable: Boolean(s.to && s.stepId),
      });
    }
  }

  // 2) Course pillar
  let courseDone = 0;
  let courseExpected = 0;
  let activeCourse = 0;
  const hasCourseActivity =
    input.tasks.some(isPlanTask) ||
    Boolean(input.courseCoach?.log?.day?.length || input.courseCoach?.log?.week?.length || input.courseCoach?.log?.month?.length);
  if (courseCoachOn(input.courseCoach, input.coachSettings) && hasCourseActivity) {
    activeCourse = 1;
    const last7 = new Set(finishedKeys('daily', now, 7));
    const logDays = (input.courseCoach?.log?.day ?? []).filter(k => last7.has(k)).length;
    courseDone = logDays;
    courseExpected = 7;

    for (const w of courseSuggestions(input.courseCoach, now, input.coachSettings)) {
      if (dismissed.has(w.id)) continue;
      recommendations.push({
        id: w.id,
        kind: 'course-warning',
        title: w.stepId === 'course-month' ? M.courseMonthTitle.text({}) : M.courseWeekTitle.text({}),
        body: M.courseWarningBody.text({}),
        suggestion: w,
        actionable: false,
      });
    }
  }

  // 3) Wirds pillar
  let wirdsDone = 0;
  let wirdsExpected = 0;
  let activeWirds = 0;
  const last7Keys = new Set(finishedKeys('daily', now, 7));

  for (const w of wirds) {
    if (!habitOn(w, input.coachSettings)) continue;
    activeWirds += 1;
    const logs = w.coach?.log ?? [];
    if (w.period === 'daily') {
      wirdsExpected += 7;
      wirdsDone += logs.filter(k => last7Keys.has(k)).length;
    } else if (w.period === 'weekly') {
      const prevWeek = finishedKeys('weekly', now, 1)[0];
      wirdsExpected += 1;
      if (prevWeek && logs.includes(prevWeek)) wirdsDone += 1;
    } else {
      const prevMonth = finishedKeys('monthly', now, 1)[0];
      wirdsExpected += 1;
      if (prevMonth && logs.includes(prevMonth)) wirdsDone += 1;
    }

    for (const hs of habitSuggestions(w, now, input.coachSettings)) {
      if (dismissed.has(hs.id)) continue;
      const body =
        hs.kind === 'lighten-target'
          ? M.wirdLightenBody.text({target: w.target, next: hs.target ?? w.target, wird: w.title})
          : hs.kind === 'raise-target'
            ? M.wirdRaiseBody.text({next: hs.target ?? w.target, wird: w.title})
            : M.wirdGapBody.text({wird: w.title});
      recommendations.push({
        id: hs.id,
        kind: 'habit-suggestion',
        title: M.wirdTitle.text({wird: w.title}),
        body,
        wird: w,
        habitSuggestion: hs,
        actionable: hs.target !== undefined,
      });
    }
  }

  // 4) Behavioral rhythm tip
  if (patterns.weakestWeekdayLabel) {
    const tipId = `pattern-weakday:${finishedKeys('weekly', now, 1)[0] ?? dateKey}:${patterns.weakestWeekday}`;
    if (!dismissed.has(tipId)) {
      recommendations.push({
        id: tipId,
        kind: 'pattern-tip',
        title: M.weakDayTitle.text({day: patterns.weakestWeekdayLabel}),
        body: M.weakDayBody.text({day: patterns.weakestWeekdayLabel, peak: patterns.peakWindowLabel}),
        actionable: false,
      });
    }
  }

  const pillars: WeeklyPillarSummary[] = [
    {
      id: 'goals',
      label: 'الأهداف',
      activeCount: activeGoals,
      done: goalsDone,
      expected: goalsExpected,
      rate: goalsExpected > 0 ? goalsDone / goalsExpected : null,
    },
    {
      id: 'course',
      label: 'خطة القرآن',
      activeCount: activeCourse,
      done: courseDone,
      expected: courseExpected,
      rate: courseExpected > 0 ? courseDone / courseExpected : null,
    },
    {
      id: 'wirds',
      label: 'الأوراد',
      activeCount: activeWirds,
      done: wirdsDone,
      expected: wirdsExpected,
      rate: wirdsExpected > 0 ? wirdsDone / wirdsExpected : null,
    },
  ];

  const overallDone = goalsDone + courseDone + wirdsDone;
  const overallExpected = goalsExpected + courseExpected + wirdsExpected;

  return {
    dateKey,
    overallDone,
    overallExpected,
    overallRate: overallExpected > 0 ? overallDone / overallExpected : null,
    pillars,
    patterns,
    recommendations,
  };
}

export function buildCoachHomeSummary(input: SmartCoachInput): CoachHomeSummary {
  const plan = buildSmartTodayPlan(input);
  const overdueCount = plan.recommended.filter(i => i.reason === 'behind').length + plan.deferred.filter(i => i.reason === 'behind').length;
  const nextSlot = plan.freeSlots.find(s => !s.inWorkHours) ?? plan.freeSlots[0] ?? null;

  let subtitle = M.homeInvite.text({});
  if (plan.anyCoachOn) {
    if (plan.recovery.active) {
      subtitle = M.homeRecovery.text({day: plan.recovery.dayNumber, count: plan.recommended.length, slot: nextSlot ? nextSlot.label : null});
    } else if (plan.totalOpen > 0) {
      subtitle = M.homeSuggested.text({count: plan.recommended.length, slot: nextSlot ? nextSlot.label : null});
    } else {
      subtitle = M.homeAllDone.text({});
    }
  }

  return {
    anyActive: plan.anyCoachOn,
    globalEnabled: plan.globalEnabled,
    recommendedCount: plan.recommended.length,
    totalOpen: plan.totalOpen,
    recoveryActive: plan.recovery.active,
    recoveryDay: plan.recovery.dayNumber,
    nextSlot,
    overdueCount,
    subtitle,
  };
}
