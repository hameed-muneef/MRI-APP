import {goalPeriodKey,goalSteps,localGoalDate,type Goal,type GoalPeriod,type GoalStep} from '../goal-plan';
import {resolveCoachFlag,type CoachMode,type CoachSettings} from './types';

/** Paid features sit behind this one gate. Billing is not wired yet, so it stays open for review. */
export const coachEntitled=():boolean=>true;

export type CoachState={enabled:boolean;enabledAt:string;dismissed?:string[];mode?:CoachMode};
export type CoachablePeriod='daily'|'weekly'|'monthly';
export type SuggestionKind='lighten'|'increase'|'early-warning'|'deadline-risk';
export type Suggestion={id:string;kind:SuggestionKind;goalId:string;stepId?:string;to?:CoachablePeriod};
export type StepAdherence={stepId:string;period:CoachablePeriod;expected:number;done:number;rate:number|null;missedRun:number};

const ladder:CoachablePeriod[]=['daily','weekly','monthly'];
/** Periods looked at, and the least evidence needed before the coach says anything. */
const windowSize:Record<CoachablePeriod,number>={daily:14,weekly:4,monthly:3};
const minEvidence:Record<CoachablePeriod,number>={daily:7,weekly:3,monthly:2};
const warnRun:Record<CoachablePeriod,number>={daily:3,weekly:2,monthly:2};
export const LIGHTEN_BELOW=0.4;
export const INCREASE_AT=0.9;
const DISMISS_CAP=60;

export const isCoachable=(period:GoalPeriod):period is CoachablePeriod=>period==='daily'||period==='weekly'||period==='monthly';
export const coachOn=(goal:Goal,settings?:CoachSettings)=>resolveCoachFlag(goal.coach,settings)&&coachEntitled();

const parse=(key:string)=>new Date(`${key}T12:00:00`);
function shift(period:CoachablePeriod,now:Date,back:number){
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  if(period==='daily')d.setDate(d.getDate()-back);
  else if(period==='weekly')d.setDate(d.getDate()-7*back);
  else d.setMonth(d.getMonth()-back,1);
  return d;
}
/** Keys of the last finished periods, newest first. The running period is excluded: it is not missed yet. */
export function finishedKeys(period:CoachablePeriod,now:Date,count:number){
  return Array.from({length:count},(_,i)=>goalPeriodKey(period,shift(period,now,i+1)));
}
function periodStartDay(period:CoachablePeriod,key:string){return period==='monthly'?`${key}-01`:key}
/** A period counts only if it ended after the goal and coach began, and began before the target date. */
function inScope(goal:Goal,period:CoachablePeriod,key:string,settings?:CoachSettings){
  const enabledAt=goal.coach?.enabledAt??(settings?.globalEnabled?settings.enabledAt:undefined);
  const since=[goal.createdAt,enabledAt].filter(Boolean).sort().pop()??'';
  if(since&&periodStartDay(period,key)<since)return false;
  if(goal.targetDate&&periodStartDay(period,key)>goal.targetDate)return false;
  return true;
}

export function stepAdherence(goal:Goal,step:GoalStep,now=new Date(),settings?:CoachSettings):StepAdherence|null{
  if(!isCoachable(step.period))return null;
  const period=step.period;
  const keys=finishedKeys(period,now,windowSize[period]).filter(key=>inScope(goal,period,key,settings));
  const done=keys.filter(key=>step.done[key]).length;
  let missedRun=0;
  for(const key of keys){if(step.done[key])break;missedRun++}
  return {stepId:step.id,period,expected:keys.length,done,rate:keys.length>=minEvidence[period]?done/keys.length:null,missedRun};
}

const dismissedHas=(goal:Goal,id:string)=>Boolean(goal.coach?.dismissed?.includes(id));
const currentKey=(period:CoachablePeriod,now:Date)=>goalPeriodKey(period,now);

/** Suggestions only. Nothing here changes a plan. The user accepts or keeps each one. */
export function suggestionsFor(goal:Goal,now=new Date(),settings?:CoachSettings):Suggestion[]{
  if(!coachOn(goal,settings))return [];
  const out:Suggestion[]=[];
  const stats:StepAdherence[]=[];
  for(const step of goalSteps(goal)){
    const a=stepAdherence(goal,step,now,settings);
    if(!a)continue;
    stats.push(a);
    const at=ladder.indexOf(a.period);
    const stamp=currentKey(a.period,now);
    if(a.missedRun>=warnRun[a.period]){out.push({id:`${step.id}:early-warning:${stamp}`,kind:'early-warning',goalId:goal.id,stepId:step.id})}
    if(a.rate!==null&&a.rate<LIGHTEN_BELOW&&at<ladder.length-1){out.push({id:`${step.id}:lighten:${stamp}`,kind:'lighten',goalId:goal.id,stepId:step.id,to:ladder[at+1]})}
    else if(a.rate!==null&&a.rate>=INCREASE_AT&&at>0&&a.expected>=windowSize[a.period]-1){out.push({id:`${step.id}:increase:${stamp}`,kind:'increase',goalId:goal.id,stepId:step.id,to:ladder[at-1]})}
  }
  if(goal.targetDate){
    const days=Math.round((parse(goal.targetDate).getTime()-parse(localGoalDate(now)).getTime())/86400000);
    const rated=stats.filter(s=>s.rate!==null);
    const avg=rated.length?rated.reduce((n,s)=>n+(s.rate??0),0)/rated.length:null;
    if(days>=0&&days<=14&&avg!==null&&avg<0.5)out.push({id:`${goal.id}:deadline-risk:${goal.targetDate}`,kind:'deadline-risk',goalId:goal.id});
  }
  return out.filter(s=>!dismissedHas(goal,s.id));
}

/** Pure: the same goal with one step moved to a new period. Its log is kept. */
export function applyStepPeriod(goal:Goal,stepId:string,to:CoachablePeriod):Goal{
  return {...goal,steps:goalSteps(goal).map(step=>step.id===stepId?{...step,period:to,customDate:undefined}:step)};
}
export function dismissSuggestion(goal:Goal,id:string):Goal{
  const dismissed=[...(goal.coach?.dismissed??[]).filter(x=>x!==id),id].slice(-DISMISS_CAP);
  return {...goal,coach:{...(goal.coach??{}),enabled:goal.coach?.enabled??true,enabledAt:goal.coach?.enabledAt??localGoalDate(),dismissed}};
}
export function setCoach(goal:Goal,enabled:boolean,now=new Date(),mode?:CoachMode):Goal{
  const nextCoach:NonNullable<Goal['coach']>={
    enabled,
    enabledAt:goal.coach?.enabledAt??localGoalDate(now),
    dismissed:goal.coach?.dismissed??[],
    ...(mode?{mode}:{}),
  };
  return {...goal,coach:nextCoach};
}

export type StartHere={goalId:string;goalTitle:string;stepId:string;title:string;period:CoachablePeriod;reason:'behind'|'deadline'|'due'};
/** One ordered list for today: steps that slipped first, then nearest target date, then daily before weekly before monthly. */
export function startHere(goals:Goal[],now=new Date(),settings?:CoachSettings):StartHere[]{
  const items:(StartHere&{days:number})[]=[];
  for(const goal of goals){
    if(!coachOn(goal,settings))continue;
    const days=goal.targetDate?Math.round((parse(goal.targetDate).getTime()-parse(localGoalDate(now)).getTime())/86400000):9999;
    if(days<0)continue;
    for(const step of goalSteps(goal)){
      if(!isCoachable(step.period)||step.done[currentKey(step.period,now)])continue;
      const a=stepAdherence(goal,step,now,settings);
      const reason:StartHere['reason']=a&&a.missedRun>=warnRun[a.period]?'behind':days<=14?'deadline':'due';
      items.push({goalId:goal.id,goalTitle:goal.title,stepId:step.id,title:step.title,period:step.period,reason,days});
    }
  }
  const rank={behind:0,deadline:1,due:2} as const;
  return items.sort((a,b)=>rank[a.reason]-rank[b.reason]||a.days-b.days||ladder.indexOf(a.period)-ladder.indexOf(b.period)).map(({days:_d,...rest})=>rest);
}

export type CoachSummary={done:number;expected:number;rate:number|null;steps:number};
/** Summary of the last 7 days (daily steps by day, weekly by last finished week, monthly by last finished month). */
export function weeklySummary(goal:Goal,now=new Date(),settings?:CoachSettings):CoachSummary{
  let done=0,expected=0,steps=0;
  for(const step of goalSteps(goal)){
    if(!isCoachable(step.period))continue;
    const count=step.period==='daily'?7:1;
    const keys=finishedKeys(step.period,now,count).filter(key=>inScope(goal,step.period as CoachablePeriod,key,settings));
    if(!keys.length)continue;
    steps++;expected+=keys.length;done+=keys.filter(key=>step.done[key]).length;
  }
  return {done,expected,steps,rate:expected?done/expected:null};
}
