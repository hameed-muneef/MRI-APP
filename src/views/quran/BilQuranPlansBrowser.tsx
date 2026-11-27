import {useMemo, useState} from 'react';
import {ArrowLeftRight, BookOpen, CalendarDays, Check, ChevronLeft} from 'lucide-react';
import {toArabicNumber} from '../../quran/content';
import type {QuranAsset} from '../../quran/types';
import {
  BILQURAN_DIRECTIONS,
  BILQURAN_PLANS,
  BILQURAN_TRACKS,
  buildBilQuranDailySteps,
  findBilQuranPlan,
  formatStepSummary,
  trackLabel,
  type ActiveBilQuranPlanState,
  type BilQuranDailyStep,
  type BilQuranDirection,
  type BilQuranPlanSpec,
  type BilQuranTrack,
} from '../../quran-mastery/bilquran-plans';

type Props = {
  asset: QuranAsset;
  activePlan: ActiveBilQuranPlanState | null;
  onActivatePlan: (plan: BilQuranPlanSpec, direction: BilQuranDirection, startIndex?: number) => void;
};

export default function BilQuranPlansBrowser({asset, activePlan, onActivatePlan}: Props) {
  const initialPlan = activePlan ? findBilQuranPlan(activePlan.planId) : undefined;
  const [track, setTrack] = useState<BilQuranTrack>(initialPlan?.track ?? 'beginner');
  const [direction, setDirection] = useState<BilQuranDirection>(activePlan?.direction ?? 'baqarah');
  const [previewPlanId, setPreviewPlanId] = useState<string | null>(null);
  const [previewLimit, setPreviewLimit] = useState(14);

  const visiblePlans = useMemo(
    () => (track === 'all' ? BILQURAN_PLANS : BILQURAN_PLANS.filter(p => p.track === track)),
    [track],
  );

  const previewPlan = useMemo(
    () => (previewPlanId ? BILQURAN_PLANS.find(p => p.id === previewPlanId) ?? null : null),
    [previewPlanId],
  );

  const planSamples = useMemo(() => {
    const map = new Map<string, {totalDays: number; firstStep: BilQuranDailyStep | undefined}>();
    for (const plan of visiblePlans) {
      const steps = buildBilQuranDailySteps(asset, plan, direction);
      map.set(plan.id, {totalDays: steps.length, firstStep: steps[0]});
    }
    return map;
  }, [asset, visiblePlans, direction]);

  const previewSteps = useMemo(
    () => (previewPlan ? buildBilQuranDailySteps(asset, previewPlan, direction) : []),
    [asset, previewPlan, direction],
  );

  const handleTrackChange = (nextTrack: BilQuranTrack) => {
    setTrack(nextTrack);
    if (nextTrack === 'baqarah') setDirection('baqarah');
    else if (nextTrack === 'nas') setDirection('nas');
  };

  if (previewPlan) {
    const shown = previewSteps.slice(0, previewLimit);
    return (
      <div className="hf-plans-wrap" aria-label={`جدول ${previewPlan.title}`}>
        <div className="hf-plan-preview-head">
          <button type="button" className="hf-ghost hf-plan-back" onClick={() => { setPreviewPlanId(null); setPreviewLimit(14); }}>
            العودة إلى الخطط
          </button>
          <div className="hf-plan-preview-title">
            <span className="hf-plan-kicker">
              {trackLabel(previewPlan.track)} · {previewPlan.durationLabel} · {previewPlan.dailyPaceLabel}
            </span>
            <h2>{previewPlan.title}</h2>
            <p>{previewPlan.methodologyNote}</p>
          </div>
          <div className="hf-dir-bar" role="group" aria-label="اتجاه الحفظ">
            <span className="hf-dir-label"><ArrowLeftRight size={16} aria-hidden="true"/> اتجاه البدء:</span>
            <div className="hf-seg">
              {BILQURAN_DIRECTIONS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={direction === d.id}
                  className={direction === d.id ? 'on' : ''}
                  onClick={() => setDirection(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hf-plan-preview-actions">
            <button type="button" className="hf-ok" onClick={() => onActivatePlan(previewPlan, direction, 0)}>
              اعتماد الخطة والبدء من اليوم ١ ({toArabicNumber(previewSteps.length)} يومًا)
            </button>
          </div>
        </div>

        <div className="hf-schedule-list" aria-label="المقررات اليومية للخطة">
          {shown.map(step => (
            <div key={step.index} className={`hf-schedule-row${step.isWeeklyMilestone ? ' is-milestone' : ''}`}>
              <div className="hf-schedule-meta">
                <strong>اليوم {toArabicNumber(step.dayNumber)}</strong>
                <span>{formatStepSummary(asset, step)}</span>
                <small>
                  صفحة {step.pageStart === step.pageEnd ? toArabicNumber(step.pageStart) : `${toArabicNumber(step.pageStart)}–${toArabicNumber(step.pageEnd)}`}
                  {' · '}
                  {toArabicNumber(step.verseCount)} آية
                  {step.isWeeklyMilestone ? ' · يُستحسن بعده يوم الهمة للمراجعة والربط الأسبوعي' : ''}
                </small>
              </div>
              <button
                type="button"
                className="hf-chip"
                onClick={() => onActivatePlan(previewPlan, direction, step.index)}
              >
                ابدأ من هنا
              </button>
            </div>
          ))}
        </div>

        {previewSteps.length > previewLimit && (
          <button
            type="button"
            className="hf-ghost"
            onClick={() => setPreviewLimit(n => n + 30)}
          >
            عرض المزيد ({toArabicNumber(previewSteps.length - previewLimit)} يومًا متبقيًا)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="hf-plans-wrap" aria-label="خطط الحفظ والمراجعة">
      <div className="hf-plans-hero">
        <span className="hf-plan-kicker">خطط الحفظ والمراجعة</span>
        <h2>اختر الخطة التي تناسب وقتك</h2>
        <p>ثلاث مسارات متنوعة مع إمكانية البدء من أول المصحف أو من آخره. تُقسَّم الآيات والصفحات يوميًا وتُربط تراكميًا داخل المصحف.</p>
      </div>

      <div className="hf-dir-box" role="group" aria-label="اختر اتجاه البداية">
        <div className="hf-dir-head">
          <ArrowLeftRight size={17} aria-hidden="true"/>
          <strong>اتجاه البداية في المصحف</strong>
        </div>
        <div className="hf-seg">
          {BILQURAN_DIRECTIONS.map(d => (
            <button
              key={d.id}
              type="button"
              aria-pressed={direction === d.id}
              className={direction === d.id ? 'on' : ''}
              onClick={() => setDirection(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <small className="hf-hint">{BILQURAN_DIRECTIONS.find(d => d.id === direction)?.hint}</small>
      </div>

      <div className="hf-track-tabs" role="tablist" aria-label="تصفية المسارات">
        {BILQURAN_TRACKS.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={track === t.id}
            className={track === t.id ? 'on' : ''}
            onClick={() => handleTrackChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="hf-plans-grid">
        {visiblePlans.map(plan => {
          const sample = planSamples.get(plan.id);
          const isCurrent = activePlan?.planId === plan.id && activePlan?.direction === direction;
          const isSamePlanOtherDir = activePlan?.planId === plan.id && activePlan?.direction !== direction;
          return (
            <article key={plan.id} className={`hf-plan-card${isCurrent ? ' is-active' : ''}`}>
              <div className="hf-plan-card-top">
                <span className="hf-plan-kicker">
                  {trackLabel(plan.track)} · {plan.dailyPaceLabel}
                </span>
                <div className="hf-plan-duration">{plan.durationLabel}</div>
                <h3>{plan.title}</h3>
                <p className="hf-plan-sub">{plan.subtitle}</p>
              </div>

              <div className="hf-plan-preview-line">
                <CalendarDays size={15} aria-hidden="true"/>
                <span>
                  {sample?.firstStep
                    ? `اليوم ١: ${formatStepSummary(asset, sample.firstStep)}`
                    : `المدة: ${plan.durationLabel}`}
                  {sample?.totalDays ? ` · ${toArabicNumber(sample.totalDays)} مقررًا` : ''}
                </span>
              </div>

              <div className="hf-plan-card-actions">
                <button
                  type="button"
                  className="hf-ghost"
                  onClick={() => { setPreviewPlanId(plan.id); setPreviewLimit(14); }}
                >
                  <BookOpen size={16} aria-hidden="true"/> معاينة الجدول
                </button>
                <button
                  type="button"
                  className="hf-ok"
                  onClick={() => onActivatePlan(plan, direction, isCurrent ? activePlan.currentIndex : 0)}
                >
                  {isCurrent ? <><Check size={16} aria-hidden="true"/> متابعة الخطة</> : isSamePlanOtherDir ? 'تبديل للاتجاه المختار' : <>اعتماد والبدء <ChevronLeft size={16} aria-hidden="true"/></>}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
