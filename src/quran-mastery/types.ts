// محرك الإتقان — المرحلة الثانية. كيانات التعلّم الجديدة في مخزن مستقل
// (`rabbani-mastery-v1`) بإصدار مخطط؛ بيانات `rabbani-v1` الحالية لا تُمسّ
// ولا تُرحَّل. النص القرآني نفسه لا يُخزَّن هنا أبدًا؛ المراجع فقط (سورة/آية).

export const MASTERY_SCHEMA_VERSION = 1;
/** إصدار سياسة الإتقان؛ يُخزَّن مع كل إسقاط ليظل قابلًا للمراجعة. */
export const MASTERY_POLICY_VERSION = 'mastery-v1';
export const MASTERY_STORAGE_KEY = 'rabbani-mastery-v1';

// ============ الجلسة ============

export type SessionPurpose = 'new' | 'revision';
export type SessionStage = 'listen' | 'understand' | 'memorize' | 'connect' | 'recite' | 'assess';
export type CompletionReason = 'completed' | 'abandoned' | 'interrupted';

export type VerseRange = {surah: number; ayahStart: number; ayahEnd: number};

export type MasterySession = {
  id: string;
  purpose: SessionPurpose;
  passageId: string;
  range: VerseRange;
  /** المرحلة الحالية؛ الاستئناف بعد المقاطعة يعود إليها كما هي. */
  stage: SessionStage;
  stages: SessionStage[];
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
  completionReason?: CompletionReason;
};

// ============ التكرار ============

export const REPETITION_PRESETS = [1, 3, 5, 10, 15, 20] as const;
export type RepetitionScope = 'verse' | 'group' | 'passage';

export type RepetitionEvent = {
  id: string;
  sessionId: string;
  scope: RepetitionScope;
  /** مرجع الآية لنطاق verse؛ فارغ لنطاقي group وpassage. */
  surah?: number;
  ayah?: number;
  /** مراجع الآيات لنطاق group بصيغة s:a. */
  groupRefs?: string[];
  configured: number;
  /** لا يُحسب إلا التشغيل المكتمل. */
  completed: number;
  /** تشغيلات قُطعت قبل نهايتها؛ تُسجَّل ولا تُحسب ضمن completed. */
  interrupted: number;
  /** مصدر الصوت الحالي: آلي (تلاوة مرخّصة) أو تسجيل ذاتي. */
  source: 'recitation' | 'self_recording';
  reciterId?: number;
  reciterHistory?: {reciterId:number;at:string;completedBefore:number}[];
  createdAt: string;
  updatedAt: string;
};

// ============ الإخفاء ============

/** الوضع C (إخفاء على مستوى الكلمة) مقيَّد حتى توفر حدود كلمات موثوقة؛ لا يُعرض هنا. */
export type HideMode = 'A' | 'B' | 'D' | 'E';

export const HIDE_MODES: {value: HideMode; label: string; hint: string}[] = [
  {value: 'A', label: 'إخفاء الكل', hint: 'تُخفى الآيات كلها، مع إظهار فردي وإظهار الكل دائمًا.'},
  {value: 'B', label: 'إخفاء فردي', hint: 'تبدأ الآيات ظاهرة وتخفي ما تشاء آيةً آية.'},
  {value: 'D', label: 'إخفاء تدريجي', hint: 'تبدأ الآيات ظاهرة، ثم تخفي الآيات بالترتيب مع كل خطوة.'},
  {value: 'E', label: 'اختبار استرجاع كامل', hint: 'كل النص مخفي للاسترجاع؛ يمكنك الإظهار عند الحاجة وتُسجّل المساعدة.'},
];

// ============ الاسترجاع والتقييم ============

export type RecallHelpEvent = {
  kind: 'reveal_verse' | 'reveal_all' | 'hint_first_word';
  surah?: number;
  ayah?: number;
  at: string;
};

export type RecallAttempt = {
  id: string;
  sessionId: string;
  range: VerseRange;
  hideMode: HideMode;
  helpEvents: RecallHelpEvent[];
  /** آيات أشار إليها المستخدم كصعبة (s:a). */
  difficultVerses: string[];
  /** مرجع تسجيل اختياري مرتبط بالمحاولة. */
  recordingId?: string;
  createdAt: string;
  completedAt?: string;
};

export type AssessmentLabel = 'not_mastered' | 'needs_reinforcement' | 'good' | 'mastered';

export const ASSESSMENT_LABELS: {value: AssessmentLabel; label: string}[] = [
  {value: 'not_mastered', label: 'لم أتقن بعد'},
  {value: 'needs_reinforcement', label: 'أحتاج مزيداً من التثبيت'},
  {value: 'good', label: 'جيد'},
  {value: 'mastered', label: 'متقن'},
];

export type Assessment = {
  id: string;
  attemptId: string;
  passageId: string;
  /** التقييم الذاتي الصريح؛ لا توجد درجات آلية ولا تخمين. */
  label: AssessmentLabel;
  actor: 'self';
  /** تقييم سريع بلا محاولة استرجاع حقيقية يُوسم self-report ولا يبني دليل إتقان. */
  selfReport: boolean;
  createdAt: string;
};

// ============ الإتقان ============

export type MasteryState = 'in_progress' | 'needs_reinforcement' | 'mastered';

export const MASTERY_STATES: {value: MasteryState; label: string}[] = [
  {value: 'in_progress', label: 'قيد الحفظ'},
  {value: 'needs_reinforcement', label: 'بحاجة إلى تثبيت'},
  {value: 'mastered', label: 'متقن'},
];

export type MasteryProjection = {
  passageId: string;
  state: MasteryState;
  /** مراجع الأدلة: معرّفات التقييمات التي بُني عليها الإسقاط. */
  evidence: string[];
  policyVersion: string;
  updatedAt: string;
};

// ============ المراجعة المتباعدة ============

/** السلم المعتمد: اليوم نفسه، ثم ١، ٣، ٧، ١٤، ٣٠ يومًا. */
export const REVISION_INTERVALS = [0, 1, 3, 7, 14, 30] as const;

export type RevisionSchedule = {
  passageId: string;
  /** تاريخ الاستحقاق المحلي بصيغة YYYY-MM-DD. */
  dueDate: string;
  timezone: string;
  intervalIndex: number;
  lapses: number;
  /** محاولات في اليوم نفسه لا ترفع الدليل؛ يُسجَّل آخر يوم بنى دليلًا فعليًا. */
  lastEvidenceDate?: string;
  /** وقت محلي HH:MM اختاره المتعلم لجلسة تسميع مجدولة (اختياري). */
  dueTime?: string;
  /** الجلسة التي أُجّل تسميعها، للعودة إليها. */
  scheduledSessionId?: string;
  deferrals: {date: string; reason: string}[];
  updatedAt: string;
};

// ============ الخطة والمقطع ============

export type MasteryPlanStatus = 'active' | 'paused' | 'completed';

export type MasteryPlan = {
  id: string;
  title: string;
  /** نطاق كلي ثابت المراجع؛ لا نصوص. */
  range: VerseRange;
  mode?: 'free' | 'organized';
  preset?: 'beginner' | 'limited' | 'regular' | 'full' | 'revision';
  ranges?: VerseRange[];
  timeBudgetMinutes?: number;
  weekdays?: number[];
  timezone?: string;
  reciterId?: number;
  revisionLimit?: number;
  dailyTargetVerses: number;
  repeatPreset: number;
  status: MasteryPlanStatus;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type MasteryPassage = {
  id: string;
  planId?: string;
  range: VerseRange;
  /** مقاطع اختيار متعدد السور (صفحات)؛ تُعاد فتحها معًا. */
  group?: VerseRange[];
  order: number;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};

// ============ التسجيل ============

/**
 * التسجيلات مؤقتة ومحلية افتراضيًا: تبقى blob في ذاكرة الجلسة، ولا تُحفظ
 * إلا بفعل صريح من المستخدم («حفظ على الجهاز») الذي ينزّل الملف محليًا.
 */
export type RecordingRetention = 'temporary' | 'saved_local';

export type RecordingMeta = {
  id: string;
  passageId?: string;
  sessionId?: string;
  mimeType: string;
  durationMs: number;
  retention: RecordingRetention;
  consentGranted: boolean;
  createdAt: string;
};

// ============ الحالة الكلية ============

export type MasteryStateRoot = {
  schemaVersion: number;
  plans: MasteryPlan[];
  passages: MasteryPassage[];
  sessions: MasterySession[];
  repetitionEvents: RepetitionEvent[];
  recallAttempts: RecallAttempt[];
  assessments: Assessment[];
  projections: MasteryProjection[];
  schedules: RevisionSchedule[];
  recordings: RecordingMeta[];
  updatedAt: string;
};
