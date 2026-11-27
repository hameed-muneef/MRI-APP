import {Sparkles} from 'lucide-react';
import {applyHabitTarget,dismissHabit,habitOn,habitSuggestions,setHabitCoach,type HabitSuggestion,type WirdPace,type WirdWithCoach} from './habit';
import {COACH_MESSAGES as M} from './messages';
import {coachEntitled} from './engine';
import type {CoachSettings} from './types';

type Props={wird:WirdWithCoach;coachSettings?:CoachSettings;onChange:(wird:WirdWithCoach)=>void};
const n=(v:number)=>v.toLocaleString('ar-EG');
const unit={daily:'اليومي',weekly:'الأسبوعي',monthly:'الشهري'} as const;
function text(w:WirdWithCoach,s:HabitSuggestion){
  if(s.kind==='early-warning')return `انقطعت عن «${w.title}» في الفترات الأخيرة. ابدأ به اليوم بما تستطيع.`;
  if(s.kind==='lighten-target')return `هدفك ${unit[w.period]} (${n(w.target)}) صعب عليك مؤخرًا. اقتراح تنظيمي: اجعله ${n(s.target as number)} لتثبت عليه.`;
  return `ثبتّ على هدفك ${unit[w.period]} (${n(w.target)}). اقتراح تنظيمي: ارفعه إلى ${n(s.target as number)} إن شئت.`;
}
/** سطر إيقاع الورد: نسبة ما مضى من الفترة مقابل نسبة ما أُنجز منها. */
const paceUnit={daily:'اليوم',weekly:'الأسبوع',monthly:'الشهر'} as const;
export function wirdPaceText(w:WirdWithCoach,pace:WirdPace):string{
  if(!pace.enough)return M.wirdPaceUnknown.text({});
  const line=M.wirdPaceLine.text({elapsed:Math.round(pace.elapsed*100),progress:Math.round(pace.progress*100),unit:paceUnit[w.period]});
  return `${line} ${pace.behind?M.wirdBehind.text({}):M.wirdOnTrack.text({})}`;
}

/** Optional per-wird coach. Targets are organizational; the coach never treats a number as better in itself. */
export default function CoachWird({wird,coachSettings,onChange}:Props){
  if(!coachEntitled())return null;
  const globalOn=Boolean(coachSettings?.globalEnabled);
  const on=habitOn(wird,coachSettings);
  const now=new Date();
  const items=on?habitSuggestions(wird,now,coachSettings):[];
  const toggle=(checked:boolean)=>{
    if(globalOn)onChange(setHabitCoach(wird,checked,now,checked?'inherit':'off'));
    else onChange(setHabitCoach(wird,checked,now));
  };
  return <div className="goal-coach" role="group" aria-label={`مدرّب ${wird.title}`}>
    <label className="goal-coach-switch"><input type="checkbox" role="switch" aria-label={`تفعيل المدرّب لورد ${wird.title}`} checked={on} onChange={e=>toggle(e.target.checked)}/><Sparkles size={15}/><span>المدرّب</span>{globalOn&&!on&&<small className="muted">(مستثنى)</small>}</label>
    {items.map(s=><div className="goal-coach-card" role="group" aria-label="اقتراح المدرّب" key={s.id}><p>{text(wird,s)}</p><div className="goal-coach-actions">{s.target!==undefined&&<button type="button" className="primary" onClick={()=>onChange(dismissHabit(applyHabitTarget(wird,s.target as number),s.id))}>أقبل</button>}<button type="button" className="soft-btn" onClick={()=>onChange(dismissHabit(wird,s.id))}>{s.target!==undefined?'أبقه كما هو':'تمام'}</button></div></div>)}
  </div>;
}
