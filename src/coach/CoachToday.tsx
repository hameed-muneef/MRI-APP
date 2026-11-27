import {useMemo,useState} from 'react';
import {BookOpen,CalendarPlus,CheckCircle2,Clock3,Flame,Sparkles,TrendingUp} from 'lucide-react';
import type {AchievementEntry} from '../achievement/log';
import type {Task,TaskSchedule,Wird} from '../app-state';
import type {DayPlan} from '../DayPlanner';
import {timeLabel} from '../day-timing';
import type {DayRecords} from '../day-tracking';
import {localGoalDate,type Goal} from '../goal-plan';
import {loadMasteryState} from '../quran-mastery/storage';
import type {MasteryStateRoot} from '../quran-mastery/types';
import type {MemorizationPassage} from '../quran/types';
import {
  courseCoachOn,
  courseDaysDone,
  courseSuggestions,
  dismissCourse,
  setCourseCoach,
  type CourseCoach,
} from './course';
import {applyStepPeriod,coachEntitled,dismissSuggestion} from './engine';
import {applyHabitTarget,dismissHabit,type WirdWithCoach} from './habit';
import {
  buildSmartTodayPlan,
  buildWeeklyReport,
  type SmartTodayItem,
  type WeeklyRecommendation,
} from './smart';
import type {CoachSettings} from './types';

type Props={
  goals:Goal[];
  tasks:Task[];
  wirds?:Wird[];
  coach?:CourseCoach;
  coachSettings?:CoachSettings;
  prayers?:Record<string,string>;
  dayPlan?:DayPlan;
  dayRecords?:DayRecords;
  taskSchedules?:Record<string,TaskSchedule>;
  achievementLog?:AchievementEntry[];
  quranPassages?:MemorizationPassage[];
  masteryRoot?:MasteryStateRoot|null;
  onCoach:(coach:CourseCoach)=>void;
  onCoachSettings?:(settings:CoachSettings)=>void;
  onCompleteGoalStep?:(goalId:string,stepId:string)=>void;
  onCompleteCourseTask?:(taskId:string)=>void;
  onCompleteWird?:(wirdId:string)=>void;
  onScheduleSmartItem?:(item:SmartTodayItem)=>void;
  onUpdateGoal?:(goal:Goal)=>void;
  onUpdateWird?:(wird:WirdWithCoach)=>void;
  onOpenPlanTask?:(task:Task)=>void;
  onOpenHifzTask?:(hifz:NonNullable<Task['hifz']>)=>void;
  onOpenQuran?:()=>void;
  onOpenWirds?:()=>void;
};

const reason={behind:'تأخّرت عنها',deadline:'موعدها قريب',due:'مستحقة'} as const;
const period={daily:'يومي',weekly:'أسبوعي',monthly:'شهري'} as const;
const n=(v:number)=>v.toLocaleString('ar-EG');

const HOWTO_KEY='rabbani-coach-howto-v1';
const howTo=[
  {title:'ما هو المدرّب الذكي؟',text:'محرك محلي يعمل بلا إنترنت يرتّب خطواتك اليومية حسب أولويتك وأوقات فراغك بين الصلوات، دون أي تدخل قسري في خطتك.'},
  {title:'كيف أفعّله؟',text:'مفتاح «تفعيل للكل» يشغّل المدرّب على أهدافك وأورادك ومقررك دفعة واحدة، ويمكنك استثناء أي هدف أو ورد من بطاقته الخاصة.'},
  {title:'عودة هادئة وتقرير أسبوعي',text:'عند الانقطاع ٣ أيام أو أكثر يقترح عليك نصف الحمل المعتاد لثلاثة أيام حتى تعود بثبات، ويعرض لك تقريرًا أسبوعيًا واقتراحات موازنة.'},
] as const;

function CoachHowTo(){
  const [open,setOpen]=useState(()=>{try{return localStorage.getItem(HOWTO_KEY)!=='1'}catch{return false}});
  const [i,setI]=useState(0);
  if(!open)return <button type="button" className="soft-btn coach-howto-trigger" onClick={()=>{setI(0);setOpen(true)}}>كيف أستفيد من المدرّب؟</button>;
  const close=()=>{try{localStorage.setItem(HOWTO_KEY,'1')}catch{/* ignore */}setOpen(false)};
  const step=howTo[i];
  return <div className="goal-coach-card" role="group" aria-label="شرح المدرّب">
    <button type="button" className="icon-btn" aria-label="إغلاق الشرح" onClick={close} style={{float:'left'}}>✕</button>
    <strong>{step.title} ({n(i+1)}/{n(howTo.length)})</strong>
    <p>{step.text}</p>
    <div className="counter-actions">
      <button type="button" className="soft-btn" disabled={i===0} onClick={()=>setI(i-1)}>السابق</button>
      {i<howTo.length-1?<button type="button" className="primary" onClick={()=>setI(i+1)}>التالي</button>:<button type="button" className="primary" onClick={close}>فهمت</button>}
    </div>
  </div>;
}

export default function CoachToday({
  goals,
  tasks,
  wirds=[],
  coach,
  coachSettings,
  prayers={},
  dayPlan,
  dayRecords,
  taskSchedules={},
  achievementLog,
  quranPassages=[],
  masteryRoot,
  onCoach,
  onCoachSettings,
  onCompleteGoalStep,
  onCompleteCourseTask,
  onCompleteWird,
  onScheduleSmartItem,
  onUpdateGoal,
  onUpdateWird,
  onOpenPlanTask,
  onOpenHifzTask,
  onOpenQuran,
  onOpenWirds,
}:Props){
  const [tab,setTab]=useState<'today'|'weekly'>('today');
  const [showDeferred,setShowDeferred]=useState(false);

  const resolvedMastery=useMemo(()=>{
    if(masteryRoot!==undefined)return masteryRoot;
    try{return loadMasteryState()}catch{return null}
  },[masteryRoot,tasks,quranPassages]);

  if(!coachEntitled())return null;

  const now=new Date();
  const todayKey=localGoalDate(now);
  const globalOn=Boolean(coachSettings?.globalEnabled);
  const courseOn=courseCoachOn(coach,coachSettings);

  const smartInput={
    goals,
    tasks,
    wirds,
    courseCoach:coach,
    coachSettings,
    prayers,
    dayPlan,
    dayRecords,
    taskSchedules,
    achievementLog,
    quranPassages,
    masteryRoot:resolvedMastery,
    now,
  };

  const plan=buildSmartTodayPlan(smartInput);
  const report=tab==='weekly'?buildWeeklyReport(smartInput):null;
  const warnings=courseSuggestions(coach,now,coachSettings);
  const topQuranTask=plan.quran.topDueTaskId?tasks.find(t=>t.id===plan.quran.topDueTaskId):undefined;

  const toggleGlobal=(checked:boolean)=>{
    if(!onCoachSettings)return;
    onCoachSettings({
      ...(coachSettings??{globalEnabled:false}),
      globalEnabled:checked,
      enabledAt:coachSettings?.enabledAt??todayKey,
    });
  };

  const toggleCourse=(checked:boolean)=>{
    if(globalOn)onCoach(setCourseCoach(coach,checked,now,checked?'inherit':'off'));
    else onCoach(setCourseCoach(coach,checked,now));
  };

  const dismissRecoveryToday=()=>{
    if(!onCoachSettings)return;
    onCoachSettings({
      ...(coachSettings??{globalEnabled:globalOn,enabledAt:todayKey}),
      recovery:{
        startedAt:coachSettings?.recovery?.startedAt??todayKey,
        dismissedUntil:todayKey,
      },
    });
  };

  const dismissWeeklyRec=(id:string)=>{
    if(!onCoachSettings)return;
    const prev=coachSettings?.dismissedWeekly??[];
    onCoachSettings({
      ...(coachSettings??{globalEnabled:globalOn,enabledAt:todayKey}),
      dismissedWeekly:[...prev.filter(x=>x!==id),id].slice(-60),
    });
  };

  const acceptWeeklyRec=(rec:WeeklyRecommendation)=>{
    if(rec.kind==='goal-suggestion'&&rec.goal&&rec.suggestion?.stepId&&rec.suggestion.to&&onUpdateGoal){
      onUpdateGoal(dismissSuggestion(applyStepPeriod(rec.goal,rec.suggestion.stepId,rec.suggestion.to),rec.suggestion.id));
    }else if(rec.kind==='habit-suggestion'&&rec.wird&&rec.habitSuggestion?.target!==undefined&&onUpdateWird){
      onUpdateWird(dismissHabit(applyHabitTarget(rec.wird,rec.habitSuggestion.target),rec.habitSuggestion.id));
    }
    dismissWeeklyRec(rec.id);
  };

  const dismissWeeklyAction=(rec:WeeklyRecommendation)=>{
    if(rec.kind==='goal-suggestion'&&rec.goal&&rec.suggestion&&onUpdateGoal){
      onUpdateGoal(dismissSuggestion(rec.goal,rec.suggestion.id));
    }else if(rec.kind==='habit-suggestion'&&rec.wird&&rec.habitSuggestion&&onUpdateWird){
      onUpdateWird(dismissHabit(rec.wird,rec.habitSuggestion.id));
    }else if(rec.kind==='course-warning'&&coach){
      onCoach(dismissCourse(coach,rec.id));
    }
    dismissWeeklyRec(rec.id);
  };

  const renderItem=(item:SmartTodayItem)=>{
    const matchingTask=item.source==='course'?tasks.find(t=>t.id===item.stepId):undefined;
    const matchingWird=item.source==='habit'?wirds.find(w=>w.id===item.stepId):undefined;
    return <li key={`${item.source}-${item.stepId}`} className="coach-today-item">
      <div className="coach-item-main">
        <div className="coach-item-copy">
          <strong>{item.title}</strong>
          <span className="muted small"> · {item.goalTitle} · {period[item.period]} · {reason[item.reason]}</span>
          {item.scheduledTimeToday?(
            <div className="coach-item-slot is-scheduled"><Clock3 size={13} aria-hidden="true"/><span>مجدولة اليوم الساعة {timeLabel(item.scheduledTimeToday)}</span></div>
          ):item.scheduledDate?(
            <div className="coach-item-slot is-scheduled"><Clock3 size={13} aria-hidden="true"/><span>مجدولة بتاريخ {item.scheduledDate}</span></div>
          ):item.suggestedSlot?(
            <div className="coach-item-slot"><Clock3 size={13} aria-hidden="true"/><span>المقترح: {item.suggestedSlot.label} ({timeLabel(item.suggestedSlot.startTime)} · {n(item.suggestedSlot.freeMinutes)} د)</span></div>
          ):null}
        </div>
        <div className="coach-item-actions">
          {matchingTask?.plan&&onOpenPlanTask&&(
            <button type="button" className="soft-btn coach-action-btn" onClick={()=>onOpenPlanTask(matchingTask)}>
              {matchingTask.plan.kind==='day'?'ابدأ المقرر':'ابدأ المراجعة'}
            </button>
          )}
          {matchingTask?.hifz&&onOpenHifzTask&&(
            <button type="button" className="soft-btn coach-action-btn" onClick={()=>onOpenHifzTask(matchingTask.hifz!)}>
              ابدأ التسميع
            </button>
          )}
          {item.source==='habit'&&!onCompleteWird&&onOpenWirds&&(
            <button type="button" className="soft-btn coach-action-btn" onClick={onOpenWirds}>فتح</button>
          )}
          {!item.scheduledTimeToday&&item.suggestedSlot&&onScheduleSmartItem&&(
            <button type="button" className="soft-btn coach-action-btn" onClick={()=>onScheduleSmartItem(item)}>
              <CalendarPlus size={14} aria-hidden="true"/>
              <span>جدولة في يومي</span>
            </button>
          )}
          {((item.source==='goal'&&onCompleteGoalStep)||(item.source==='course'&&onCompleteCourseTask)||(item.source==='habit'&&onCompleteWird))&&(
            <button
              type="button"
              className="primary coach-action-btn"
              onClick={()=>{
                if(item.source==='goal')onCompleteGoalStep?.(item.goalId,item.stepId);
                else if(item.source==='course')onCompleteCourseTask?.(item.stepId);
                else if(item.source==='habit')onCompleteWird?.(item.stepId);
              }}
            >
              <CheckCircle2 size={14} aria-hidden="true"/>
              <span>{matchingWird?`إتمام (${n(matchingWird.target)})`:'إنجاز'}</span>
            </button>
          )}
        </div>
      </div>
    </li>;
  };

  return <section className="panel coach-today" aria-label="المدرّب اليوم">
    <div className="coach-today-header">
      <div className="coach-today-brand">
        <span className="coach-today-icon" aria-hidden="true"><Sparkles size={18}/></span>
        <div>
          <strong className="coach-today-heading">المدرّب الذكي</strong>
          <small className="muted coach-today-sub">محرك محلي بلا إنترنت · يقترح ولا يفرض</small>
        </div>
      </div>
      {onCoachSettings&&(
        <label className="goal-coach-switch coach-global-switch">
          <input type="checkbox" role="switch" aria-label="تفعيل المدرّب الذكي للكل" checked={globalOn} onChange={e=>toggleGlobal(e.target.checked)}/>
          <span>تفعيل للكل</span>
        </label>
      )}
    </div>

    <div className="coach-controls-row">
      <label className="goal-coach-switch">
        <input type="checkbox" role="switch" aria-label="تفعيل المدرّب لمهام المقرر" checked={courseOn} onChange={e=>toggleCourse(e.target.checked)}/>
        <Sparkles size={15}/>
        <span>المدرّب لمهام المقرر</span>
      </label>
      <CoachHowTo/>
    </div>

    <div className="coach-tabs" role="tablist" aria-label="عرض المدرّب الذكي">
      <button type="button" role="tab" aria-selected={tab==='today'} className={tab==='today'?'primary':'soft-btn'} onClick={()=>setTab('today')}>
        خطة اليوم{plan.anyCoachOn&&plan.recommended.length>0?` (${n(plan.recommended.length)})`:''}
      </button>
      <button type="button" role="tab" aria-selected={tab==='weekly'} className={tab==='weekly'?'primary':'soft-btn'} onClick={()=>setTab('weekly')}>
        <TrendingUp size={15} aria-hidden="true"/>
        <span>التقرير الأسبوعي</span>
      </button>
    </div>

    {tab==='today'&&<>
      {!plan.anyCoachOn&&(
        <div className="coach-empty-invite">
          <p className="muted small">فعّل «المدرّب الذكي للكل» ليرتّب لك ما تبدأ به اليوم حسب أوقات فراغك بين الصلوات، ويكشف لك أيام التعثر في تقرير أسبوعي شامل.</p>
          {onCoachSettings&&(
            <button type="button" className="primary coach-activate-btn" onClick={()=>toggleGlobal(true)}>
              <Sparkles size={16} aria-hidden="true"/>
              <span>تفعيل المدرّب الذكي الآن</span>
            </button>
          )}
        </div>
      )}

      {plan.anyCoachOn&&<>
        <div className="coach-status-strip">
          {courseOn&&<span>أنجزت <strong>{n(courseDaysDone(coach,now,coachSettings))}</strong> من آخر ٧ أيام في المقرر</span>}
          <span>السعة المقترحة اليوم: <strong>{n(plan.budget)}</strong> خطوات</span>
          {plan.patterns.peakWindowLabel&&<span>وقت ذروتك: <strong>{plan.patterns.peakWindowLabel}</strong></span>}
        </div>

        {plan.recovery.active&&(
          <div className="goal-coach-card coach-recovery-card" role="region" aria-label="عودة هادئة">
            <div className="coach-callout-head">
              <Flame size={17} aria-hidden="true"/>
              <strong>عودة هادئة · اليوم {n(plan.recovery.dayNumber)} من ٣ (نصف الحمل المعتاد)</strong>
            </div>
            <p>لاحظ المدرّب انقطاعًا منذ {n(plan.recovery.gapDays)} أيام؛ لذلك خفّف لك جدول اليوم إلى {n(plan.recovery.dailyLimit)} خطوات بدلًا من التراكم حتى تستعيد إيقاعك بهدوء.</p>
            {onCoachSettings&&(
              <div className="goal-coach-actions">
                <button type="button" className="soft-btn" onClick={dismissRecoveryToday}>عرض الحمل الكامل اليوم</button>
              </div>
            )}
          </div>
        )}

        {plan.quran.message&&(
          <div className="goal-coach-card coach-quran-card" role="region" aria-label="توجيه الحفظ والمراجعة">
            <div className="coach-callout-head">
              <BookOpen size={17} aria-hidden="true"/>
              <strong>تثبيت المحفوظ أولًا</strong>
            </div>
            <p>{plan.quran.message}</p>
            {(topQuranTask&&onOpenPlanTask)||onOpenQuran?(
              <div className="goal-coach-actions">
                <button
                  type="button"
                  className="soft-btn"
                  onClick={()=>{
                    if(topQuranTask&&onOpenPlanTask)onOpenPlanTask(topQuranTask);
                    else onOpenQuran?.();
                  }}
                >
                  ابدأ المراجعة والتثبيت
                </button>
              </div>
            ):null}
          </div>
        )}

        {plan.coldStart.slice(0,2).map(c=>(
          <div className="goal-coach-card" key={c.id}>
            <strong>{c.title}</strong>
            <p>{c.detail}</p>
          </div>
        ))}
      </>}

      {warnings.map(w=>(
        <div className="goal-coach-card" role="group" aria-label="اقتراح المدرّب" key={w.id}>
          <p>{w.stepId==='course-month'?'مراجعة المقرر الشهرية':'مراجعة المقرر الأسبوعية'} تأخرت في الفترات الأخيرة. ابدأ بها اليوم قبل أن يتسع الفارق.</p>
          <div className="goal-coach-actions">
            <button type="button" className="soft-btn" onClick={()=>coach&&onCoach(dismissCourse(coach,w.id))}>تمام</button>
          </div>
        </div>
      ))}

      {plan.recommended.length>0&&(
        <>
          <h2 className="coach-today-title">ابدأ من هنا</h2>
          <ol className="coach-today-list">
            {plan.recommended.map(renderItem)}
          </ol>
        </>
      )}

      {plan.deferred.length>0&&(
        <div className="coach-deferred-wrap">
          <button type="button" className="soft-btn" onClick={()=>setShowDeferred(v=>!v)}>
            {showDeferred?`إخفاء المهام المؤجلة (${n(plan.deferred.length)})`:`بقية الخطوات المؤجلة لتخفيف اليوم (${n(plan.deferred.length)})`}
          </button>
          {showDeferred&&(
            <ol className="coach-today-list is-deferred">
              {plan.deferred.map(renderItem)}
            </ol>
          )}
        </div>
      )}

      {plan.anyCoachOn&&plan.freeSlots.length>0&&(
        <details className="coach-slots-details">
          <summary>الأوقات المتاحة بين الصلوات اليوم ({n(plan.freeSlots.length)})</summary>
          <ul className="coach-slots-list">
            {plan.freeSlots.map(slot=>(
              <li key={slot.id} className={slot.inWorkHours?'is-work':''}>
                <strong>{slot.label}</strong>
                <span>{timeLabel(slot.startTime)} – {timeLabel(slot.endTime)} ({n(slot.freeMinutes)} د){slot.inWorkHours?' · ضمن ساعات العمل':''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>}

    {tab==='weekly'&&report&&(
      <div className="coach-weekly-report" aria-label="التقرير الأسبوعي الذكي">
        <div className="coach-kpi-grid">
          <div className="coach-kpi-card">
            <small>الالتزام العام (٧ أيام)</small>
            <strong>{report.overallRate===null?'—':`${n(Math.round(report.overallRate*100))}٪`}</strong>
            <span>{n(report.overallDone)} من {n(report.overallExpected)}</span>
          </div>
          {report.pillars.map(p=>(
            <div className="coach-kpi-card" key={p.id}>
              <small>{p.label}</small>
              <strong>{p.rate===null?'—':`${n(Math.round(p.rate*100))}٪`}</strong>
              <span>{p.activeCount===0?'غير مفعّل':`${n(p.done)} من ${n(p.expected)}`}</span>
            </div>
          ))}
        </div>

        <div className="goal-coach-card coach-rhythm-card">
          <strong>تحليل الإيقاع الشخصي</strong>
          <p>
            {report.patterns.peakWindowLabel?`وقت ذروتك المعتاد: ${report.patterns.peakWindowLabel}. `: 'سيظهر وقت ذروتك بعد تسجيل بضعة إنجازات. '}
            {report.patterns.weakestWeekdayLabel?`أكثر يوم يتراجع فيه الإنجاز: ${report.patterns.weakestWeekdayLabel}. `:''}
            {`سعتك اليومية المعتادة نحو ${n(report.patterns.estimatedCapacity)} خطوات.`}
          </p>
        </div>

        {report.recommendations.length===0?(
          <p className="muted small">لا توجد توصيات تعديل معلّقة حاليًا. استمر على إيقاعك الهادئ!</p>
        ):(
          <div className="coach-weekly-recs">
            <h3 className="coach-today-title">توصيات الأسبوع القادم</h3>
            {report.recommendations.map(rec=>(
              <div className="goal-coach-card" key={rec.id} role="group" aria-label="توصية أسبوعية">
                <strong>{rec.title}</strong>
                <p>{rec.body}</p>
                <div className="goal-coach-actions">
                  {rec.actionable&&(
                    <button type="button" className="primary" onClick={()=>acceptWeeklyRec(rec)}>أقبل</button>
                  )}
                  <button type="button" className="soft-btn" onClick={()=>dismissWeeklyAction(rec)}>
                    {rec.actionable?'أبقها كما هي':'تمام'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </section>;
}
