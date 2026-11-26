import type {Task} from '../app-state';
import {goalPeriodKey} from '../goal-plan';
import type {ActiveBilQuranPlanState, BilQuranDailyStep, BilQuranPlanSpec, HifzSegment} from './bilquran-plans';
import {buildWeeklyReviewSegments} from './bilquran-plans';

// يربط خطة الحفظ الثابتة بالمهام: مهمة يومية لمقرر اليوم، وأسبوعية لمراجعة الربط، وشهرية لمراجعة الشهر.
// المعرّفات حتمية فلا تتكرر المهام. التقدّم يبقى قائمًا على الإنجاز لا على التاريخ، ولا تُنشأ جداول تنبيه جديدة.
export const PLAN_TASK_PREFIX = 'bilquran:';
export const PLAN_SOURCE_LABEL = 'خطة الحفظ';
/** مراجعة الشهر تغطي آخر ٤ أسابيع من المقررات بحد أعلى للجلسة. */
export const MONTH_REVIEW_MAX_STEPS = 24;

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDay = (key: string, n: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lastDayOfMonth = (monthKey: string) => { const [y, m] = monthKey.split('-').map(Number); return `${monthKey}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`; };

export const isPlanTask = (t: Task) => !!t.plan && t.id.startsWith(PLAN_TASK_PREFIX);

export type PlanTaskInput = {
  tasks: Task[];
  plan: ActiveBilQuranPlanState;
  spec: BilQuranPlanSpec;
  steps: BilQuranDailyStep[];
  /** وصف مقرر اليوم (اسم السورة والآيات) يُبنى من نص المصحف المحمّل. */
  summarize: (step: BilQuranDailyStep) => string;
  /** عدد مراجعات الإتقان المستحقة الآن؛ يظهر ملاحظةً فقط ولا يغيّر الخطة. */
  dueReviews?: number;
  now?: Date;
};

/** هل أُنجز مقرر اليوم بالفعل في هذا اليوم؟ حينها لا تُفتح مهمة الغد قبل موعدها. */
export function stepFinishedToday(plan: ActiveBilQuranPlanState, now: Date): boolean {
  return plan.completedIndices.includes(plan.currentIndex - 1) && localDay(new Date(plan.updatedAt)) === localDay(now);
}

/** يُرجع قائمة المهام بعد المطابقة. لا يمسّ إلا المهام التي تحمل plan، وبقية مهام المستخدم تبقى كما هي. */
export function reconcilePlanTasks(input: PlanTaskInput): Task[] {
  const {tasks, plan, spec, steps, summarize} = input;
  const now = input.now ?? new Date();
  const today = localDay(now);
  const wanted: Task[] = [];
  const pid = plan.planId;
  const done = (id: string) => tasks.find(t => t.id === id);

  const current = steps[plan.currentIndex];
  const finished = plan.completedIndices.includes(plan.currentIndex);
  if (current && !finished && !stepFinishedToday(plan, now)) {
    const id = `${PLAN_TASK_PREFIX}${pid}:d:${current.index}`;
    const due = input.dueReviews ?? 0;
    const note = due > 0 ? ` (ومعه ${due} مراجعة مستحقة)` : '';
    const old = done(id);
    wanted.push({
      ...(old ?? {}), id, period: 'daily', done: old?.done ?? false, optional: false, doneKey: old?.doneKey,
      title: `مقرر اليوم ${current.dayNumber}: ${summarize(current)}${note}`,
      scheduledDate: today, sourceLabel: PLAN_SOURCE_LABEL, plan: {planId: pid, kind: 'day', step: current.index},
    });
  }

  if (plan.currentIndex > 0) {
    const weekStart = goalPeriodKey('weekly', now);
    const id = `${PLAN_TASK_PREFIX}${pid}:w:${weekStart}`;
    const old = done(id);
    wanted.push({
      ...(old ?? {}), id, period: 'weekly', done: old?.done ?? false, optional: false, doneKey: old?.doneKey,
      title: 'مراجعة ربط الأسبوع', weekStart, scheduledDate: addDay(weekStart, 4),
      sourceLabel: PLAN_SOURCE_LABEL, plan: {planId: pid, kind: 'week'},
    });
  }

  if (plan.currentIndex > spec.daysPerWeek) {
    const monthKey = goalPeriodKey('monthly', now);
    const id = `${PLAN_TASK_PREFIX}${pid}:m:${monthKey}`;
    const old = done(id);
    wanted.push({
      ...(old ?? {}), id, period: 'monthly', done: old?.done ?? false, optional: false, doneKey: old?.doneKey,
      title: 'مراجعة الشهر', monthKey, scheduledDate: lastDayOfMonth(monthKey),
      sourceLabel: PLAN_SOURCE_LABEL, plan: {planId: pid, kind: 'month'},
    });
  }

  // نحذف فقط مهام الخطة المولَّدة التي لم تعد مطلوبة (مقرر سابق أو أسبوع/شهر مضى)؛ المنجز منها يبقى في سجل الإنجاز.
  const wantedIds = new Set(wanted.map(w => w.id));
  const keep = tasks.filter(t => !isPlanTask(t));
  const existing = tasks.filter(t => isPlanTask(t) && wantedIds.has(t.id));
  const merged = [...keep, ...wanted];
  // لا تغيير فعلي: أعد المصفوفة نفسها لتجنّب إعادة حفظ بلا داعٍ.
  const same = merged.length === tasks.length && merged.every(m => JSON.stringify(m) === JSON.stringify(tasks.find(t => t.id === m.id)))
    && existing.length === wanted.length;
  return same ? tasks : merged;
}

/** عند حذف الخطة النشطة تُزال المهام المولَّدة لها فقط. */
export function clearPlanTasks(tasks: Task[]): Task[] {
  return tasks.some(isPlanTask) ? tasks.filter(t => !isPlanTask(t)) : tasks;
}

export type PlanLaunch = {surah: number; ayahStart: number; ayahEnd: number; mode: 'new' | 'review'; autoStart: true; planStepIndex?: number; group?: {surah: number; ayahStart: number; ayahEnd: number}[]};

const toGroup = (segs: HifzSegment[]) => segs.map(g => ({surah: g.surah, ayahStart: g.from, ayahEnd: g.to}));

/** ما يُفتح في مصحف الحفظ عند الضغط على مهمة الخطة؛ يُحسب لحظة الفتح من حالة الخطة الحالية. */
export function planTaskLaunch(task: Pick<Task, 'plan'>, plan: ActiveBilQuranPlanState, spec: BilQuranPlanSpec, steps: BilQuranDailyStep[]): PlanLaunch | null {
  const kind = task.plan?.kind;
  let segs: HifzSegment[] = [];
  let stepIndex: number | undefined;
  if (kind === 'day') {
    const step = steps[task.plan?.step ?? plan.currentIndex];
    if (!step) return null;
    segs = step.segments; stepIndex = step.index;
  } else if (plan.currentIndex < 1) {
    return null;
  } else if (kind === 'week') {
    segs = buildWeeklyReviewSegments(steps, plan.currentIndex, spec.daysPerWeek);
  } else if (kind === 'month') {
    segs = buildWeeklyReviewSegments(steps, plan.currentIndex, Math.min(MONTH_REVIEW_MAX_STEPS, spec.daysPerWeek * 4));
  }
  if (!segs.length) return null;
  const [first, ...rest] = segs;
  return {surah: first.surah, ayahStart: first.from, ayahEnd: first.to, mode: stepIndex !== undefined ? 'new' : 'review', autoStart: true,
    ...(stepIndex !== undefined ? {planStepIndex: stepIndex} : {}), ...(rest.length ? {group: toGroup(segs)} : {})};
}
