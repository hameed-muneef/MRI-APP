import {useRef, useState} from 'react';
import type {QuranAsset, QuranLearningState} from '../../quran/types';
import type {MasteryStateRoot, VerseRange} from '../../quran-mastery/types';
import {loadMasteryState, saveMasteryState} from '../../quran-mastery/storage';
import MasteryPlanning from './MasteryPlanning';
import QuranJourney from './QuranJourney';
import {dashboard} from '../../quran-mastery/planning';
import QuranProgress from './QuranProgress';
import {referenceLabel, toArabicNumber} from '../../quran/content';
import {PENDING_RANGE_KEY} from './HifzMushafMode';
import type {JourneySection} from '../../quran/journey';

type Props = {asset: QuranAsset; state: QuranLearningState; onState: (next: QuranLearningState) => void; notify: (text: string) => void; onOpen: (section: JourneySection) => void; onOpenHifz: () => void};

// بطاقة مستقلة: خطط القرآن والإنجاز (الخطة المتفق عليها، التقدم، الموضع الحالي).
export default function QuranPlansCard({asset, state, onState, notify, onOpen, onOpenHifz}: Props) {
  const [root, setRoot] = useState(() => loadMasteryState());
  const rootRef = useRef(root);
  const commit = (fn: (r: MasteryStateRoot) => MasteryStateRoot) => {
    const next = fn(rootRef.current);
    try { saveMasteryState(next, rootRef.current); rootRef.current = next; setRoot(next); return true; }
    catch { notify('تعذر الحفظ على الجهاز. لم يُسجّل التغيير.'); return false; }
  };
  const open = (range: VerseRange) => {
    try { localStorage.setItem(PENDING_RANGE_KEY, JSON.stringify(range)); } catch { /* ignore */ }
    onOpenHifz();
  };
  let last: {surah: number; from: number; to: number; page: number; mode: string} | null = null;
  try { const raw = localStorage.getItem('rabbani-hifz-mushaf-v1'); if (raw) last = JSON.parse(raw); } catch { /* ignore */ }
  const metrics = dashboard(root);
  const hasRootData = metrics.started > 0;
  return <section className="qm-workspace quran-plans-card" dir="rtl" aria-label="خطط القرآن والإنجاز">
    {last && <div className="qm-card"><h3>موضعي الحالي في الحفظ</h3><p>{referenceLabel(asset, last.surah, last.from, last.to)} · صفحة المقطع {toArabicNumber(last.page + 1)}</p><button type="button" className="primary" onClick={onOpenHifz}>استئناف</button></div>}
    {hasRootData ? <section className="quran-journey" aria-label="ملخص تقدمي في الحفظ"><dl className="quran-journey-stats">
      <div><dt>بدأت حفظه</dt><dd>{toArabicNumber(metrics.started)} آية</dd></div>
      <div><dt>الراسخ</dt><dd>{toArabicNumber(metrics.mastered)} آية</dd></div>
      <div><dt>مراجعات اليوم</dt><dd>{toArabicNumber(metrics.due)}{metrics.overdue > 0 && <small> · متأخر {toArabicNumber(metrics.overdue)}</small>}</dd></div>
      <div><dt>يحتاج تثبيتًا</dt><dd>{toArabicNumber(metrics.weak)}</dd></div>
      <div><dt>جلسات مكتملة اليوم</dt><dd>{toArabicNumber(metrics.completedToday)}</dd></div>
    </dl><p className="qm-muted">«بدأت حفظه» لا يعني الإتقان. الراسخ لا يُمنح إلا بتقييم ذاتي متتابع على مراجعات متباعدة.</p></section> : <QuranJourney asset={asset} state={state} onOpen={onOpen}/>}
    <div className="qm-card"><h3>خططي ومراجعات اليوم والتقدم</h3><MasteryPlanning asset={asset} root={root} commit={commit} open={open as never}/></div>
    <QuranProgress asset={asset} state={state} onState={onState} notify={notify} rootMemorization={{memorizedVerses: metrics.started, masteredVerses: metrics.mastered}}/>
  </section>;
}
