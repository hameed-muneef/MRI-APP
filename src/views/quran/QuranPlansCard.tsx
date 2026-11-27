import {useEffect, useMemo, useRef, useState} from 'react';
import type {QuranAsset, QuranLearningState} from '../../quran/types';
import type {MasteryStateRoot, VerseRange} from '../../quran-mastery/types';
import {loadMasteryState, saveMasteryState} from '../../quran-mastery/storage';
import MasteryPlanning from './MasteryPlanning';
import QuranJourney from './QuranJourney';
import {dashboard} from '../../quran-mastery/planning';
import {referenceLabel, toArabicNumber} from '../../quran/content';
import {PENDING_RANGE_KEY} from './HifzMushafMode';
import type {JourneySection} from '../../quran/journey';
import {
  BILQURAN_PLAN_CHANGED_EVENT,
  buildBilQuranDailySteps,
  findBilQuranPlan,
  formatStepSummary,
  loadActiveBilQuranPlan,
} from '../../quran-mastery/bilquran-plans';

type Props = {asset: QuranAsset; state: QuranLearningState; onState: (next: QuranLearningState) => void; notify: (text: string) => void; onOpen: (section: JourneySection) => void; onOpenHifz: () => void};

// خطتي ومواضعي: الخطة المتفق عليها وموضعي الحالي وجلسات اليوم. الإنجاز والتقدم صارا في شاشة الإنجاز بالرئيسية.
export default function QuranPlansCard({asset, state, notify, onOpen, onOpenHifz}: Props) {
  const [root, setRoot] = useState(() => loadMasteryState());
  const [bilQuranPlan, setBilQuranPlan] = useState(() => loadActiveBilQuranPlan());
  const rootRef = useRef(root);

  useEffect(() => {
    const sync = () => setBilQuranPlan(loadActiveBilQuranPlan());
    window.addEventListener(BILQURAN_PLAN_CHANGED_EVENT, sync);
    return () => window.removeEventListener(BILQURAN_PLAN_CHANGED_EVENT, sync);
  }, []);

  const bilQuranSpec = useMemo(() => (bilQuranPlan ? findBilQuranPlan(bilQuranPlan.planId) ?? null : null), [bilQuranPlan]);
  const bilQuranSteps = useMemo(
    () => (bilQuranPlan && bilQuranSpec ? buildBilQuranDailySteps(asset, bilQuranSpec, bilQuranPlan.direction) : []),
    [asset, bilQuranPlan, bilQuranSpec],
  );
  const bilQuranStep = useMemo(
    () => (bilQuranPlan && bilQuranSteps.length ? bilQuranSteps[Math.min(bilQuranPlan.currentIndex, bilQuranSteps.length - 1)] : null),
    [bilQuranPlan, bilQuranSteps],
  );

  const commit = (fn: (r: MasteryStateRoot) => MasteryStateRoot) => {
    const next = fn(rootRef.current);
    try { saveMasteryState(next, rootRef.current); rootRef.current = next; setRoot(next); return true; }
    catch { notify('تعذر الحفظ على الجهاز. لم يُسجّل التغيير.'); return false; }
  };
  const open = (range: VerseRange, passageId?: string) => {
    const group = passageId ? rootRef.current.passages.find(p => p.id === passageId)?.group : undefined;
    try { localStorage.setItem(PENDING_RANGE_KEY, JSON.stringify(group && group.length > 1 ? {...range, group} : range)); } catch { /* ignore */ }
    onOpenHifz();
  };
  const openBilQuranToday = () => {
    if (!bilQuranStep || !bilQuranStep.segments.length) { onOpenHifz(); return; }
    const [first, ...rest] = bilQuranStep.segments;
    const group = bilQuranStep.segments.map(g => ({surah: g.surah, ayahStart: g.from, ayahEnd: g.to}));
    try {
      localStorage.setItem(PENDING_RANGE_KEY, JSON.stringify({
        surah: first.surah,
        ayahStart: first.from,
        ayahEnd: first.to,
        mode: 'new',
        autoStart: true,
        planStepIndex: bilQuranStep.index,
        ...(rest.length ? {group} : {}),
      }));
    } catch { /* ignore */ }
    onOpenHifz();
  };
  let last: {surah: number; from: number; to: number; page: number; mode: string} | null = null;
  try { const raw = localStorage.getItem('rabbani-hifz-mushaf-v1'); if (raw) last = JSON.parse(raw); } catch { /* ignore */ }
  const metrics = dashboard(root);
  const hasRootData = metrics.started > 0;
  return <section className="qm-workspace quran-plans-card" dir="rtl" aria-label="خطتي ومواضعي في الحفظ">
    {bilQuranPlan && bilQuranSpec && bilQuranStep ? <div className="qm-card">
      <h3>خطتي في مصحف الحفظ والإتقان: {bilQuranSpec.title}</h3>
      <p>{bilQuranSpec.durationLabel} · {bilQuranPlan.direction === 'nas' ? 'من الناس ← البقرة' : 'من البقرة ← الناس'} · اليوم {toArabicNumber(bilQuranStep.dayNumber)} من {toArabicNumber(bilQuranSteps.length)} ({toArabicNumber(bilQuranPlan.completedIndices.length)} مكتمل)</p>
      <p>مقرر اليوم: <strong>{formatStepSummary(asset, bilQuranStep)}</strong></p>
      <button type="button" className="qm-primary" onClick={openBilQuranToday}>ابدأ مقرر اليوم في مصحف الحفظ</button>
    </div> : <div className="qm-card">
      <h3>خطط الحفظ والمراجعة</h3>
      <p>اختر خطة مناسبة لوقتك (للمبتدئين أو من البقرة أو من الناس) مع البدء من أي اتجاه داخل مصحف الحفظ والإتقان.</p>
      <button type="button" className="qm-primary" onClick={onOpenHifz}>اختيار خطة في مصحف الحفظ</button>
    </div>}
    {last && <div className="qm-card"><h3>موضعي الحالي في الحفظ</h3><p>{referenceLabel(asset, last.surah, last.from, last.to)} · صفحة المقطع {toArabicNumber(last.page + 1)}</p><button type="button" className="primary" onClick={onOpenHifz}>استئناف</button></div>}
    {hasRootData ? <section className="quran-journey" aria-label="ملخص تقدمي في الحفظ"><dl className="quran-journey-stats">
      <div><dt>بدأت حفظه</dt><dd>{toArabicNumber(metrics.started)} آية</dd></div>
      <div><dt>الراسخ</dt><dd>{toArabicNumber(metrics.mastered)} آية</dd></div>
      <div><dt>مراجعات اليوم</dt><dd>{toArabicNumber(metrics.due)}{metrics.overdue > 0 && <small> · متأخر {toArabicNumber(metrics.overdue)}</small>}</dd></div>
      <div><dt>يحتاج تثبيتًا</dt><dd>{toArabicNumber(metrics.weak)}</dd></div>
      <div><dt>جلسات مكتملة اليوم</dt><dd>{toArabicNumber(metrics.completedToday)}</dd></div>
    </dl><p className="qm-muted">«بدأت حفظه» لا يعني الإتقان. الراسخ لا يُمنح إلا بتقييم ذاتي متتابع على مراجعات متباعدة.</p></section> : <QuranJourney asset={asset} state={state} onOpen={onOpen}/>}
    <div className="qm-card"><h3>خططي ومراجعات اليوم والتقدم</h3><MasteryPlanning asset={asset} root={root} commit={commit} open={open as never}/></div>
  </section>;
}
