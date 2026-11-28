import {useEffect, useMemo, useState} from 'react';
import {ArrowRight, BookOpen, ChevronLeft, Flower2, HandHeart, ListChecks, ScrollText, Target} from 'lucide-react';
import '../achievement/achievement.css';
import type {State} from '../app-state';
import type {QuranAsset, QuranLearningState} from '../quran/types';
import {loadQuran} from '../quran/content';
import {loadMasteryState} from '../quran-mastery/storage';
import {BILQURAN_PLAN_CHANGED_EVENT, buildBilQuranDailySteps, findBilQuranPlan, loadActiveBilQuranPlan} from '../quran-mastery/bilquran-plans';
import {useBackHandler} from '../navigation/useBackHandler';
import QuranProgress from './quran/QuranProgress';
import {periodRange, type PeriodId} from '../achievement/dates';
import {
  activeMasteryPlan, bilQuranSummary, insufficientRecords, firstLogDate, goalStats, logDays, planWindow, prayerStats, ratioOf, readingIn,
  statusOf, sunnahStats, taskStats, toneOf, verseCoverage, wirdStats, type DayKind, type Stat, type Tone
} from '../achievement/selectors';

type Category = 'quran' | 'sunnah' | 'goals' | 'adhkar' | 'prayer' | 'tasks';
type Props = {
  state: State;
  onQuran: (next: QuranLearningState) => void;
  notify: (text: string) => void;
  onOpenQuranSection: (section: 'hifz' | 'sunnah' | 'azkar' | 'routine') => void;
  onOpenView: (view: 'goals' | 'day' | 'wird') => void;
};

const ar = (n: number) => n.toLocaleString('ar-EG');
const PERIODS: {id: PeriodId; label: string; scope: string}[] = [
  {id: 'week', label: 'الأسبوع', scope: 'هذا الأسبوع'}, {id: 'month', label: 'الشهر', scope: 'هذا الشهر'}, {id: 'year', label: 'السنة', scope: 'هذه السنة'}
];
const DAY_LABEL: Record<DayKind, string> = {done: 'أُنجز', partial: 'جزئي', missed: 'لا سجل على هذا الجهاز', pending: 'لم يُسجَّل بعد اليوم', off: 'لا مقرر', unknown: 'غير معروف', future: 'قادم'};
const weekdayFmt = new Intl.DateTimeFormat('ar-EG', {weekday: 'short'});
const fmtDate = (key: string) => new Intl.DateTimeFormat('ar-EG', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(`${key}T12:00:00`));
const RANK: Record<Tone, number> = {behind: 0, steady: 1, good: 2, none: 3};
const worse = (a: Tone, b: Tone): Tone => RANK[a] <= RANK[b] ? a : b;
const TONE_WORD: Record<Tone, string> = {good: 'بلغ المقرر', steady: 'قريب', behind: 'متأخر', none: 'لا مقرر'};
const UNSURE = 'سجلات غير كافية للحكم';
const dayNum = (key: string) => ar(Number(key.slice(8)));

function Bar({ratio, tone, label}: {ratio?: number; tone: Tone; label: string}) {
  if (ratio === undefined) return null;
  const pct = Math.round(ratio * 100);
  return <div className="ach-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} data-tone={tone}><i style={{width: `${pct}%`}}/></div>;
}

function Card({icon: Icon, title, stat, onClick, id}: {icon: typeof BookOpen; title: string; stat: Stat; onClick: () => void; id: Category}) {
  return <button type="button" className="ach-card" data-tone={stat.tone} data-ach-card={id} onClick={onClick}>
    <span className="ach-card-head"><span className="ach-ico"><Icon size={18} aria-hidden="true"/></span><strong>{title}</strong><ChevronLeft size={16} className="ach-chev" aria-hidden="true"/></span>
    <span className="ach-headline">{stat.headline}</span>
    <Bar ratio={stat.ratio} tone={stat.tone} label={`${title}: ${stat.detail}`}/>
    <small className="ach-detail">{stat.detail}</small>
    <span className="ach-status" data-tone={stat.tone}>{stat.status}</span>
  </button>;
}

function Block({title, children, tone, chip}: {title: string; children: React.ReactNode; tone?: Tone; chip?: string}) {
  return <section className="ach-block" data-tone={tone ?? 'none'}><h3>{title}{chip && <span className="ach-chip">{chip}</span>}</h3>{children}</section>;
}
const Row = ({k, v}: {k: string; v: string}) => <div className="ach-row"><span>{k}</span><b>{v === '٠' ? 'صفر' : v}</b></div>;

export default function AchievementView({state, onQuran, notify, onOpenQuranSection, onOpenView}: Props) {
  const [period, setPeriod] = useState<PeriodId>('week');
  const [cat, setCat] = useState<Category | null>(null);
  const [asset, setAsset] = useState<QuranAsset | null>(null);
  const [tick, setTick] = useState(0);
  useBackHandler(() => setCat(null), cat !== null);
  useEffect(() => { let on = true; loadQuran().then(a => { if (on) setAsset(a); }).catch(() => {}); return () => { on = false; }; }, []);
  useEffect(() => {
    const bump = () => setTick(v => v + 1);
    window.addEventListener('rabbani-mastery-changed', bump);
    window.addEventListener(BILQURAN_PLAN_CHANGED_EVENT, bump);
    return () => { window.removeEventListener('rabbani-mastery-changed', bump); window.removeEventListener(BILQURAN_PLAN_CHANGED_EVENT, bump); };
  }, []);

  const now = useMemo(() => new Date(), [tick, period]);
  const range = periodRange(period, now);
  const scope = PERIODS.find(p => p.id === period)!.scope;
  const root = useMemo(() => { try { return loadMasteryState(); } catch { return null; } }, [tick]);
  const bil = useMemo(() => loadActiveBilQuranPlan(), [tick]);
  const bilTotal = useMemo(() => {
    if (!bil || !asset) return 0;
    const spec = findBilQuranPlan(bil.planId);
    return spec ? buildBilQuranDailySteps(asset, spec, bil.direction).length : 0;
  }, [bil, asset]);
  const log = state.achievementLog;
  const q = state.quran;

  const plan = root ? activeMasteryPlan(root) : undefined;
  const win = root && plan ? planWindow(root, plan, period, now) : null;
  const cover = useMemo(() => verseCoverage(root, q), [root, q]);
  const reading = readingIn(q, range);
  const bilSum = bilQuranSummary(bil, bilTotal, log, range);
  const sunnah = sunnahStats(q, range);
  const goals = goalStats(state.goals, period, now);
  const prayer = prayerStats(state.dayRecords, period, now);
  const tasks = taskStats(state.tasks, now);
  const wirds = wirdStats(state.wirds);
  const adhkarDays = logDays(log, 'adhkar_category', range);
  const adhkarStart = firstLogDate(log, 'adhkar_category');

  const unsure = win ? insufficientRecords(win) : false;
  const dayTone: Tone = win && !unsure ? toneOf(win.full, win.assigned) : 'none';
  const verseTone: Tone = win && !unsure ? toneOf(win.doneVerses, win.plannedVerses) : 'none';
  const quranStat: Stat = win && win.assigned > 0
    ? (() => { const tone = unsure ? 'none' as Tone : worse(dayTone, verseTone); return {headline: `${ar(win.doneVerses)} من ${ar(win.plannedVerses)} آية مقررة`, detail: `الأيام: ${ar(win.full)} من ${ar(win.assigned)} منجزة ${scope}${unsure ? ` · ${ar(win.noRecord)} بلا سجل` : ''} · حسب سجلات هذا الجهاز`, ratio: ratioOf(win.doneVerses, win.plannedVerses), tone, status: unsure ? `${UNSURE} · المسجل ${ar(win.doneVerses)} من ${ar(win.plannedVerses)}` : `الآيات: ${TONE_WORD[verseTone]} · الأيام: ${TONE_WORD[dayTone]}`}; })()
    : win ? {headline: 'لا أيام مقررة بعد', detail: `خطة «${win.plan.title}» ${scope}`, tone: 'none', status: 'ليس تقصيرًا'}
    : bilSum && bilSum.total ? {headline: `${ar(bilSum.done)} من ${ar(bilSum.total)} مقررًا`, detail: 'تقدم خطة الحفظ (إجمالي، دون تقويم يومي)', ratio: bilSum.done / bilSum.total, tone: 'none', status: 'التقويم اليومي يبدأ من الآن'}
    : {headline: reading.verses ? `${ar(reading.verses)} آية مقروءة` : 'لا نشاط مسجل', detail: reading.verses ? `قراءة ${scope}` : 'ابدأ خطة حفظ لتظهر المقارنة', tone: 'none', status: 'لا خطة نشطة'};
  const sunnahPlan = sunnah.plans[0];
  const sunnahStat: Stat = sunnahPlan && sunnahPlan.progress.total
    ? {headline: `${ar(sunnahPlan.progress.mastered)} من ${ar(sunnahPlan.progress.total)} راسخة`, detail: sunnahPlan.plan.title, ratio: sunnahPlan.progress.ratio, tone: 'none', status: 'تقدم الخطة'}
    : {headline: sunnah.started ? `${ar(sunnah.started)} حديثًا بدأت حفظه` : 'لا نشاط مسجل', detail: sunnah.started ? `${ar(sunnah.mastered)} راسخة` : 'اختر خطة لحفظ الأحاديث', tone: 'none', status: 'لا خطة نشطة'};
  const goalTone = toneOf(goals.done, goals.planned);
  const goalStat: Stat = goals.planned ? {headline: `${ar(goals.done)} من ${ar(goals.planned)} خطوة`, detail: `خطوات الأهداف ${scope}`, ratio: ratioOf(goals.done, goals.planned), tone: goalTone, status: statusOf(goalTone)}
    : {headline: 'لا خطوات مقررة', detail: 'أضف خطوات لأهدافك', tone: 'none', status: 'لا مقرر'};
  const adhkarStat: Stat = adhkarDays.size ? {headline: `${ar(adhkarDays.size)} يوم ${scope}`, detail: `التسجيل بدأ ${fmtDate(adhkarStart!)}`, tone: 'none', status: 'سجل من تاريخ البدء فقط'}
    : {headline: 'لا سجل بعد', detail: adhkarStart ? `التسجيل بدأ ${fmtDate(adhkarStart)}` : 'يبدأ التسجيل منذ تفعيل الميزة', tone: 'none', status: 'لا نسبة بلا سجل'};
  const prayerTone = prayer.recorded ? toneOf(prayer.ontime, prayer.recorded) : 'none';
  const prayerStat: Stat = prayer.recorded ? {headline: `${ar(prayer.ontime)} من ${ar(prayer.recorded)} مسجلة في وقتها`, detail: prayer.unknown ? `غير مسجل: ${ar(prayer.unknown)}` : 'كلها مسجلة', ratio: ratioOf(prayer.ontime, prayer.recorded), tone: prayerTone, status: statusOf(prayerTone).replace('المقرر', 'المسجل')}
    : {headline: 'لا تسجيل بعد', detail: 'سجّل صلواتك لتظهر هنا', tone: 'none', status: 'غير مسجل ليس تركًا'};
  const taskTone = toneOf(tasks.done, tasks.total);
  const taskStat: Stat = tasks.total ? {headline: `${ar(tasks.done)} من ${ar(tasks.total)} مهمة`, detail: `الفترة الحالية فقط${wirds.total ? ` · أوراد مكتملة ${ar(wirds.complete)} من ${ar(wirds.total)}` : ''}`, ratio: ratioOf(tasks.done, tasks.total), tone: taskTone, status: statusOf(taskTone)}
    : {headline: 'لا مهام', detail: 'لا مهام في الفترة الحالية', tone: 'none', status: 'لا مقرر'};

  const back = <button type="button" className="ach-back" onClick={() => setCat(null)}><ArrowRight size={16}/> كل الإنجاز</button>;
  const tabs = <div className="ach-tabs" role="tablist" aria-label="الفترة">{PERIODS.map(p => <button key={p.id} role="tab" aria-selected={period === p.id} className={period === p.id ? 'active' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>)}</div>;

  return <div className="ach-page" dir="rtl" data-ach-view={cat ?? 'hub'}>
    {!cat ? <div className="page-intro"><span className="eyebrow">الإنجاز</span><h1>الإنجاز</h1>
      <p>كل نوع يقيس شيئًا مختلفًا، فلا يوجد رقم إجمالي واحد. اللون يعكس الإنجاز مقابل المقرر فقط.</p></div>
      : <div className="ach-head">{back}<h1>{{quran: 'إنجاز القرآن', sunnah: 'إنجاز السنة', goals: 'إنجاز الأهداف', adhkar: 'إنجاز الأذكار', prayer: 'إنجاز الصلاة', tasks: 'المهام والأوراد'}[cat]}</h1></div>}
    {tabs}
    {!cat && <div className="ach-grid">
      <Card id="quran" icon={BookOpen} title="القرآن" stat={quranStat} onClick={() => setCat('quran')}/>
      <Card id="sunnah" icon={ScrollText} title="السنة" stat={sunnahStat} onClick={() => setCat('sunnah')}/>
      <Card id="goals" icon={Target} title="الأهداف" stat={goalStat} onClick={() => setCat('goals')}/>
      <Card id="adhkar" icon={Flower2} title="الأذكار" stat={adhkarStat} onClick={() => setCat('adhkar')}/>
      <Card id="prayer" icon={HandHeart} title="الصلاة" stat={prayerStat} onClick={() => setCat('prayer')}/>
      <Card id="tasks" icon={ListChecks} title="المهام والأوراد" stat={taskStat} onClick={() => setCat('tasks')}/>
    </div>}

    {cat === 'quran' && <>
      {win ? <>
        <Block title={`الانتظام: ${win.plan.title}`} tone={dayTone} chip={unsure ? UNSURE : `الأيام: ${TONE_WORD[dayTone]}`}>
          <div className="ach-strip" role="list">{win.days.map(d => <span key={d.date} role="listitem" className="ach-day" data-kind={d.kind} data-sched={d.sched ? '1' : '0'} title={`${d.date} · ${DAY_LABEL[d.kind]}`} aria-label={`${weekdayFmt.format(new Date(`${d.date}T12:00:00`))} ${dayNum(d.date)}: ${DAY_LABEL[d.kind]}`}>{period === 'week' ? weekdayFmt.format(new Date(`${d.date}T12:00:00`)) : dayNum(d.date)}</span>)}</div>
          <p className="ach-legend"><i data-kind="done"/>أُنجز <i data-kind="partial"/>جزئي {win.noRecord > 0 && <><i data-kind="missed"/>لا سجل </>}<i data-kind="off"/>لا مقرر</p>
          {win.noRecord > 0 && <p className="ach-note" role="note">«لا سجل» ليس تقصيرًا مؤكدًا: الحساب من سجلات هذا الجهاز وجدول الخطة الحالي. عمل أنجزته على جهاز آخر أو قبل تعديل الجدول قد لا يظهر هنا.</p>}
          <Row k="أيام منجزة كاملة" v={`${ar(win.full)} من ${ar(win.assigned)} أيام مقررة`}/>
        </Block>
        <Block title={`الفجوة (${scope})`} tone={verseTone} chip={unsure ? `المسجل فقط: ${ar(win.doneVerses)} من ${ar(win.plannedVerses)}` : `الآيات: ${TONE_WORD[verseTone]}`}>
          <Row k="المقرر حتى اليوم" v={`${ar(win.plannedVerses)} آية`}/>
          <Row k="المنجز ضمن الخطة" v={`${ar(win.doneVerses)} آية`}/>
          <Bar ratio={ratioOf(win.doneVerses, win.plannedVerses)} tone={verseTone} label="المنجز مقابل المقرر"/>
          <Row k="المتبقي للّحاق" v={`${ar(Math.max(0, win.plannedVerses - win.doneVerses))} آية`}/>
        </Block>
        <details className="ach-help"><summary>كيف تُحسب الأرقام؟</summary>
          <p>الأيام: يوم مقرر يُعدّ منجزًا إذا بلغ حفظك الجديد الورد اليومي. الآيات: مجموع آيات الحفظ الجديد المكتمل مقابل مجموع الورد للأيام المقررة حتى اليوم. قد يتأخر أحدهما عن الآخر.</p>
          <p>اليوم الحالي لا يُحسب تقصيرًا قبل أن ينتهي. اللون الأخضر لا يظهر إلا عند بلوغ المقرر كاملًا، و«قريب» يعني ٨٠٪ فأكثر. أيام الراحة لا تُحسب. المخطط بخطوط: قبل بدء الخطة فلا بيانات. الجدول المعتمد هو جدول الخطة الحالي، وتعديلاتها السابقة لا تُحفظ نسخًا.</p>
        </details></> : <Block title="الخطة">
        {bilSum && bilSum.total ? <>
          <Row k="خطة الحفظ" v={`${ar(bilSum.done)} من ${ar(bilSum.total)} مقررًا`}/>
          <Bar ratio={bilSum.done / bilSum.total} tone="none" label="تقدم الخطة"/>
          <Row k={`أيام الإنجاز المسجلة ${scope}`} v={ar(bilSum.daysLogged)}/>
          <Row k={`مقررات مسجلة بتاريخها ${scope}`} v={ar(bilSum.stepsLogged)}/>
          <p className="ach-note">هذه الخطة لا تحفظ تاريخ كل إتمام قبل الآن، فلا يظهر لها تقويم أو فجوة يومية. يبدأ تسجيل الأيام من تفعيل هذه الميزة.</p>
        </> : <p className="ach-note">لا خطة حفظ نشطة. ابدأ خطة من مصحف الحفظ ليظهر الانتظام والفجوة.</p>}
      </Block>}
      <Block title="مسار الحفظ (كل الوقت، بلا مقارنة بالهدف)">
        <Row k="آيات بدأت حفظها" v={ar(cover.started)}/><Row k="آيات راسخة" v={ar(cover.mastered)}/><Row k="تحتاج تثبيتًا" v={ar(cover.weak)}/>
        <p className="ach-note">كل آية تُحسب مرة واحدة من سجلات الحفظ القديمة والجديدة، والأحدث تقييمًا هو المعتمد.{cover.undated ? ` ${ar(cover.undated)} آية بلا تاريخ تقييم.` : ''}</p>
      </Block>
      <Block title="القراءة (منفصلة عن الحفظ)">
        <Row k={`آيات مقروءة ${scope}`} v={ar(reading.verses)}/><Row k="جلسات القراءة" v={ar(reading.sessions)}/>
        {reading.truncated && <p className="ach-note">السجل يحفظ آخر ٥٠٠ جلسة فقط، فقد تكون جلسات أقدم من هذه الفترة غير ظاهرة.</p>}
      </Block>
      <div className="ach-actions"><button className="soft-btn" onClick={() => onOpenQuranSection('hifz')}>افتح مصحف الحفظ والإتقان</button><button className="soft-btn" onClick={() => onOpenQuranSection('routine')}>وردي اليومي</button></div>
      <details className="ach-more"><summary>السجلات والتأملات والمراجعات</summary>{asset ? <QuranProgress asset={asset} state={q} onState={onQuran} notify={notify}/> : <p className="ach-note">جارٍ التحميل…</p>}</details>
    </>}

    {cat === 'sunnah' && <>
      <Block title="الحفظ">
        {sunnah.plans.map(p => <div key={p.plan.id}><Row k={p.plan.title} v={`${ar(p.progress.mastered)} من ${ar(p.progress.total)} راسخة`}/><Bar ratio={p.progress.ratio} tone="none" label={p.plan.title}/></div>)}
        <Row k="أحاديث بدأت حفظها" v={ar(sunnah.started)}/><Row k="أحاديث راسخة" v={ar(sunnah.mastered)}/>
        {!sunnah.plans.length && <p className="ach-note">لا خطة أحاديث نشطة، فلا مقارنة بالمقرر.</p>}
      </Block>
      <Block title={`النشاط ${scope}`}><Row k="مراجعات ناجحة" v={ar(sunnah.reviewedPassed)}/><Row k="أيام ورد الحديث" v={ar(sunnah.routineDays)}/></Block>
      <div className="ach-actions"><button className="soft-btn" onClick={() => onOpenQuranSection('sunnah')}>افتح حفظ السنة</button></div>
    </>}

    {cat === 'goals' && <>
      <Block title={`خطوات الأهداف ${scope}`} tone={goalTone}>
        <Row k="المنجز" v={`${ar(goals.done)} من ${ar(goals.planned)} خطوة`}/>
        <Bar ratio={ratioOf(goals.done, goals.planned)} tone={goalTone} label="خطوات الأهداف"/>
        <p className="ach-note">تُعدّ الخطوات اليومية والأسبوعية والشهرية والسنوية والمخصصة ضمن مدة كل هدف، حتى اليوم فقط.</p>
      </Block>
      <div className="ach-actions"><button className="soft-btn" onClick={() => onOpenView('goals')}>افتح المؤمن القوي</button></div>
    </>}

    {cat === 'adhkar' && <>
      <Block title={`أيام إتمام الأذكار ${scope}`}>
        <Row k="أيام مسجلة" v={ar(adhkarDays.size)}/>
        <p className="ach-note">{adhkarStart ? `التسجيل بدأ في ${fmtDate(adhkarStart)}. لا تُعرض نسبة لأن التطبيق لم يكن يحفظ تاريخًا قبل ذلك.` : 'لا سجل بعد. يُسجَّل اليوم عند إتمام جميع أذكار فئة، ولا يُخترع تاريخ سابق.'}</p>
      </Block>
      <div className="ach-actions"><button className="soft-btn" onClick={() => onOpenQuranSection('azkar')}>افتح الأذكار</button></div>
    </>}

    {cat === 'prayer' && <>
      <Block title={`الصلوات المسجلة ${scope}`} tone={prayerTone}>
        <Row k="في وقتها" v={ar(prayer.ontime)}/><Row k="متأخرة" v={ar(prayer.late)}/><Row k="عذر معتبر" v={ar(prayer.excused)}/><Row k="لم تُؤدَّ" v={ar(prayer.missed)}/>
        <Row k="غير مسجل" v={ar(prayer.unknown)}/>
        <p className="ach-note">ترك التسجيل يعني «غير مسجل» ولا يُعدّ تركًا للصلاة.</p>
      </Block>
      <div className="ach-actions"><button className="soft-btn" onClick={() => onOpenView('day')}>افتح يومي مع الله</button></div>
    </>}

    {cat === 'tasks' && <>
      <Block title="المهام (الفترة الحالية)" tone={taskTone}><Row k="مكتملة" v={`${ar(tasks.done)} من ${ar(tasks.total)}`}/><Bar ratio={ratioOf(tasks.done, tasks.total)} tone={taskTone} label="المهام"/>
        <p className="ach-note">التطبيق لا يحفظ تاريخ المهام السابقة، فتُعرض الفترة الحالية فقط.</p></Block>
      <Block title="الأوراد"><Row k="أوراد مكتملة في فترتها" v={`${ar(wirds.complete)} من ${ar(wirds.total)}`}/></Block>
      <div className="ach-actions"><button className="soft-btn" onClick={() => onOpenView('wird')}>افتح الأوراد</button></div>
    </>}
  </div>;
}
