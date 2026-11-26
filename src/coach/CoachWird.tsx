import {Sparkles} from 'lucide-react';
import {applyHabitTarget,dismissHabit,habitOn,habitSuggestions,setHabitCoach,type HabitSuggestion,type WirdWithCoach} from './habit';
import {coachEntitled} from './engine';

type Props={wird:WirdWithCoach;onChange:(wird:WirdWithCoach)=>void};
const n=(v:number)=>v.toLocaleString('ar-EG');
const unit={daily:'اليومي',weekly:'الأسبوعي',monthly:'الشهري'} as const;
function text(w:WirdWithCoach,s:HabitSuggestion){
  if(s.kind==='early-warning')return `انقطعت عن «${w.title}» في الفترات الأخيرة. ابدأ به اليوم بما تستطيع.`;
  if(s.kind==='lighten-target')return `هدفك ${unit[w.period]} (${n(w.target)}) صعب عليك مؤخرًا. اقتراح تنظيمي: اجعله ${n(s.target as number)} لتثبت عليه.`;
  return `ثبتّ على هدفك ${unit[w.period]} (${n(w.target)}). اقتراح تنظيمي: ارفعه إلى ${n(s.target as number)} إن شئت.`;
}
/** Optional per-wird coach. Targets are organizational; the coach never treats a number as better in itself. */
export default function CoachWird({wird,onChange}:Props){
  if(!coachEntitled())return null;
  const on=habitOn(wird);const items=on?habitSuggestions(wird):[];
  return <div className="goal-coach" role="group" aria-label={`مدرّب ${wird.title}`}>
    <label className="goal-coach-switch"><input type="checkbox" role="switch" aria-label={`تفعيل المدرّب لورد ${wird.title}`} checked={on} onChange={e=>onChange(setHabitCoach(wird,e.target.checked))}/><Sparkles size={15}/><span>المدرّب</span></label>
    {items.map(s=><div className="goal-coach-card" role="group" aria-label="اقتراح المدرّب" key={s.id}><p>{text(wird,s)}</p><div className="goal-coach-actions">{s.target!==undefined&&<button type="button" className="primary" onClick={()=>onChange(dismissHabit(applyHabitTarget(wird,s.target as number),s.id))}>أقبل</button>}<button type="button" className="soft-btn" onClick={()=>onChange(dismissHabit(wird,s.id))}>{s.target!==undefined?'أبقه كما هو':'تمام'}</button></div></div>)}
  </div>;
}
