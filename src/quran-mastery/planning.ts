import type {MasteryPlan,MasteryStateRoot,RevisionSchedule} from './types';
import {addDays,buildMasteryPassages} from './engine';
export const localDay=(now:Date,zone:string)=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);const get=(type:string)=>parts.find(p=>p.type===type)!.value;return `${get('year')}-${get('month')}-${get('day')}`;};
export function nextPlanDay(day:string,weekdays:number[]=[0,1,2,3,4,5,6]):string{
 if(!weekdays.length)throw new Error('اختر يومًا واحدًا على الأقل.');
 for(let i=0;i<8;i++){const d=addDays(day,i);if(weekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay()))return d;}
 throw new Error('أيام الخطة غير صالحة');
}
/** Only never-started future chunks can change. Attempt/session/projection IDs survive. */
export function reshapePlan(root:MasteryStateRoot,plan:MasteryPlan,id:()=>string,now=new Date()):MasteryStateRoot{
 if(!Number.isInteger(plan.dailyTargetVerses)||plan.dailyTargetVerses<1||plan.dailyTargetVerses>100)throw new Error('الهدف اليومي من ١ إلى ١٠٠ آية.');
 if(!plan.weekdays?.length)throw new Error('اختر أيام الخطة.');
 const keep=root.passages.filter(p=>p.planId!==plan.id||root.sessions.some(s=>s.passageId===p.id)||root.assessments.some(a=>a.passageId===p.id));
 const occupied=new Set(keep.filter(p=>p.planId===plan.id).flatMap(p=>Array.from({length:p.range.ayahEnd-p.range.ayahStart+1},(_,i)=>`${p.range.surah}:${p.range.ayahStart+i}`)));
 const future=buildMasteryPassages({...plan,dailyTargetVerses:1},id,now).filter(p=>!occupied.has(`${p.range.surah}:${p.range.ayahStart}`));
 const chunks:typeof future=[];const baseOrder=Math.max(-1,...keep.filter(p=>p.planId===plan.id).map(p=>p.order))+1;
 for(const p of future){const last=chunks[chunks.length-1];if(last&&last.range.surah===p.range.surah&&last.range.ayahEnd+1===p.range.ayahStart&&last.range.ayahEnd-last.range.ayahStart+1<plan.dailyTargetVerses)last.range.ayahEnd=p.range.ayahEnd;else chunks.push({...p,order:baseOrder+chunks.length});}
 return {...root,plans:[...root.plans.filter(p=>p.id!==plan.id),plan],passages:[...keep,...chunks],updatedAt:now.toISOString()};
}
export function revisionQueue(root:MasteryStateRoot,now=new Date()):RevisionSchedule[]{
 return root.schedules.filter(s=>{const p=root.plans.find(p=>p.id===root.passages.find(x=>x.id===s.passageId)?.planId);return p?.status!=='paused'&&s.dueDate<=localDay(now,s.timezone);}).sort((a,b)=>{
 const weak=(id:string)=>root.projections.find(p=>p.passageId===id)?.state==='needs_reinforcement'?0:1;
 return weak(a.passageId)-weak(b.passageId)||a.dueDate.localeCompare(b.dueDate);
 });
}
export function catchUpProposal(root:MasteryStateRoot,limit:number,now=new Date()){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw new Error('حد المراجعات من ١ إلى ٢٠');
 const slots=new Map<string,number>();
 // Future reviews consume capacity too. No date is changed until explicit apply.
 for(const s of root.schedules){const today=localDay(now,s.timezone);if(s.dueDate>today)slots.set(s.dueDate,(slots.get(s.dueDate)??0)+1);}
 return revisionQueue(root,now).map(s=>{const plan=root.plans.find(p=>p.id===root.passages.find(p=>p.id===s.passageId)?.planId);let date=nextPlanDay(localDay(now,s.timezone),plan?.weekdays);while((slots.get(date)??0)>=limit)date=nextPlanDay(addDays(date,1),plan?.weekdays);slots.set(date,(slots.get(date)??0)+1);return {passageId:s.passageId,from:s.dueDate,to:date};});
}
export function applyCatchUp(root:MasteryStateRoot,proposal:ReturnType<typeof catchUpProposal>,now=new Date()):MasteryStateRoot{
 return {...root,schedules:root.schedules.map(s=>{const item=proposal.find(p=>p.passageId===s.passageId);if(!item||item.from!==s.dueDate||item.to===s.dueDate)return s;return {...s,dueDate:item.to,deferrals:[...s.deferrals,{date:item.to,reason:`catch-up from ${item.from}`}],updatedAt:now.toISOString()};}),updatedAt:now.toISOString()};
}
/** Conservative overlap: weak overrides mastered, unassessed overlap cannot grant evidence. */
export function dashboard(root:MasteryStateRoot,now=new Date(),zone=Intl.DateTimeFormat().resolvedOptions().timeZone){
 const states=new Map<string,string>();const assessed=new Set(root.assessments.map(a=>a.passageId));
 for(const p of root.passages){if(!root.sessions.some(s=>s.passageId===p.id))continue;const state=root.projections.find(x=>x.passageId===p.id)?.state??'in_progress';for(let a=p.range.ayahStart;a<=p.range.ayahEnd;a++){const key=`${p.range.surah}:${a}`,old=states.get(key);if(!old||state==='needs_reinforcement'||(state==='mastered'&&old==='in_progress'))states.set(key,state);}}
 const count=(state:string)=>[...states.values()].filter(x=>x===state).length;
 const today=localDay(now,zone);const completed=root.sessions.filter(s=>s.completionReason==='completed'&&s.endedAt&&localDay(new Date(s.endedAt),zone)===today);
 const surahs=Array.from(new Set([...states.keys()].map(k=>Number(k.split(':')[0]))));
 return {started:states.size,assessedPassages:assessed.size,mastered:count('mastered'),weak:count('needs_reinforcement'),inProgress:count('in_progress'),surahs,completedToday:completed.length,due:revisionQueue(root,now).length,overdue:revisionQueue(root,now).filter(s=>s.dueDate<localDay(now,s.timezone)).length};
}

export function planNextDate(root:MasteryStateRoot,plan:MasteryPlan,now=new Date()):string{
 const zone=plan.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone;const today=localDay(now,zone);
 const ids=new Set(root.passages.filter(p=>p.planId===plan.id).map(p=>p.id));
 const todayVerses=new Set<string>();for(const session of root.sessions){if(session.purpose!=='new'||!ids.has(session.passageId)||localDay(new Date(session.startedAt),zone)!==today)continue;for(let a=session.range.ayahStart;a<=session.range.ayahEnd;a++)todayVerses.add(`${session.range.surah}:${a}`);}
 return nextPlanDay(todayVerses.size>=plan.dailyTargetVerses?addDays(today,1):today,plan.weekdays);
                                                                                                                               }
