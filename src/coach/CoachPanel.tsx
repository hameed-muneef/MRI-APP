import {Sparkles} from 'lucide-react';
import {goalSteps,type Goal,type GoalPeriod} from '../goal-plan';
import {applyStepPeriod,coachEntitled,coachOn,dismissSuggestion,setCoach,suggestionsFor,weeklySummary,type Suggestion} from './engine';
import type {CoachSettings} from './types';

const label:Record<GoalPeriod,string>={daily:'يوميًا',weekly:'أسبوعيًا',monthly:'شهريًا',yearly:'سنويًا',custom:'تاريخ مخصص'};
type Props={goal:Goal;coachSettings?:CoachSettings;onChange:(goal:Goal)=>void};

function text(goal:Goal,s:Suggestion){
  const step=goalSteps(goal).find(x=>x.id===s.stepId);
  const name=step?`«${step.title}»`:'';
  if(s.kind==='lighten')return `خطوة ${name} تتعثر في الفترات الأخيرة. اقتراح: اجعلها ${label[s.to as GoalPeriod]} بدل ${label[step?.period??'daily']}.`;
  if(s.kind==='increase')return `ماشي كويس في خطوة ${name}. اقتراح: ارفع وتيرتها إلى ${label[s.to as GoalPeriod]}.`;
  if(s.kind==='early-warning')return `انقطعت عن خطوة ${name} في الفترات الأخيرة. ابدأ بها اليوم قبل أن يتسع الفارق.`;
  return 'اقترب موعد الهدف والالتزام بخطواته أقل من النصف. فكّر في تخفيف الخطوات أو تعديل الموعد.';
}

export default function CoachPanel({goal,coachSettings,onChange}:Props){
  if(!coachEntitled())return null;
  const globalOn=Boolean(coachSettings?.globalEnabled);
  const on=coachOn(goal,coachSettings);
  const now=new Date();
  const items=on?suggestionsFor(goal,now,coachSettings):[];
  const sum=on?weeklySummary(goal,now,coachSettings):null;
  const toggle=(checked:boolean)=>{
    if(globalOn)onChange(setCoach(goal,checked,now,checked?'inherit':'off'));
    else onChange(setCoach(goal,checked,now));
  };
  return <section className="goal-coach" aria-label={`مدرّب هدف ${goal.title}`}>
    <label className="goal-coach-switch"><input type="checkbox" role="switch" aria-label={`تفعيل المدرّب لهدف ${goal.title}`} checked={on} onChange={e=>toggle(e.target.checked)}/><Sparkles size={15}/><span>المدرّب لهذا الهدف</span>{globalOn&&!on&&<small className="muted">(مستثنى)</small>}</label>
    {!on&&<p className="muted small">{globalOn?'استثنيت هذا الهدف من التفعيل العام؛ أعد المفتاح لمتابعته.':'يقترح تعديل وتيرة خطواتك بحسب التزامك. لا يغيّر شيئًا إلا بموافقتك.'}</p>}
    {on&&sum&&<p className="small goal-coach-summary">{sum.rate===null?'لا توجد فترات منتهية كافية بعد. سيبدأ المدرّب بالاقتراح بعد أن يتجمع سجل.':`آخر أسبوع: ${sum.done.toLocaleString('ar-EG')} من ${sum.expected.toLocaleString('ar-EG')} فترة منجزة.`}</p>}
    {items.map(s=><div className="goal-coach-card" key={s.id} role="group" aria-label="اقتراح المدرّب"><p>{text(goal,s)}</p><div className="goal-coach-actions">{s.to&&s.stepId&&<button type="button" className="primary" onClick={()=>onChange(dismissSuggestion(applyStepPeriod(goal,s.stepId as string,s.to as 'daily'|'weekly'|'monthly'),s.id))}>أقبل</button>}<button type="button" className="soft-btn" onClick={()=>onChange(dismissSuggestion(goal,s.id))}>{s.to?'أبقها كما هي':'تمام'}</button></div></div>)}
  </section>;
}
