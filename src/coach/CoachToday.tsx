import {Sparkles} from 'lucide-react';
import type {Task} from '../app-state';
import type {Goal} from '../goal-plan';
import {coachEntitled,coachOn} from './engine';
import {courseCoachOn,courseDaysDone,courseSuggestions,dismissCourse,setCourseCoach,todayList,type CourseCoach} from './course';

type Props={goals:Goal[];tasks:Task[];coach?:CourseCoach;onCoach:(coach:CourseCoach)=>void};
const reason={behind:'تأخّرت عنها',deadline:'موعدها قريب',due:'مستحقة'} as const;
const period={daily:'يومي',weekly:'أسبوعي',monthly:'شهري'} as const;

export default function CoachToday({goals,tasks,coach,onCoach}:Props){
  if(!coachEntitled())return null;
  const on=courseCoachOn(coach);
  const list=todayList(goals,tasks,coach).slice(0,6);
  const warnings=courseSuggestions(coach);
  const anyGoal=goals.some(coachOn);
  return <section className="panel coach-today" aria-label="المدرّب اليوم">
    <label className="goal-coach-switch"><input type="checkbox" role="switch" aria-label="تفعيل المدرّب لمهام المقرر" checked={on} onChange={e=>onCoach(setCourseCoach(coach,e.target.checked))}/><Sparkles size={15}/><span>المدرّب لمهام المقرر</span></label>
    {!on&&!anyGoal&&<p className="muted small">يرتّب لك ما تبدأ به اليوم وينبّهك مبكرًا إن انقطعت. لا يغيّر خطتك. فعّله هنا لمهام المقرر، أو من بطاقة أي هدف.</p>}
    {on&&<p className="muted small">أنجزت {courseDaysDone(coach).toLocaleString('ar-EG')} من آخر ٧ أيام. يبدأ الحكم على الأسبوعي والشهري بعد تجمّع فترات كافية.</p>}
    {warnings.map(w=><div className="goal-coach-card" role="group" aria-label="اقتراح المدرّب" key={w.id}><p>{w.stepId==='course-month'?'مراجعة المقرر الشهرية':'مراجعة المقرر الأسبوعية'} تأخرت في الفترات الأخيرة. ابدأ بها اليوم قبل أن يتسع الفارق.</p><div className="goal-coach-actions"><button type="button" className="soft-btn" onClick={()=>coach&&onCoach(dismissCourse(coach,w.id))}>تمام</button></div></div>)}
    {list.length>0&&<><h2 className="coach-today-title">ابدأ من هنا</h2><ol className="coach-today-list">{list.map(item=><li key={`${item.source}-${item.stepId}`}><strong>{item.title}</strong><span className="muted small"> · {item.goalTitle} · {period[item.period]} · {reason[item.reason]}</span></li>)}</ol></>}
  </section>;
}
