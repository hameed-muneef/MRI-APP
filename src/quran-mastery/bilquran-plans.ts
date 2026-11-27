import {referenceLabel, surahInfo, toArabicNumber} from '../quran/content';
import type {QuranAsset, QuranVerse} from '../quran/types';

export type BilQuranTrack = 'all' | 'beginner' | 'baqarah' | 'nas';
export type BilQuranDirection = 'baqarah' | 'nas';

export interface BilQuranPlanSpec {
  id: string;
  track: Exclude<BilQuranTrack, 'all'>;
  title: string;
  durationLabel: string;
  durationMonths: number;
  subtitle: string;
  dailyPaceLabel: string;
  pagesPerDay: number;
  daysPerWeek: number;
  defaultDirection: BilQuranDirection;
  methodologyNote: string;
}

export interface HifzSegment {
  surah: number;
  from: number;
  to: number;
}

export interface BilQuranDailyStep {
  index: number;
  dayNumber: number;
  segments: HifzSegment[];
  pageStart: number;
  pageEnd: number;
  verseCount: number;
  approxPages: number;
  isWeeklyMilestone: boolean;
}

export interface ActiveBilQuranPlanState {
  planId: string;
  direction: BilQuranDirection;
  currentIndex: number;
  completedIndices: number[];
  startedAt: string;
  updatedAt: string;
}

export const BILQURAN_PLAN_STORAGE_KEY = 'rabbani-bilquran-plan-v1';
export const BILQURAN_PLAN_CHANGED_EVENT = 'rabbani-bilquran-plan-changed';

export const BILQURAN_TRACKS: {id: BilQuranTrack; label: string}[] = [
  {id: 'all', label: 'الكل'},
  {id: 'beginner', label: 'للمبتدئين'},
  {id: 'baqarah', label: 'من البقرة'},
  {id: 'nas', label: 'من الناس'},
];

export const BILQURAN_DIRECTIONS: {id: BilQuranDirection; label: string; hint: string}[] = [
  {id: 'baqarah', label: 'من البقرة ← الناس', hint: 'البداية من أول سورة البقرة تصاعديًا حتى الناس'},
  {id: 'nas', label: 'من الناس ← البقرة', hint: 'البداية من قصار المفصل (سورة الناس) حتى البقرة'},
];

export const BILQURAN_PLANS: BilQuranPlanSpec[] = [
  {
    id: 'beginner-10m',
    track: 'beginner',
    title: 'الخطة الثالثة للمبتدئين',
    durationLabel: '١٠ أشهر',
    durationMonths: 10,
    subtitle: 'للمبتدئين — الأسرع',
    dailyPaceLabel: 'وجهان يوميًا (بعد تدرّج تمهيدي)',
    pagesPerDay: 2,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'تبدأ بالتدرّج ثم تستقر على وجهين يوميًا مع ربط القريب ومراجعة أسبوعية في يوم الهمة.',
  },
  {
    id: 'beginner-14m',
    track: 'beginner',
    title: 'الخطة الثانية للمبتدئين',
    durationLabel: '١٤ شهرًا',
    durationMonths: 14,
    subtitle: 'للمبتدئين — متوازنة',
    dailyPaceLabel: 'وجه ونصف يوميًا',
    pagesPerDay: 1.5,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'مناسبة لمن يجمع بين الدوام والدراسة؛ ورد متوسط مع تثبيت تراكمي ومراجعة أسبوعية.',
  },
  {
    id: 'beginner-26m',
    track: 'beginner',
    title: 'الخطة الأولى للمبتدئين',
    durationLabel: '٢٦ شهرًا',
    durationMonths: 26,
    subtitle: 'للمبتدئين — بنفس هادئ',
    dailyPaceLabel: 'نحو ثلاثة أرباع وجه يوميًا',
    pagesPerDay: 0.75,
    daysPerWeek: 5,
    defaultDirection: 'baqarah',
    methodologyNote: 'أشهر خطط المبتدئين؛ حمل يسير لبناء عادة الحفظ المتقن دون انقطاع.',
  },
  {
    id: 'beginner-48m',
    track: 'beginner',
    title: 'خطة المبتدئين الممتدة',
    durationLabel: '٤٨ شهرًا',
    durationMonths: 48,
    subtitle: 'أطول مدة وأخف حمل',
    dailyPaceLabel: 'نحو ٥–٧ أسطر (٠.٤ وجه) يوميًا',
    pagesPerDay: 0.4,
    daysPerWeek: 5,
    defaultDirection: 'baqarah',
    methodologyNote: 'لأصحاب الانشغال العالي؛ آيات قليلة ثابتة يوميًا مع ربط تراكمي يضمن عدم التفلت.',
  },
  {
    id: 'baqarah-5m',
    track: 'baqarah',
    title: 'خطة الختم المكثفة (٥ أوجه)',
    durationLabel: '٥ أشهر',
    durationMonths: 5,
    subtitle: 'من البقرة — مكثفة',
    dailyPaceLabel: '٥ أوجه يوميًا',
    pagesPerDay: 5,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'للمتفرغين وأصحاب الهمم العالية؛ خمس صفحات يوميًا مع ربط الحفظ الأسبوعي.',
  },
  {
    id: 'baqarah-10m',
    track: 'baqarah',
    title: 'خطة الوجهين اليومية',
    durationLabel: '١٠ أشهر',
    durationMonths: 10,
    subtitle: 'من البقرة — وجهان يوميًا',
    dailyPaceLabel: 'وجهان يوميًا',
    pagesPerDay: 2,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'ختم القرآن في نحو عشرة أشهر بورد ثابت قدره صفحتان يوميًا.',
  },
  {
    id: 'baqarah-14m',
    track: 'baqarah',
    title: 'خطة الوجه ونصف يوميًا',
    durationLabel: '١٤ شهرًا',
    durationMonths: 14,
    subtitle: 'من البقرة — وجه ونصف يوميًا',
    dailyPaceLabel: 'وجه ونصف يوميًا',
    pagesPerDay: 1.5,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'توازن مثالي بين سرعة الإنجاز وجودة الضبط والمراجعة.',
  },
  {
    id: 'baqarah-19m',
    track: 'baqarah',
    title: 'خطة الوجه الواحد يوميًا',
    durationLabel: '١٩ شهرًا',
    durationMonths: 19,
    subtitle: 'من البقرة — وجه يوميًا',
    dailyPaceLabel: 'وجه واحد يوميًا',
    pagesPerDay: 1,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'صفحة واحدة متقنة يوميًا مع ربطها بما قبلها ويوم للربط الكلي.',
  },
  {
    id: 'baqarah-24m',
    track: 'baqarah',
    title: 'الخطة التفاعلية (نصف وجه)',
    durationLabel: '٢٠–٢٧ شهرًا',
    durationMonths: 24,
    subtitle: 'من البقرة — نصف وجه يوميًا',
    dailyPaceLabel: 'نصف وجه يوميًا',
    pagesPerDay: 0.5,
    daysPerWeek: 6,
    defaultDirection: 'baqarah',
    methodologyNote: 'نصف صفحة في اليوم لرسوخ عالٍ ومراجعة مريحة لا تثقل الجدول اليومي.',
  },
  {
    id: 'nas-6m',
    track: 'nas',
    title: 'خطة ٦ أشهر من الناس',
    durationLabel: '٦ أشهر',
    durationMonths: 6,
    subtitle: 'من الناس — ٣ أوجه وربع يوميًا',
    dailyPaceLabel: '٣ أوجه وربع يوميًا',
    pagesPerDay: 3.25,
    daysPerWeek: 6,
    defaultDirection: 'nas',
    methodologyNote: 'انطلاقة سريعة من قصار السور ثم الأجزاء صعودًا نحو البقرة في ستة أشهر.',
  },
  {
    id: 'nas-10m',
    track: 'nas',
    title: 'خطة ١٠ أشهر من الناس',
    durationLabel: '١٠ أشهر',
    durationMonths: 10,
    subtitle: 'من الناس — وجهان يوميًا',
    dailyPaceLabel: 'وجهان يوميًا',
    pagesPerDay: 2,
    daysPerWeek: 6,
    defaultDirection: 'nas',
    methodologyNote: 'البدء بالسور المألوفة في الصلاة ثم التدرج صعودًا بمعدل صفحتين يوميًا.',
  },
  {
    id: 'nas-19m',
    track: 'nas',
    title: 'خطة ١٩ شهرًا من الناس',
    durationLabel: '١٩ شهرًا',
    durationMonths: 19,
    subtitle: 'من الناس — وجه يوميًا',
    dailyPaceLabel: 'وجه واحد يوميًا',
    pagesPerDay: 1,
    daysPerWeek: 6,
    defaultDirection: 'nas',
    methodologyNote: 'صفحة واحدة يوميًا من سورة الناس صعودًا حتى سورة البقرة بضبطٍ متأنٍّ.',
  },
];

export const trackLabel = (track: Exclude<BilQuranTrack, 'all'>): string => {
  if (track === 'beginner') return 'للمبتدئين';
  if (track === 'baqarah') return 'من البقرة';
  return 'من الناس';
};

export function findBilQuranPlan(planId: string): BilQuranPlanSpec | undefined {
  return BILQURAN_PLANS.find(p => p.id === planId);
}

function orderVersesForDirection(asset: QuranAsset, direction: BilQuranDirection): QuranVerse[] {
  const hasBaqarahOrLater = asset.verses.some(v => v.s >= 2);
  const source = hasBaqarahOrLater ? asset.verses.filter(v => v.s >= 2) : asset.verses;
  if (direction === 'baqarah') return source;

  // في مسار «من الناس ← البقرة»: نرتب السور تنازليًا (١١٤ ثم ١١٣...)
  // مع إبقاء الآيات داخل كل سورة بالترتيب الطبيعي (من ١ إلى آخر السورة).
  const bySurah = new Map<number, QuranVerse[]>();
  for (const v of source) {
    const arr = bySurah.get(v.s);
    if (arr) arr.push(v);
    else bySurah.set(v.s, [v]);
  }
  const surahsDesc = [...bySurah.keys()].sort((a, b) => b - a);
  const ordered: QuranVerse[] = [];
  for (const s of surahsDesc) {
    const arr = bySurah.get(s);
    if (arr) ordered.push(...arr);
  }
  return ordered;
}

function groupVersesToSegments(verses: QuranVerse[]): HifzSegment[] {
  const segs: HifzSegment[] = [];
  for (const v of verses) {
    const last = segs[segs.length - 1];
    if (last && last.surah === v.s && last.to + 1 === v.a) {
      last.to = v.a;
    } else {
      segs.push({surah: v.s, from: v.a, to: v.a});
    }
  }
  return segs;
}

/**
 * يقسم المصحف كاملًا حسب الخطة والاتجاه إلى مقررات يومية متسلسلة من واقع صفحات المصحف الفعلية.
 */
export function buildBilQuranDailySteps(
  asset: QuranAsset,
  plan: BilQuranPlanSpec,
  direction: BilQuranDirection,
): BilQuranDailyStep[] {
  const ordered = orderVersesForDirection(asset, direction);
  if (!ordered.length) return [];

  const versesPerPage = new Map<number, number>();
  for (const v of asset.verses) {
    versesPerPage.set(v.p, (versesPerPage.get(v.p) ?? 0) + 1);
  }

  const stepPageTarget = Math.max(0.2, plan.pagesPerDay);
  const steps: BilQuranDailyStep[] = [];

  let i = 0;
  let cumulativeWeight = 0;
  let dayIdx = 0;

  while (i < ordered.length) {
    const dayVerses: QuranVerse[] = [];
    let dayWeight = 0;
    const targetCumulative = (dayIdx + 1) * stepPageTarget;

    while (i < ordered.length) {
      const v = ordered[i];
      const w = 1 / (versesPerPage.get(v.p) ?? 15);
      // نضم الآية دائمًا إذا كانت الأولى في اليوم، أو إذا لم نتجاوز الحد التراكمي للخطة بعد
      if (dayVerses.length === 0 || cumulativeWeight + w <= targetCumulative + 1e-6) {
        dayVerses.push(v);
        cumulativeWeight += w;
        dayWeight += w;
        i += 1;
        if (cumulativeWeight >= targetCumulative - 1e-6) break;
      } else {
        // اختيار ذكي: إذا كانت المسافة للهدف أقرب بضم هذه الآية عن تركها للغد، نضمها
        const distWithout = Math.abs(targetCumulative - cumulativeWeight);
        const distWith = Math.abs(cumulativeWeight + w - targetCumulative);
        if (distWith < distWithout * 0.65) {
          dayVerses.push(v);
          cumulativeWeight += w;
          dayWeight += w;
          i += 1;
        }
        break;
      }
    }

    const pages = dayVerses.map(v => v.p);
    const dayNumber = dayIdx + 1;
    steps.push({
      index: dayIdx,
      dayNumber,
      segments: groupVersesToSegments(dayVerses),
      pageStart: Math.min(...pages),
      pageEnd: Math.max(...pages),
      verseCount: dayVerses.length,
      approxPages: Math.round(dayWeight * 10) / 10,
      isWeeklyMilestone: dayNumber % plan.daysPerWeek === 0,
    });
    dayIdx += 1;
  }

  return steps;
}

export function formatStepSummary(asset: QuranAsset, step: BilQuranDailyStep): string {
  const segs = step.segments;
  if (!segs.length) return '';
  if (segs.length <= 2) {
    return segs.map(g => referenceLabel(asset, g.surah, g.from, g.to)).join(' + ');
  }
  const first = surahInfo(asset, segs[0].surah)?.name ?? `سورة ${segs[0].surah}`;
  const last = surahInfo(asset, segs[segs.length - 1].surah)?.name ?? `سورة ${segs[segs.length - 1].surah}`;
  return `${first} ← ${last} (${toArabicNumber(segs.length)} سور · ${toArabicNumber(step.verseCount)} آية)`;
}

export function buildWeeklyReviewSegments(steps: BilQuranDailyStep[], currentIndex: number, lookback = 6): HifzSegment[] {
  const end = Math.min(steps.length, Math.max(1, currentIndex));
  const start = Math.max(0, end - lookback);
  const slice = steps.slice(start, end).flatMap(s => s.segments);
  const merged: HifzSegment[] = [];
  for (const g of slice) {
    const prev = merged[merged.length - 1];
    if (prev && prev.surah === g.surah && prev.to + 1 === g.from) {
      prev.to = g.to;
    } else {
      merged.push({...g});
    }
  }
  return merged;
}

export function loadActiveBilQuranPlan(): ActiveBilQuranPlanState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(BILQURAN_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveBilQuranPlanState>;
    if (!parsed || typeof parsed.planId !== 'string' || !findBilQuranPlan(parsed.planId)) return null;
    return {
      planId: parsed.planId,
      direction: parsed.direction === 'nas' ? 'nas' : 'baqarah',
      currentIndex: typeof parsed.currentIndex === 'number' && parsed.currentIndex >= 0 ? Math.floor(parsed.currentIndex) : 0,
      completedIndices: Array.isArray(parsed.completedIndices)
        ? [...new Set(parsed.completedIndices.filter((n): n is number => typeof n === 'number' && n >= 0))]
        : [],
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveActiveBilQuranPlan(state: ActiveBilQuranPlanState): ActiveBilQuranPlanState {
  const normalized: ActiveBilQuranPlanState = {
    ...state,
    currentIndex: Math.max(0, Math.floor(state.currentIndex)),
    completedIndices: [...new Set(state.completedIndices)].sort((a, b) => a - b),
    updatedAt: new Date().toISOString(),
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(BILQURAN_PLAN_STORAGE_KEY, JSON.stringify(normalized));
      window.dispatchEvent?.(new Event(BILQURAN_PLAN_CHANGED_EVENT));
    }
  } catch {
    /* ignore storage quota failures */
  }
  return normalized;
}

export function clearActiveBilQuranPlan(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(BILQURAN_PLAN_STORAGE_KEY);
      window.dispatchEvent?.(new Event(BILQURAN_PLAN_CHANGED_EVENT));
    }
  } catch {
    /* ignore */
  }
}

export function completeBilQuranStep(
  state: ActiveBilQuranPlanState,
  stepIndex: number,
  totalSteps: number,
): ActiveBilQuranPlanState {
  const completed = state.completedIndices.includes(stepIndex)
    ? state.completedIndices
    : [...state.completedIndices, stepIndex];
  const nextIndex = Math.min(Math.max(0, totalSteps - 1), Math.max(state.currentIndex, stepIndex + 1));
  return saveActiveBilQuranPlan({
    ...state,
    completedIndices: completed,
    currentIndex: nextIndex,
  });
}
