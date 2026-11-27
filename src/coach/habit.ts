import type {Wird} from '../app-state';
import {periodKey as wirdPeriodKey} from '../wird-periods';
import {goalPeriodKey,type Goal} from '../goal-plan';
import {coachEntitled,INCREASE_AT,LIGHTEN_BELOW,stepAdherence,type CoachablePeriod} from './engine';
import {resolveCoachFlag,type CoachMode,type CoachSettings} from './types';

/**
 * Phase 3: habits and wirds (أوراد). A template with no end date: it learns from regularity only.
 * The wird keeps count/target per period and resets, so the coach keeps its own log of period keys
 * where the target was reached (engine key format), only after the user switches it on for that wird or globally.
 * Targets are the user's own organizational choice. The coach never says a number is better in itself.
 */
export type HabitCoach={enabled:boolean;enabledAt:string;dismissed?:string[];log?:string[];mode?:CoachMode};
export type HabitKind='early-warning'|'lighten-target'|'raise-target';
export type HabitSuggestion={id:string;kind:HabitKind;wirdId:string;target?:number};
const LOG_CAP=120;
const localDay=(now:Date)=>new Intl.DateTimeFormat('en-CA').format(now);
const warnRun={daily:3,weekly:2,monthly:2} as const;
const windowSize={daily:14,weekly:4,monthly:3} as const;

export type WirdWithCoach=Wird&{coach?:HabitCoach};
export const habitOn=(w:WirdWithCoach,settings?:CoachSettings)=>resolveCoachFlag(w.coach,settings)&&coachEntitled();

export function setHabitCoach(w:WirdWithCoach,enabled:boolean,now=new Date(),mode?:CoachMode):WirdWithCoach{
  return {...w,coach:{enabled,enabledAt:w.coach?.enabledAt??localDay(now),dismissed:w.coach?.dismissed??[],log:w.coach?.log??[],...(mode?{mode}:{})}};
}
export function dismissHabit(w:WirdWithCoach,id:string):WirdWithCoach{
  const c=w.coach??{enabled:true,enabledAt:localDay(new Date())};
  return {...w,coach:{...c,dismissed:[...(c.dismissed??[]).filter(x=>x!==id),id].slice(-60)}};
}
export const applyHabitTarget=(w:WirdWithCoach,target:number):WirdWithCoach=>({...w,target:Math.max(1,Math.round(target))});

/** Logs the current period when the target is reached. Returns the same array when nothing is new. */
export function recordHabitCompletions(wirds:WirdWithCoach[],now=new Date(),settings?:CoachSettings):WirdWithCoach[]{
  let changed=false;
  const next=wirds.map(w=>{
    // A stored count that belongs to an earlier period is not today's progress.
    if(!habitOn(w,settings)||w.target<1||w.periodKey!==wirdPeriodKey(w.period,now))return w;
    const key=goalPeriodKey(w.period,now);
    const activeCoach:HabitCoach=w.coach??{enabled:true,mode:'inherit',enabledAt:settings?.enabledAt??localDay(now),dismissed:[],log:[]};
    const log=activeCoach.log??[];
    const reached=w.count>=w.target;
    if(reached===log.includes(key))return w;
    changed=true;
    // Also undoes the key when the user corrects the count back below the target.
    return {...w,coach:{...activeCoach,log:(reached?[...log,key]:log.filter(k=>k!==key)).sort().slice(-LOG_CAP)}};
  });
  return changed?next:wirds;
}

/** The wird as a pseudo goal with one step, so the goal engine judges its regularity. */
export function habitGoal(w:WirdWithCoach,settings?:CoachSettings):Goal{
  const c=w.coach??{enabled:Boolean(settings?.globalEnabled),enabledAt:settings?.enabledAt??localDay(new Date()),log:[]};
  return {id:w.id,title:w.title,benefit:'',createdAt:c.enabledAt,coach:{enabled:habitOn(w,settings),enabledAt:c.enabledAt,mode:c.mode},
    steps:[{id:`habit-${w.id}`,title:w.title,period:w.period as CoachablePeriod,done:Object.fromEntries((c.log??[]).map(k=>[k,true]))}]};
}
export function habitSuggestions(w:WirdWithCoach,now=new Date(),settings?:CoachSettings):HabitSuggestion[]{
  if(!habitOn(w,settings))return [];
  const goal=habitGoal(w,settings);const a=stepAdherence(goal,goal.steps![0],now,settings);
  if(!a)return [];
  const stamp=goalPeriodKey(w.period,now);const out:HabitSuggestion[]=[];
  if(a.missedRun>=warnRun[a.period])out.push({id:`${w.id}:early-warning:${stamp}`,kind:'early-warning',wirdId:w.id});
  if(a.rate!==null&&a.rate<LIGHTEN_BELOW&&w.target>1)out.push({id:`${w.id}:lighten-target:${stamp}`,kind:'lighten-target',wirdId:w.id,target:Math.max(1,Math.ceil(w.target*0.75))});
  else if(a.rate!==null&&a.rate>=INCREASE_AT&&a.expected>=windowSize[a.period]-1)out.push({id:`${w.id}:raise-target:${stamp}`,kind:'raise-target',wirdId:w.id,target:Math.ceil(w.target*1.25)===w.target?w.target+1:Math.ceil(w.target*1.25)});
  return out.filter(s=>!w.coach?.dismissed?.includes(s.id));
}
export const habitBehind=(w:WirdWithCoach,now=new Date(),settings?:CoachSettings)=>habitSuggestions(w,now,settings).some(s=>s.kind==='early-warning');

export type WirdPace={period:Wird['period'];progress:number;elapsed:number;behind:boolean;enough:boolean};
const clampShare=(value:number)=>Math.max(0,Math.min(1,value));

/** نسبة ما مضى من الفترة الجارية (٠ إلى ١)، بنفس ترقيم مفاتيح فترات الورد. */
export function periodElapsedShare(period:Wird['period'],now:Date):number{
  if(period==='daily'){
    const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
    return clampShare((now.getTime()-start.getTime())/86400000);
  }
  if(period==='monthly'){
    const start=new Date(now.getFullYear(),now.getMonth(),1);
    const end=new Date(now.getFullYear(),now.getMonth()+1,1);
    return clampShare((now.getTime()-start.getTime())/(end.getTime()-start.getTime()));
  }
  // الأسبوعي: أسبوع السنة يبدأ من ١ يناير في periodKey نفسها.
  const jan1Utc=Date.UTC(now.getFullYear(),0,1);
  const todayUtc=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const daysSinceJan1=Math.floor((todayUtc-jan1Utc)/86400000);
  const week=Number(wirdPeriodKey('weekly',now).split('-W')[1]);
  const weekStartDay=(week-1)*7-new Date(jan1Utc).getUTCDay();
  return clampShare((daysSinceJan1-weekStartDay)/7);
}

/** تقدّم الورد مقابل ما مضى من فترته. عدّ الفترة السابقة لا يُحسب تقدّمًا لهذه الفترة. */
export function wirdPace(w:WirdWithCoach,now=new Date()):WirdPace{
  const target=Math.max(0,w.target);
  const current=w.periodKey===wirdPeriodKey(w.period,now);
  const progress=target>0?(current?clampShare(w.count/target):0):0;
  const elapsed=periodElapsedShare(w.period,now);
  return {period:w.period,progress,elapsed,behind:target>0&&elapsed>=0.2&&progress<elapsed-0.1,enough:target>0};
}

