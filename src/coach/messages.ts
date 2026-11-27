// Static, rule-based coach messages. One place for every sentence the coach shows.
// Rules: each message states a fact or offers an action. None asks a question, requests
// an answer, or addresses the user as a conversation partner. Tests enforce this
// (messages.test.ts). Add new messages here, never inline.

const n = (value: number): string => value.toLocaleString('ar-EG');

type Entry<P> = {sample: P; text: (p: P) => string};
const define = <P>(sample: P, text: (p: P) => string): Entry<P> => ({sample, text});

export const COACH_MESSAGES = {
  // Quran
  quranConsolidate: define({weak: 2, overdue: 3}, ({weak, overdue}: {weak: number; overdue: number}) =>
    `لديك ${weak > 0 ? `${n(weak)} مقاطع تحتاج تثبيتًا` : ''}${weak > 0 && overdue > 0 ? ' و' : ''}${overdue > 0 ? `${n(overdue)} مراجعات متأخرة` : ''}. الأفضل اليوم: ثبّت القديم أولًا قبل إضافة حفظ جديد.`),
  quranDue: define({due: 4}, ({due}: {due: number}) =>
    `تنتظرك اليوم ${n(due)} مراجعة قرآنية مستحقة؛ البدء بها يثبّت محفوظك.`),

  // Start-of-use insights
  overloadTitle: define({}, () => 'حمل يومي مزدحم'),
  overloadDetail: define({count: 9, capacity: 4}, ({count, capacity}: {count: number; capacity: number}) =>
    `لديك ${n(count)} خطوات يومية مفتوحة، وهو أكبر من طاقتك المعتادة (${n(capacity)}). ركّز على أهم ${n(capacity)} اليوم والبقية للتدرّج.`),
  deadlineTitle: define({goal: 'هدف'}, ({goal}: {goal: string}) => `موعد هدف «${goal}» قريب`),
  deadlineDetail: define({days: 5}, ({days}: {days: number}) =>
    `بقي ${n(days)} يوم على موعد الهدف ولم يُسجّل إنجاز بعد. ابدأ بأصغر خطوة فيه اليوم.`),
  unscheduledTitle: define({}, () => 'خطوات اليوم غير مجدولة بعد'),
  unscheduledDetail: define({label: 'بعد العصر', minutes: 60}, ({label, minutes}: {label: string; minutes: number}) =>
    `يمكنك حجز وقت فراغك (${label} · ${n(minutes)} د) بضغطة واحدة لتثبيت أهم خطوة اليوم.`),

  // Priority notes on plan items
  priorityDue: define({}, () => 'مستحقة اليوم'),
  priorityBehind: define({}, () => 'تأخرت في الفترات الأخيرة'),
  priorityDeadline: define({}, () => 'موعد الهدف قريب'),
  priorityConsolidate: define({}, () => 'الأولوية لتثبيت المراجعة المتأخرة'),

  // Weekly recommendations
  lightenTitle: define({step: '«خطوة»'}, ({step}: {step: string}) => `تخفيف خطوة ${step}`),
  lightenBody: define({step: '«خطوة»', goal: 'هدف', to: 'أسبوعيًا'}, ({step, goal, to}: {step: string; goal: string; to: string}) =>
    `الالتزام بخطوة ${step} في «${goal}» دون ٤٠٪ مؤخرًا. يمكنك تحويلها إلى ${to} لتحافظ على الاستمرار.`),
  increaseTitle: define({step: '«خطوة»'}, ({step}: {step: string}) => `ترقية وتيرة ${step}`),
  increaseBody: define({step: '«خطوة»', goal: 'هدف', to: 'يوميًا'}, ({step, goal, to}: {step: string; goal: string; to: string}) =>
    `أداؤك منتظم في ${step} ضمن «${goal}». يمكنك رفعها إلى ${to}.`),
  earlyWarningTitle: define({step: '«خطوة»'}, ({step}: {step: string}) => `تنبيه استباق لانقطاع ${step}`),
  earlyWarningBody: define({step: '«خطوة»', goal: 'هدف'}, ({step, goal}: {step: string; goal: string}) =>
    `مرّت عدة فترات دون تسجيل ${step} في «${goal}». البدء بخطوة صغيرة اليوم يوقف الفجوة.`),
  deadlineRiskTitle: define({goal: 'هدف'}, ({goal}: {goal: string}) => `اقتراب موعد «${goal}»`),
  deadlineRiskBody: define({goal: 'هدف'}, ({goal}: {goal: string}) =>
    `المتبقي قليل على موعد هدف «${goal}» مع نسبة التزام دون النصف. راجع الخطوات أو وسّع الموعد.`),
  courseMonthTitle: define({}, () => 'مراجعة المقرر الشهرية'),
  courseWeekTitle: define({}, () => 'مراجعة المقرر الأسبوعية'),
  courseWarningBody: define({}, () => 'تأخرت مراجعة المقرر في الفترات الأخيرة؛ ابدأ بها اليوم قبل تراكم المحفوظ.'),
  wirdLightenBody: define({target: 100, next: 75, wird: 'ورد'}, ({target, next, wird}: {target: number; next: number; wird: string}) =>
    `الهدف التنظيمي (${n(target)}) لورد «${wird}» شاق مؤخرًا. اقتراح: اجعله ${n(next)} لتثبت عليه.`),
  wirdRaiseBody: define({next: 125, wird: 'ورد'}, ({next, wird}: {next: number; wird: string}) =>
    `ثبات ممتاز على ورد «${wird}»! يمكنك رفع الهدف التنظيمي إلى ${n(next)} إن أحببت.`),
  wirdGapBody: define({wird: 'ورد'}, ({wird}: {wird: string}) => `انقطعت مؤخرًا عن ورد «${wird}». ابدأ اليوم بما تيسّر لك.`),
  wirdTitle: define({wird: 'ورد'}, ({wird}: {wird: string}) => `ورد «${wird}»`),
  weakDayTitle: define({day: 'الخميس'}, ({day}: {day: string}) => `أكثر يوم يشهد تراجعًا: ${day}`),
  weakDayBody: define({day: 'الخميس', peak: 'الصباح' as string | null}, ({day, peak}: {day: string; peak: string | null}) =>
    `لاحظ المدرّب أن يوم ${day} هو الأقل إنجازًا في سجلك${peak ? `، بينما وقت ذروتك المعتاد هو ${peak}` : ''}. خفّف جدول ${day} مسبقًا لتحافظ على سلسلتك.`),

  // Home card subtitle
  homeInvite: define({}, () => 'يرتّب يومك بين الصلوات ويقترح الخطوة الأنسب بلا اتصال · اضغط للتفعيل'),
  homeRecovery: define({day: 1, count: 3, slot: 'بعد العصر' as string | null}, ({day, count, slot}: {day: number; count: number; slot: string | null}) =>
    `عودة هادئة (اليوم ${n(day)} من ٣ · نصف الحمل) · ${n(count)} خطوات مقترحة${slot ? ` · الأنسب ${slot}` : ''}`),
  homeSuggested: define({count: 3, slot: 'بعد العصر' as string | null}, ({count, slot}: {count: number; slot: string | null}) =>
    `${n(count)} خطوات مقترحة اليوم${slot ? ` · الأنسب الآن ${slot}` : ''} · والتقرير الأسبوعي`),
  homeAllDone: define({}, () => 'خطوات اليوم المفعّلة منجزة · افتح التقرير الأسبوعي الذكي'),
  // Coach screen
  uiInvite: define({}, () => 'فعّل «المدرّب الذكي للكل» ليرتّب لك ما تبدأ به اليوم حسب أوقات فراغك بين الصلوات، ويكشف لك أيام التعثر في تقرير أسبوعي شامل.'),
  uiRecoveryNote: define({gap: 4, limit: 2}, ({gap, limit}: {gap: number; limit: number}) =>
    `لاحظ المدرّب انقطاعًا منذ ${n(gap)} أيام؛ لذلك خفّف لك جدول اليوم إلى ${n(limit)} خطوات بدلًا من التراكم حتى تستعيد إيقاعك بهدوء.`),
  uiCourseLate: define({title: 'مراجعة المقرر الأسبوعية'}, ({title}: {title: string}) =>
    `${title} تأخرت في الفترات الأخيرة. ابدأ بها اليوم قبل أن يتسع الفارق.`),
  rhythmPeak: define({window: 'الصباح'}, ({window}: {window: string}) => `وقت ذروتك المعتاد: ${window}. `),
  rhythmNoPeak: define({}, () => 'سيظهر وقت ذروتك بعد تسجيل بضعة إنجازات. '),
  rhythmWeakDay: define({day: 'الخميس'}, ({day}: {day: string}) => `أكثر يوم يتراجع فيه الإنجاز: ${day}. `),
  rhythmCapacity: define({capacity: 4}, ({capacity}: {capacity: number}) => `سعتك اليومية المعتادة نحو ${n(capacity)} خطوات.`),
  noRecommendations: define({}, () => 'لا توجد توصيات تعديل معلّقة حاليًا. استمر على إيقاعك الهادئ!'),
};

export type CoachMessageId = keyof typeof COACH_MESSAGES;

/** Every message rendered with its sample parameters. Used by tests to scan the whole catalog. */
export function allCoachMessageSamples(): Array<{id: string; text: string}> {
  return (Object.entries(COACH_MESSAGES) as unknown as Array<[string, Entry<unknown>]>).map(([id, entry]) => ({
    id,
    text: entry.text(entry.sample),
  }));
}
