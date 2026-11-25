import type {State, Task, Wird} from '../app-state';
import type {QuranLearningState} from '../quran/types';
import type {MasteryStateRoot, MasteryPlan} from '../quran-mastery/types';
import type {ActiveBilQuranPlanState} from '../quran-mastery/bilquran-plans';
import {goalSteps, type Goal} from '../goal-plan';
import {localDay} from '../quran-mastery/planning';
import {planProgress} from '../quran/learning';
import {isTaskDone} from '../task-periods';
import {addDaysKey, daysBetweenInclusive, inRange, periodRange, weekdayOf, type PeriodId} from './dates';
import type {AchievementEntry} from './log';

// ألوان الحالة تتبع الإنجاز الفعلي مقابل المقرر. «لا بيانات» و«راحة» ليستا تقصيرًا.
export type Tone = 'good' | 'steady' | 'behind' | 'none';
export type Stat = {headline: string; detail: string; ratio?: number; tone: Tone; status: string};

export function toneOf(done: number, planned: number): Tone {
  if (planned <= 0) return 'none';
  const r = done / planned;
  return r >= 0.8 ? 'good' : r >= 0.5 ? 'steady' : 'behind';
}
export const statusOf = (tone: Tone): string => tone === 'good' ? 'على الخطة' : tone === 'steady' ? 'قريب من الخطة' : tone === 'behind' ? 'متأخر عن الخطة' : 'لا مقرر أو لا سجل بعد';
export const ratioOf = (done: number, planned: number) => planned > 0 ? Math.min(1, done / planned) : undefined;

// ============ القرآن: تغطية الآيات بلا عدّ مزدوج ============
export type VerseState = 'started' | 'weak' | 'mastered';
type Evidence = {state: VerseState; at: string};
export type Coverage = {started: number; mastered: number; weak: number; undated: number};

function pick(a: Evidence | undefined, b: Evidence): Evidence {
  if (!a) return b;
  if (a.at && b.at && a.at !== b.at) return a.at > b.at ? a : b; // الأحدث تقييمًا يغلب
  if (!!a.at !== !!b.at) return a.at ? a : b;                     // المؤرّخ يغلب غير المؤرّخ
  const rank = {weak: 3, started: 2, mastered: 1} as const;       // عند التساوي: الأحوط
  return rank[a.state] >= rank[b.state] ? a : b;
}

/** اتحاد مفاتيح الآيات من المخزنين. الآية تُحسب مرة واحدة، والأحدث دليلًا هو المعتمد. */
export function verseCoverage(root: MasteryStateRoot | null | undefined, quran: Pick<QuranLearningState, 'passages'>): Coverage {
  const map = new Map<string, Evidence>();
  const put = (key: string, ev: Evidence) => map.set(key, pick(map.get(key), ev));
  if (root) {
    const started = new Set(root.sessions.map(s => s.passageId));
    for (const p of root.passages) {
      if (!started.has(p.id)) continue;
      const proj = root.projections.find(x => x.passageId === p.id);
      const state: VerseState = proj?.state === 'mastered' ? 'mastered' : proj?.state === 'needs_reinforcement' ? 'weak' : 'started';
      const at = proj?.updatedAt ?? '';
      for (const r of p.group && p.group.length ? p.group : [p.range]) for (let a = r.ayahStart; a <= r.ayahEnd; a++) put(`${r.surah}:${a}`, {state, at});
    }
  }
  for (const p of quran.passages) {
    if (p.contentType !== 'quran' || p.state === 'new' || p.surah == null || p.ayahStart == null || p.ayahEnd == null) continue;
    const state: VerseState = p.state === 'mastered' ? 'mastered' : p.state === 'needs_revision' ? 'weak' : 'started';
    for (let a = p.ayahStart; a <= p.ayahEnd; a++) put(`${p.surah}:${a}`, {state, at: p.lastReviewedAt ?? ''});
  }
  let mastered = 0, weak = 0, undated = 0;
  for (const ev of map.values()) { if (ev.state === 'mastered') mastered++; if (ev.state === 'weak') weak++; if (!ev.at) undated++; }
  return {started: map.size, mastered, weak, undated};
}

// ============ القرآن: الانتظام مع الخطة ============
export type DayKind = 'done' | 'partial' | 'missed' | 'pending' | 'off' | 'unknown' | 'future';
export type PlanDay = {date: string; kind: DayKind; verses: number; target: number; sched: boolean};
export type PlanWindow = {plan: MasteryPlan; days: PlanDay[]; assigned: number; full: number; plannedVerses: number; doneVerses: number};

/** آيات الحفظ الجديد المكتملة لكل يوم محلي ضمن خطة بعينها. */
export function versesByDay(root: MasteryStateRoot, plan: MasteryPlan): Map<string, Set<string>> {
  const zone = plan.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const own = new Set(root.passages.filter(p => p.planId === plan.id).map(p => p.id));
  const out = new Map<string, Set<string>>();
  for (const s of root.sessions) {
    if (s.purpose !== 'new' || s.completionReason !== 'completed' || !s.endedAt || !own.has(s.passageId)) continue;
    const day = localDay(new Date(s.endedAt), zone);
    const set = out.get(day) ?? new Set<string>();
    for (let a = s.range.ayahStart; a <= s.range.ayahEnd; a++) set.add(`${s.range.surah}:${a}`);
    out.set(day, set);
  }
  return out;
}

export function activeMasteryPlan(root: MasteryStateRoot | null | undefined): MasteryPlan | undefined {
  return root?.plans.filter(p => p.status === 'active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function planWindow(root: MasteryStateRoot, plan: MasteryPlan, period: PeriodId, now = new Date()): PlanWindow {
  const range = periodRange(period, now);
  const byDay = versesByDay(root, plan);
  const zone = plan.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const created = localDay(new Date(plan.createdAt), zone);
  const target = Math.max(1, plan.dailyTargetVerses);
  const weekdays = plan.weekdays?.length ? plan.weekdays : [0, 1, 2, 3, 4, 5, 6];
  const days: PlanDay[] = daysBetweenInclusive(range.start, range.end).map(date => {
    const verses = byDay.get(date)?.size ?? 0;
    let kind: DayKind;
    if (date > range.today) kind = 'future';
    else if (date < created) kind = 'unknown';
    else if (!weekdays.includes(weekdayOf(date))) kind = verses > 0 ? 'done' : 'off';
    else if (verses >= target) kind = 'done';
    else if (verses > 0) kind = 'partial';
    else kind = date === range.today ? 'pending' : 'missed';
    return {date, kind, verses, target, sched: weekdays.includes(weekdayOf(date))};
  });
  const assignedDays = days.filter(d => ['done', 'partial', 'missed', 'pending'].includes(d.kind) && weekdays.includes(weekdayOf(d.date)));
  // المقرر حتى اليوم: أيام مقررة مضت، واليوم نفسه فقط إن بدأ أو اكتمل.
  const counted = assignedDays.filter(d => d.kind !== 'pending');
  return {
    plan, days,
    assigned: counted.length,
    full: counted.filter(d => d.kind === 'done').length,
    plannedVerses: counted.length * target,
    doneVerses: counted.reduce((n, d) => n + d.verses, 0),
  };
}

export function readingIn(quran: Pick<QuranLearningState, 'history'>, range: {start: string; end: string}) {
  const keys = new Set<string>();
  let sessions = 0;
  for (const h of quran.history) {
    const day = h.readAt.slice(0, 10);
    if (!inRange(day, range)) continue;
    sessions++;
    for (let a = h.ayahStart; a <= h.ayahEnd; a++) keys.add(`${h.surah}:${a}`);
  }
  // السجل محدود بآخر ٥٠٠ جلسة: إن كان أقدم عنصر فيه داخل المدى فقد تكون هناك جلسات أقدم محذوفة.
  const oldest = quran.history.length ? quran.history[quran.history.length - 1].readAt.slice(0, 10) : '';
  const truncated = quran.history.length >= 500 && oldest >= range.start;
  return {sessions, verses: keys.size, truncated};
}

export function logDays(log: AchievementEntry[] | undefined, kind: AchievementEntry['kind'], range: {start: string; end: string}, refId?: string) {
  return new Set((log ?? []).filter(e => e.kind === kind && inRange(e.date, range) && (refId === undefined || e.refId === refId)).map(e => e.date));
}
export const firstLogDate = (log: AchievementEntry[] | undefined, kind: AchievementEntry['kind']) =>
  (log ?? []).filter(e => e.kind === kind).map(e => e.date).sort()[0];

export function bilQuranSummary(plan: ActiveBilQuranPlanState | null, totalSteps: number, log: AchievementEntry[] | undefined, range: {start: string; end: string}) {
  if (!plan) return null;
  return {planId: plan.planId, done: new Set(plan.completedIndices).size, total: totalSteps, daysLogged: logDays(log, 'bilquran_step', range, plan.planId).size};
}

// ============ السنة ============
export function sunnahStats(quran: QuranLearningState, range: {start: string; end: string}) {
  const hadith = quran.passages.filter(p => p.contentType === 'hadith');
  const ids = new Set(hadith.map(p => p.id));
  const plans = quran.plans.filter(p => p.contentType === 'hadith' && p.status === 'active').map(p => ({plan: p, progress: planProgress(p, quran.passages)}));
  const reviewedPassed = quran.revisionEvents.filter(e => ids.has(e.passageId) && e.outcome === 'passed' && inRange(e.reviewedAt.slice(0, 10), range)).length;
  const days = new Set(quran.activityLog.filter(e => (e.kind === 'hadith_reading' || e.kind === 'hadith_memorization') && inRange(e.date, range)).map(e => e.date));
  return {total: hadith.length, mastered: hadith.filter(p => p.state === 'mastered').length, started: hadith.filter(p => p.state !== 'new').length, plans, reviewedPassed, routineDays: days.size};
}

// ============ الأهداف ============
export function goalStats(goals: Goal[], period: PeriodId, now = new Date()) {
  const range = periodRange(period, now);
  const days = daysBetweenInclusive(range.start, range.end).filter(d => d <= range.today);
  let planned = 0, done = 0;
  for (const goal of goals) {
    const from = goal.createdAt ?? '0000-00-00', to = goal.targetDate ?? '9999-99-99';
    for (const step of goalSteps(goal)) {
      if (step.period === 'daily') {
        for (const d of days) if (d >= from && d <= to) { planned++; if (step.done[d]) done++; }
      } else if (step.period === 'custom') {
        if (step.customDate && inRange(step.customDate, range) && step.customDate <= range.today) { planned++; if (Object.values(step.done).some(Boolean)) done++; }
      } else {
        // أسبوعية/شهرية/سنوية: تُعدّ الفترات التي تنتهي ضمن المدى أو تبدأ فيه وقد بدأت فعلًا.
        const keys = new Set<string>();
        for (const d of days) keys.add(step.period === 'weekly' ? addDaysKey(d, -((new Date(`${d}T12:00:00`).getDay() + 6) % 7)) : step.period === 'monthly' ? d.slice(0, 7) : d.slice(0, 4));
        for (const k of keys) { planned++; if (step.done[k]) done++; }
      }
    }
  }
  return {planned, done};
}

// ============ الصلاة ============
export function prayerStats(records: State['dayRecords'], period: PeriodId, now = new Date()) {
  const range = periodRange(period, now);
  let ontime = 0, late = 0, excused = 0, missed = 0, days = 0;
  for (const d of daysBetweenInclusive(range.start, range.end)) {
    if (d > range.today) break;
    days++;
    for (const v of Object.values(records?.[d]?.prayers ?? {})) { if (v === 'ontime') ontime++; else if (v === 'late') late++; else if (v === 'excused') excused++; else missed++; }
  }
  const recorded = ontime + late + excused + missed;
  return {ontime, late, excused, missed, recorded, expected: days * 5, unknown: Math.max(0, days * 5 - recorded)};
}

// ============ المهام والأوراد: الفترة الحالية فقط، لأن التطبيق لا يحفظ تاريخها ============
export function taskStats(tasks: Task[], now = new Date()) {
  const counted = tasks;
  return {done: counted.filter(t => isTaskDone(t, now)).length, total: counted.length};
}
export function wirdStats(wirds: Wird[]) {
  return {complete: wirds.filter(w => w.target > 0 && w.count >= w.target).length, total: wirds.length};
}
