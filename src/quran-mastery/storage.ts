// مخزن تعلّم محلي جديد، مستقل ومرقّم الإصدار: `rabbani-mastery-v1`.
// بيانات التطبيق الحالية (`rabbani-v1`) لا تُقرأ هنا ولا تُرحَّل ولا تُعدَّل.
// الكتابة ذرية بقدر ما يسمح localStorage: تُبنى الحمولة كاملة وتُكتب في
// مفتاح مؤقت ثم الرئيسي، وأي حمولة تالفة تُحجَز في مفتاح حجر بدل ضياعها.

import {z} from 'zod';
import {MASTERY_SCHEMA_VERSION, MASTERY_STORAGE_KEY, MasteryStateRoot} from './types';

const TEMP_KEY = `${MASTERY_STORAGE_KEY}:pending`;
const QUARANTINE_KEY = `${MASTERY_STORAGE_KEY}:quarantine`;

const verseRangeSchema = z.object({
  surah: z.number().int().min(1).max(114),
  ayahStart: z.number().int().min(1),
  ayahEnd: z.number().int().min(1),
}).refine(range => range.ayahEnd >= range.ayahStart, {message: 'ayahEnd قبل ayahStart'});

const planSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  range: verseRangeSchema,
  dailyTargetVerses: z.number().int().min(1),
  repeatPreset: z.number().int().min(1),
  status: z.enum(['active', 'paused', 'completed']),
  schemaVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const passageSchema = z.object({
  id: z.string().min(1),
  planId: z.string().optional(),
  range: verseRangeSchema,
  order: z.number().int(),
  schemaVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const sessionSchema = z.object({
  id: z.string().min(1),
  purpose: z.enum(['new', 'revision']),
  passageId: z.string().min(1),
  range: verseRangeSchema,
  stage: z.enum(['listen', 'understand', 'memorize', 'connect', 'recite', 'assess']),
  stages: z.array(z.enum(['listen', 'understand', 'memorize', 'connect', 'recite', 'assess'])).min(1),
  startedAt: z.string(),
  updatedAt: z.string(),
  endedAt: z.string().optional(),
  completionReason: z.enum(['completed', 'abandoned', 'interrupted']).optional(),
});

const repetitionEventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  scope: z.enum(['verse', 'group', 'passage']),
  surah: z.number().int().optional(),
  ayah: z.number().int().optional(),
  groupRefs: z.array(z.string()).optional(),
  configured: z.number().int().min(1),
  completed: z.number().int().min(0),
  interrupted: z.number().int().min(0),
  source: z.enum(['recitation', 'self_recording']),
  reciterId: z.number().int().optional(),
  reciterHistory: z.array(z.object({reciterId:z.number().int(),at:z.string(),completedBefore:z.number().int()})).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const recallAttemptSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  range: verseRangeSchema,
  hideMode: z.enum(['A', 'B', 'D', 'E']),
  helpEvents: z.array(z.object({
    kind: z.enum(['reveal_verse', 'reveal_all', 'hint_first_word']),
    surah: z.number().int().optional(),
    ayah: z.number().int().optional(),
    at: z.string(),
  })),
  difficultVerses: z.array(z.string()),
  recordingId: z.string().optional(),
  createdAt: z.string(),
  completedAt: z.string().optional(),
});

const assessmentSchema = z.object({
  id: z.string().min(1),
  attemptId: z.string().min(1),
  passageId: z.string().min(1),
  label: z.enum(['not_mastered', 'needs_reinforcement', 'good', 'mastered']),
  actor: z.literal('self'),
  selfReport: z.boolean(),
  createdAt: z.string(),
});

const projectionSchema = z.object({
  passageId: z.string().min(1),
  state: z.enum(['in_progress', 'needs_reinforcement', 'mastered']),
  evidence: z.array(z.string()),
  policyVersion: z.string(),
  updatedAt: z.string(),
});

const scheduleSchema = z.object({
  passageId: z.string().min(1),
  dueDate: z.string(),
  timezone: z.string(),
  intervalIndex: z.number().int().min(0),
  lapses: z.number().int().min(0),
  lastEvidenceDate: z.string().optional(),
  deferrals: z.array(z.object({date: z.string(), reason: z.string()})),
  updatedAt: z.string(),
});

const recordingSchema = z.object({
  id: z.string().min(1),
  passageId: z.string().optional(),
  sessionId: z.string().optional(),
  mimeType: z.string(),
  durationMs: z.number().min(0),
  retention: z.enum(['temporary', 'saved_local']),
  consentGranted: z.boolean(),
  createdAt: z.string(),
});

const rootSchema = z.object({
  schemaVersion: z.literal(MASTERY_SCHEMA_VERSION),
  plans: z.array(planSchema),
  passages: z.array(passageSchema),
  sessions: z.array(sessionSchema),
  repetitionEvents: z.array(repetitionEventSchema),
  recallAttempts: z.array(recallAttemptSchema),
  assessments: z.array(assessmentSchema),
  projections: z.array(projectionSchema),
  schedules: z.array(scheduleSchema),
  recordings: z.array(recordingSchema),
  updatedAt: z.string(),
});

export function createEmptyMasteryState(now = new Date()): MasteryStateRoot {
  return {
    schemaVersion: MASTERY_SCHEMA_VERSION,
    plans: [], passages: [], sessions: [], repetitionEvents: [],
    recallAttempts: [], assessments: [], projections: [], schedules: [],
    recordings: [], updatedAt: now.toISOString(),
  };
}

const storageAvailable = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

/**
 * قراءة آمنة: حمولة مفقودة → حالة فارغة. حمولة تالفة أو بإصدار غير مدعوم →
 * تُنقل كما هي إلى مفتاح حجر (لا تُفقد) وتُعاد حالة فارغة جديدة.
 */
export function loadMasteryState(now = new Date()): MasteryStateRoot {
  if (!storageAvailable()) return createEmptyMasteryState(now);
  const raw = window.localStorage.getItem(MASTERY_STORAGE_KEY);
  if (raw == null) return createEmptyMasteryState(now);
  try {
    const parsed = rootSchema.parse(JSON.parse(raw));
    return parsed as MasteryStateRoot;
  } catch {
    try { window.localStorage.setItem(QUARANTINE_KEY, raw); } catch { /* امتلاء التخزين لا يمنع المتابعة */ }
    return createEmptyMasteryState(now);
  }
}

/**
 * كتابة معاملاتية بقدر الإمكان: تُسلسل الحالة كاملة وتُكتب في المفتاح المؤقت
 * أولًا؛ عند نجاحها تُكتب في الرئيسي ثم يُزال المؤقت. فشل الكتابة (امتلاء
 * الحصة مثلًا) يرمي خطأ مفهومًا ولا يترك الرئيسي نصف مكتوب.
 */
export function saveMasteryState(state: MasteryStateRoot): void {
  if (!storageAvailable()) return;
  const payload = JSON.stringify(rootSchema.parse(state));
  try {
    window.localStorage.setItem(TEMP_KEY, payload);
    window.localStorage.setItem(MASTERY_STORAGE_KEY, payload);
    window.localStorage.removeItem(TEMP_KEY);
  } catch (error) {
    try { window.localStorage.removeItem(TEMP_KEY); } catch { /* لا شيء */ }
    throw error instanceof Error ? error : new Error('تعذر حفظ بيانات الإتقان محليًا');
  }
}

export const masteryQuarantineKey = QUARANTINE_KEY;
