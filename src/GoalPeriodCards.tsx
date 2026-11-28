import {useState} from 'react';
import {CalendarCheck,CalendarClock,CalendarDays,CalendarRange} from 'lucide-react';
import {goalPeriodKey,goalPeriodLabel,goalPeriods,goalStepCompleted,goalStepCompletionKey,goalSteps,stepsForPeriod,type Goal,type GoalPeriod} from './goal-plan';

type Props={goals:Goal[];onGoals:(goals:Goal[])=>void};
const config:Record<GoalPeriod,{tab:string;title:string;empty:string;icon:typeof CalendarDays}>={
  daily:{tab:'خطوات يومية',title:'خطوات اليوم',empty:'لا توجد خطوات يومية بعد.',icon:CalendarDays},
  weekly:{tab:'أسبوعية',title:'خطوات الأسبوع',empty:'لا توجد خطوات أسبوعية بعد.',icon:CalendarRange},
  monthly:{tab:'شهرية',title:'خطوات الشهر',empty:'لا توجد خطوات شهرية بعد.',icon:CalendarCheck},
  yearly:{tab:'سنوية',title:'خطوات السنة',empty:'لا توجد خطوات سنوية بعد.',icon:CalendarClock},
  custom:{tab:'خطوات محددة',title:'خطوات بتاريخ مخصص',empty:'لا توجد خطوات بموعد مخصص بعد.',icon:CalendarDays},
};

export default function GoalPeriodCards({goals,onGoals}:Props){
  const [selectedPeriod,setSelectedPeriod]=useState<GoalPeriod|null>(null);

  const toggle=(goalId:string,stepId:string,checked:boolean)=>{
    onGoals(goals.map(goal=>goal.id===goalId?{...goal,steps:goalSteps(goal).map(step=>step.id===stepId?{...step,done:{...step.done,[goalStepCompletionKey(step)]:checked}}:step)}:goal));
  };

  const counts=Object.fromEntries(
    goalPeriods.map(p=>[p,stepsForPeriod(goals,p)]),
  ) as Record<GoalPeriod,ReturnType<typeof stepsForPeriod>>;

  const firstActive=goalPeriods.find(p=>counts[p].length>0)??'daily';
  const period=selectedPeriod??firstActive;
  const entries=counts[period];
  const key=goalPeriodKey(period);
  const done=entries.filter(entry=>(period==='daily'||period==='custom')?goalStepCompleted(entry.step):entry.step.done[goalPeriodKey(period,new Date(),entry.step.customDate)]).length;
  const Icon=config[period].icon;

  return (
    <section className="goal-period-section" aria-label="خطوات الأهداف حسب الفترة">
      <div className="goal-period-tabs" role="tablist" aria-label="تصنيف الخطوات حسب الفترة">
        {goalPeriods.map(value=>{
          const total=counts[value].length;
          const active=period===value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              className={`goal-period-tab${active?' active':''}`}
              onClick={()=>setSelectedPeriod(value)}
            >
              <span>{config[value].tab}</span>
              {total>0&&<small>{total.toLocaleString('ar-EG')}</small>}
            </button>
          );
        })}
      </div>

      <article className={`goal-period-card goal-period-card-${period}`} role="tabpanel">
        <div className="goal-period-card-head">
          <span className="goal-period-icon"><Icon size={20}/></span>
          <div className="goal-period-title">
            <h3>{config[period].title}</h3>
            <small>{period==='custom'?'مواعيد فردية':goalPeriodLabel(period,key)}</small>
          </div>
          <span className="goal-period-count" aria-label={`${done} من ${entries.length} خطوات مكتملة`}>
            {done.toLocaleString('ar-EG')} <span>من</span> {entries.length.toLocaleString('ar-EG')}
          </span>
        </div>

        <div className="goal-period-card-list">
          {entries.length===0?(
            <p className="goal-period-empty">{config[period].empty}</p>
          ):(
            entries.map(({goalId,goalTitle,step})=>{
              const stepKey=goalPeriodKey(period,new Date(),step.customDate);
              const checked=goalStepCompleted(step)||!!step.done[stepKey];
              return (
                <label className="goal-period-item" key={`${goalId}:${step.id}`}>
                  <input
                    type="checkbox"
                    aria-label={`إنجاز ${step.title} ضمن ${config[period].title}`}
                    checked={checked}
                    disabled={(period==='daily'||period==='custom')&&checked}
                    onChange={event=>toggle(goalId,step.id,event.target.checked)}
                  />
                  <span>
                    <strong className={checked?'completed':''}>{step.title}</strong>
                    <small>
                      هدف: {goalTitle}
                      {period==='custom'&&step.customDate?` · موعد التنفيذ: ${new Intl.DateTimeFormat('ar-EG',{calendar:'gregory',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${step.customDate}T12:00:00`))}`:''}
                    </small>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </article>
    </section>
  );
}
