import {useState} from 'react';
import {Sparkles} from 'lucide-react';
import type {Task,Wird} from '../app-state';
import type {Goal} from '../goal-plan';
import {coachEntitled,coachOn} from './engine';
import {courseCoachOn,courseDaysDone,courseSuggestions,dismissCourse,setCourseCoach,todayList,type CourseCoach} from './course';

type Props={goals:Goal[];tasks:Task[];wirds?:Wird[];coach?:CourseCoach;onCoach:(coach:CourseCoach)=>void};
const reason={behind:'تأخّرت عنها',deadline:'موعدها قريب',due:'مستحقة'} as const;
const period={daily:'يومي',weekly:'أسبوعي',monthly:'شهري'} as const;

const HOWTO_KEY='rabbani-coach-howto-v1';
const howTo=[
  {title:'ما هو المدرّب؟',text:'مساعد بسيط يرتّب لك ما تبدأ به اليوم وينبّهك مبكرًا إن انقطعت عن هدف. لا يغيّر خطتك من نفسه.'},
  {title:'كيف أفعّله؟',text:'من «المؤمن القوي» افتح بطاقة هدفك وفعّل مفتاح المدرّب. ولمهام المقرر فعّل المفتاح الذي في هذه الصفحة.'},
  {title:'ماذا أفعل كل يوم؟',text:'افتح مركز المهام. تحت «ابدأ من هنا» تجد ما يناسب اليوم. أنجز الخطوة ثم ارجع غدًا.'},
] as const;
function CoachHowTo(){
  const [open,setOpen]=useState(()=>{try{return localStorage.getItem(HOWTO_KEY)!=='1'}catch{return true}});
  const [i,setI]=useState(0);
  if(!open)return <button type="button" className="soft-btn" onClick={()=>{setI(0);setOpen(true)}}>كيف أستفيد من المدرّب؟</button>;
  const close=()=>{try{localStorage.setItem(HOWTO_KEY,'1')}catch{/* ignore */}setOpen(false)};
  const step=howTo[i];
  return <div className="goal-coach-card" role="group" aria-label="شرح المدرّب">
    <button type="button" className="icon-btn" aria-label="إغلاق الشرح" onClick={close} style={{float:'left'}}>✕</button>
    <strong>{step.title} ({(i+1).toLocaleString('ar-EG')}/{howTo.length.toLocaleString('ar-EG')})</strong>
    <p>{step.text}</p>
    <div className="counter-actions">
      <button type="button" className="soft-btn" disabled={i===0} onClick={()=>setI(i-1)}>السابق</button>
      {i<howTo.length-1?<button type="button" className="primary" onClick={()=>setI(i+1)}>التالي</button>:<button type="button" className="primary" onClick={close}>فهمت</button>}
    </div>
  </div>;
}

export default function CoachToday({goals,tasks,wirds=[],coach,onCoach}:Props){
  if(!coachEntitled())return null;
  const on=courseCoachOn(coach);
  const list=todayList(goals,tasks,coach,new Date(),wirds).slice(0,6);
  const warnings=courseSuggestions(coach);
  const anyGoal=goals.some(coachOn)||wirds.some(w=>w.coach?.enabled);
  return <section className="panel coach-today" aria-label="المدرّب اليوم">
    <CoachHowTo/>
    <label className="goal-coach-switch"><input type="checkbox" role="switch" aria-label="تفعيل المدرّب لمهام المقرر" checked={on} onChange={e=>onCoach(setCourseCoach(coach,e.target.checked))}/><Sparkles size={15}/><span>المدرّب لمهام المقرر</span></label>
    {!on&&!anyGoal&&<p className="muted small">يرتّب لك ما تبدأ به اليوم وينبّهك مبكرًا إن انقطعت. لا يغيّر خطتك. فعّله هنا لمهام المقرر، أو من بطاقة أي هدف.</p>}
    {on&&<p className="muted small">أنجزت {courseDaysDone(coach).toLocaleString('ar-EG')} من آخر ٧ أيام. يبدأ الحكم على الأسبوعي والشهري بعد تجمّع فترات كافية.</p>}
    {warnings.map(w=><div className="goal-coach-card" role="group" aria-label="اقتراح المدرّب" key={w.id}><p>{w.stepId==='course-month'?'مراجعة المقرر الشهرية':'مراجعة المقرر الأسبوعية'} تأخرت في الفترات الأخيرة. ابدأ بها اليوم قبل أن يتسع الفارق.</p><div className="goal-coach-actions"><button type="button" className="soft-btn" onClick={()=>coach&&onCoach(dismissCourse(coach,w.id))}>تمام</button></div></div>)}
    {list.length>0&&<><h2 className="coach-today-title">ابدأ من هنا</h2><ol className="coach-today-list">{list.map(item=><li key={`${item.source}-${item.stepId}`}><strong>{item.title}</strong><span className="muted small"> · {item.goalTitle} · {period[item.period]} · {reason[item.reason]}</span></li>)}</ol></>}
  </section>;
}
