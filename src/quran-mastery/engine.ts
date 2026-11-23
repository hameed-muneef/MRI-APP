// نواة محرك الإتقان (المرحلة الثانية): منطق خالص بلا إطار عمل — حالة الجلسة،
// التكرار، الربط التدريجي، التقييم الذاتي، إسقاط الإتقان وجدولة المراجعة.
// لا يُمنح «متقن» أبدًا من إكمال جلسة؛ فقط من تقييم ذاتي مرتبط بمحاولة
// استرجاع مُباعدة زمنيًا، وبإصدار سياسة موثّق داخل الإسقاط نفسه.

import {
  Assessment, AssessmentLabel, MasteryPlan, MasteryProjection, MasterySession,
  MasteryStateRoot, MasteryPassage, RecallAttempt, RepetitionEvent, RepetitionScope,
  RevisionSchedule, REVISION_INTERVALS, SessionPurpose, SessionStage, VerseRange,
  MASTERY_POLICY_VERSION,
} from './types';

// ============ أدوات التاريخ (محلية، مستقلة عن مخزن rabbani-v1) ============

export const dateKey = (now = new Date()): string => {
  const year=now.getFullYear(),month=String(now.getMonth()+1).padStart(2,'0'),day=String(now.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
};

export function addDays(key: string, days: number): string {
  const value = new Date(`${key}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateKey(value);
}

// ============ مراحل الجلسة ============

export const STAGE_LABELS: Record<SessionStage, string> = {
  listen: 'استمع',
  understand: 'افهم',
  memorize: 'احفظ',
  connect: 'اربط',
  recite: 'تلو',
  assess: 'قيّم',
};

/** جلستا الغرضين تتشاركان الآليات نفسها؛ المراجعة تبدأ من التلاوة والاختبار. */
export function stagesFor(purpose: SessionPurpose): SessionStage[] {
  return purpose === 'new'
    ? ['listen', 'understand', 'memorize', 'connect', 'recite', 'assess']
    : ['recite', 'assess'];
}

export function createSession(args: {
  purpose: SessionPurpose;
  passageId: string;
  range: VerseRange;
  newId: () => string;
  now?: Date;
}): MasterySession {
  const now = args.now ?? new Date();
  const stages = stagesFor(args.purpose);
  return {
    id: args.newId(),
    purpose: args.purpose,
    passageId: args.passageId,
    range: args.range,
    stage: stages[0],
    stages,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** التقدم للمرحلة التالية؛ آخر مرحلة تُنهي الجلسة بسبب «completed». */
export function advanceStage(session: MasterySession, now = new Date()): MasterySession {
  if (session.endedAt) return session;
  const index = session.stages.indexOf(session.stage);
  if (index === session.stages.length - 1) {
    return {...session, endedAt: now.toISOString(), updatedAt: now.toISOString(), completionReason: 'completed'};
  }
  return {...session, stage: session.stages[index + 1], updatedAt: now.toISOString()};
}

/** مقاطعة (خروج، مكالمة، خلفية): تُغلق الجلسة وتُحفظ المرحلة للاستئناف. */
export function interruptSession(session: MasterySession, now = new Date()): MasterySession {
  if (session.endedAt) return session;
  return {...session, endedAt: now.toISOString(), updatedAt: now.toISOString(), completionReason: 'interrupted'};
}

export function abandonSession(session: MasterySession, now = new Date()): MasterySession {
  if (session.endedAt) return session;
  return {...session, endedAt: now.toISOString(), updatedAt: now.toISOString(), completionReason: 'abandoned'};
}

/**
 * الاستئناف: يبدأ جلسة جديدة على المرحلة نفسها التي توقفت عندها الجلسة
 * المقطوعة؛ لا يُعاد فتح سجل منتهٍ أبدًا (السجلات تاريخ ثابت).
 */
export function resumeSession(session: MasterySession, newId: () => string, now = new Date()): MasterySession {
  const resumed = createSession({
    purpose: session.purpose, passageId: session.passageId, range: session.range, newId, now,
  });
  return {...resumed, stage: session.stage};
}

/** أحدث جلسة مقطوعة لمقطع ما، إن وُجدت. */
export function lastInterruptedSession(sessions: MasterySession[], passageId: string): MasterySession | undefined {
  return sessions
    .filter(session => session.passageId === passageId && session.completionReason === 'interrupted')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

// ============ التكرار ============

export function createRepetitionEvent(args: {
  sessionId: string;
  scope: RepetitionScope;
  configured: number;
  newId: () => string;
  surah?: number;
  ayah?: number;
  groupRefs?: string[];
  source?: RepetitionEvent['source'];
  reciterId?: number;
  now?: Date;
}): RepetitionEvent {
  const now = args.now ?? new Date();
  return {
    id: args.newId(),
    sessionId: args.sessionId,
    scope: args.scope,
    surah: args.surah,
    ayah: args.ayah,
    groupRefs: args.groupRefs,
    configured: Math.max(1, Math.round(args.configured)),
    completed: 0,
    interrupted: 0,
    source: args.source ?? 'recitation',
    reciterId: args.reciterId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** تشغيل مكتمل فقط يرفع العدّاد. */
export function completePlayback(event: RepetitionEvent, now = new Date()): RepetitionEvent {
  return {...event, completed: event.completed + 1, updatedAt: now.toISOString()};
}

/** تشغيل قُطع قبل نهايته: يُسجَّل interrupted ولا يرفع completed. */
export function interruptPlayback(event: RepetitionEvent, now = new Date()): RepetitionEvent {
  return {...event, interrupted: event.interrupted + 1, updatedAt: now.toISOString()};
}

export function repetitionDone(event: RepetitionEvent): boolean {
  return event.completed >= event.configured;
}

/** تقدم العرض: لا يتجاوز ١٠٠٪ مهما زادت التشغيلات. */
export function repetitionProgress(event: RepetitionEvent): number {
  return Math.min(1, event.completed / event.configured);
}

// ============ الربط التدريجي ============

const sameRange = (a: VerseRange, b: VerseRange) =>
  a.surah === b.surah && a.ayahStart === b.ayahStart && a.ayahEnd === b.ayahEnd;

/**
 * سلاسل الربط داخل المقطع: ١، ثم ١–٢، ثم ١–٣ … حتى المقطع كاملًا.
 * تختلف عن تمرين ترتيب الآيات الحالي (خلط وإعادة ترتيب).
 */
export function connectionChains(range: VerseRange): VerseRange[] {
  const chains: VerseRange[] = [];
  for (let end = range.ayahStart; end <= range.ayahEnd; end += 1) {
    chains.push({surah: range.surah, ayahStart: range.ayahStart, ayahEnd: end});
  }
  return chains;
}

/**
 * ربط بالمحفوظ السابق في الجلسة التالية: إن كان المقطع السابق ملاصقًا في
 * السورة نفسها، يُقترح نطاق ممتد من بداية السابق إلى نهاية الحالي.
 */
export function connectionWithPrevious(current: VerseRange, previous?: VerseRange): VerseRange {
  if (!previous) return current;
  const contiguous = previous.surah === current.surah && previous.ayahEnd + 1 === current.ayahStart;
  if (!contiguous || sameRange(previous, current)) return current;
  return {surah: current.surah, ayahStart: previous.ayahStart, ayahEnd: current.ayahEnd};
}

// ============ محاولات الاسترجاع ============

export function createRecallAttempt(args: {
  sessionId: string;
  range: VerseRange;
  hideMode: RecallAttempt['hideMode'];
  newId: () => string;
  now?: Date;
}): RecallAttempt {
  const now = args.now ?? new Date();
  return {
    id: args.newId(),
    sessionId: args.sessionId,
    range: args.range,
    hideMode: args.hideMode,
    helpEvents: [],
    difficultVerses: [],
    createdAt: now.toISOString(),
  };
}

export function markDifficultVerse(attempt: RecallAttempt, verseRef: string): RecallAttempt {
  if (attempt.difficultVerses.includes(verseRef)) return attempt;
  return {...attempt, difficultVerses: [...attempt.difficultVerses, verseRef]};
}

// ============ التقييم وإسقاط الإتقان ============

export type AssessmentOutcome = {
  assessment: Assessment;
  projection: MasteryProjection;
  schedule: RevisionSchedule;
  /** true حين مُنحت حالة «متقن» فعليًا (تقييم متقن + دليل مُباعد). */
  masteryGranted: boolean;
  /** true حين سُجّل التقييم في يوم دليل سابق لهذا المقطع (لا يبني دليلًا جديدًا). */
  sameDayRetry: boolean;
};

const defaultSchedule = (passageId: string, now: Date): RevisionSchedule => ({
  passageId,
  dueDate: dateKey(now),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  intervalIndex: 0,
  lapses: 0,
  deferrals: [],
  updatedAt: now.toISOString(),
});

/** Policy mastery-v1: complete unassisted recall advances at most once per due local day.
 * Mastered requires all five spaced ladder steps and an explicit mastered rating.
 * Self-report, assisted, early or same-day retries never advance evidence.
 */
export function applyAssessment(root: MasteryStateRoot, args: {
  passageId: string;
  attemptId: string;
  label: AssessmentLabel;
  selfReport?: boolean;
  newId: () => string;
  now?: Date;
}): {root: MasteryStateRoot; outcome: AssessmentOutcome} {
  const now = args.now ?? new Date();
  const today = dateKey(now);
  const attempt = root.recallAttempts.find(item => item.id === args.attemptId);
  const session = root.sessions.find(item => item.id === attempt?.sessionId);
  if (!attempt || !session || session.passageId !== args.passageId) throw new Error('محاولة الاسترجاع غير مرتبطة بالمقطع');
  if (root.assessments.some(item => item.attemptId === args.attemptId)) throw new Error('تم تقييم هذه المحاولة بالفعل');
  const selfReport = args.selfReport === true || !attempt.completedAt;
  const unassisted = !selfReport && attempt.helpEvents.length === 0 && attempt.hideMode !== 'B';

  const assessment: Assessment = {
    id: args.newId(),
    attemptId: args.attemptId,
    passageId: args.passageId,
    label: args.label,
    actor: 'self',
    selfReport,
    createdAt: now.toISOString(),
  };

  const previousSchedule = root.schedules.find(item => item.passageId === args.passageId);
  const scheduleBase = previousSchedule ?? defaultSchedule(args.passageId, now);
  const priorEvidenceDate = scheduleBase.lastEvidenceDate;
  const sameDayRetry = priorEvidenceDate === today;
  const eligible = unassisted && !sameDayRetry && (!priorEvidenceDate || scheduleBase.dueDate <= today);
  const positive = args.label === 'mastered' || args.label === 'good';
  const previousProjection = root.projections.find(item => item.passageId === args.passageId);
  let intervalIndex = scheduleBase.intervalIndex;
  let lapses = scheduleBase.lapses;
  if (!positive) {
    intervalIndex = 0;
    lapses += sameDayRetry ? 0 : 1;
  } else if (eligible) intervalIndex = Math.min(REVISION_INTERVALS.length - 1, intervalIndex + 1);
  const masteryGranted = args.label === 'mastered' && eligible && intervalIndex === REVISION_INTERVALS.length - 1;
  const state: MasteryProjection['state'] = !positive ? 'needs_reinforcement'
    : masteryGranted ? 'mastered' : previousProjection?.state === 'mastered' && unassisted ? 'mastered' : 'in_progress';
  const evidence = eligible && positive ? [...(previousProjection?.evidence ?? []), assessment.id]
    : positive ? (previousProjection?.evidence ?? []) : [];
  const projection: MasteryProjection = {
    passageId: args.passageId, state, evidence,
    policyVersion: MASTERY_POLICY_VERSION, updatedAt: now.toISOString(),
  };
  const schedule: RevisionSchedule = {
    ...scheduleBase, intervalIndex, lapses,
    dueDate: !positive || eligible ? addDays(today, REVISION_INTERVALS[intervalIndex]) : scheduleBase.dueDate,
    lastEvidenceDate: eligible || !positive ? today : priorEvidenceDate,
    updatedAt: now.toISOString(),
  };

  const replace = <T extends {passageId: string}>(list: T[], item: T): T[] => {
    const rest = list.filter(existing => existing.passageId !== item.passageId);
    return [...rest, item];
  };

  const next: MasteryStateRoot = {
    ...root,
    assessments: [...root.assessments, assessment],
    projections: replace(root.projections, projection),
    schedules: replace(root.schedules, schedule),
    updatedAt: now.toISOString(),
  };
  return {root: next, outcome: {assessment, projection, schedule, masteryGranted, sameDayRetry}};
}

/** هل يحق لمقطع ما أن يُمنح «متقن» عند تقييمه اليوم؟ (دليل مُباعد قائم) */
export function eligibleForMastery(root: MasteryStateRoot, passageId: string, now = new Date()): boolean {
  const schedule = root.schedules.find(item => item.passageId === passageId);
  if (!schedule?.lastEvidenceDate) return false;
  return schedule.lastEvidenceDate < dateKey(now);
}

// ============ الخطط والمقاطع ============

/** تقسيم نطاق الخطة إلى مقاطع ثابتة المراجع (سورة واحدة لكل مقطع، بلا نصوص). */
export function buildMasteryPassages(plan: MasteryPlan, newId: () => string, now = new Date()): MasteryPassage[] {
  const stamp = now.toISOString();
  const size = Math.max(1, Math.round(plan.dailyTargetVerses));
  const passages: MasteryPassage[] = [];
  let start = plan.range.ayahStart;
  let order = 0;
  while (start <= plan.range.ayahEnd) {
    const end = Math.min(plan.range.ayahEnd, start + size - 1);
    passages.push({
      id: newId(), planId: plan.id, order,
      range: {surah: plan.range.surah, ayahStart: start, ayahEnd: end},
      schemaVersion: plan.schemaVersion, createdAt: stamp, updatedAt: stamp,
    });
    start = end + 1;
    order += 1;
  }
  return passages;
}

/** أول مقطع لم تبدأ له جلسة بعد ضمن خطة نشطة. */
export function nextNewPassage(root: MasteryStateRoot, planId: string): MasteryPassage | undefined {
  const started = new Set(root.sessions.map(session => session.passageId));
  return root.passages
    .filter(passage => passage.planId === planId)
    .sort((a, b) => a.order - b.order)
    .find(passage => !started.has(passage.id));
}

/** المقاطع المستحقة للمراجعة اليوم (ذات دليل قائم)، مرتبة بالأقدم. */
export function dueSchedules(root: MasteryStateRoot, today = dateKey()): RevisionSchedule[] {
  return root.schedules
    .filter(schedule => schedule.lastEvidenceDate && schedule.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function passageLabel(passage: MasteryPassage): string {
  const {range} = passage;
  return range.ayahStart === range.ayahEnd
    ? `آية ${range.ayahStart}`
    : `آية ${range.ayahStart}–${range.ayahEnd}`;
            }
