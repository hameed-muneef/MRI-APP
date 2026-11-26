import type {Task} from '../app-state';
import {isPlanTask} from '../quran-mastery/plan-tasks';
import {isTaskDone} from '../task-periods';
import {finishedKeys,startHere,suggestionsFor,coachOn,type StartHere,type Suggestion} from './engine';
import type {Goal} from '../goal-plan';

/**
 * Phase 2: course tasks (plan tasks) join the same engine.
 * Plan tasks are generated and replaced each period, so they keep no history. The coach keeps its own
 * small log of finished period keys, only after the user switches it on.
 * Weekly and monthly tasks are judged like goal steps. Daily plan tasks are step-driven, not calendar-driven,
 * so they feed the daily "start here" order and a count, never a missed-day judgment.
 */
export type CourseKind='day'|'week'|'month';
export type CourseCoach={enabled:boolean;enabledAt:string;dismissed?:string[];log?:Partial<Record<CourseKind,string[]>>};
const LOG_CAP=120;
const localDay=(now:Date)=>new Intl.DateTimeFormat('en-CA').format(now);

export function setCourseCoach(coach:CourseCoach|undefined,enabled:boolean,now=new Date()):CourseCoach{
  return {enabled,enabledAt:coach?.enabledAt??localDay(now),dismissed:coach?.dismissed??[],log:coach?.log??{}};
}
/** Records the period keys of plan tasks that are done now. Returns the same object when nothing is new. */
export function recordCourseCompletions(coach:CourseCoach|undefined,tasks:Task[],now=new Date()):CourseCoach|undefined{
  if(!coach?.enabled)return coach;
  let changed=false;const log:Partial<Record<CourseKind,string[]>>={...coach.log};
  for(const task of tasks){
    if(!isPlanTask(task)||!task.plan||!task.doneKey||!isTaskDone(task,now))continue;
    const kind=task.plan.kind;const list=log[kind]??[];
    if(list.includes(task.doneKey))continue;
    log[kind]=[...list,task.doneKey].sort().slice(-LOG_CAP);changed=true;
  }
  return changed?{...coach,log}:coach;
}
const flag=(keys:string[]|undefined)=>Object.fromEntries((keys??[]).map(k=>[k,true]));
/** The course as a pseudo goal with one weekly and one monthly step, so the goal engine can judge it. */
export function courseGoal(coach:CourseCoach):Goal{
  return {id:'course',title:'مقرر الخطة',benefit:'',createdAt:coach.enabledAt,coach:{enabled:coach.enabled,enabledAt:coach.enabledAt,dismissed:coach.dismissed},
    steps:[{id:'course-week',title:'مراجعة ربط الأسبوع',period:'weekly',done:flag(coach.log?.week)},{id:'course-month',title:'مراجعة الشهر',period:'monthly',done:flag(coach.log?.month)}]};
}
/** Early warnings only. A fixed plan has no pace to lighten or raise, so those kinds are not offered here. */
export function courseSuggestions(coach:CourseCoach|undefined,now=new Date()):Suggestion[]{
  if(!coach?.enabled)return [];
  return suggestionsFor(courseGoal(coach),now).filter(s=>s.kind==='early-warning');
}
export function dismissCourse(coach:CourseCoach,id:string):CourseCoach{return {...coach,dismissed:[...(coach.dismissed??[]).filter(x=>x!==id),id].slice(-60)}}
export function courseDaysDone(coach:CourseCoach|undefined,now=new Date()):number{
  if(!coach?.enabled)return 0;
  const keys=new Set(finishedKeys('daily',now,7));
  return (coach.log?.day??[]).filter(k=>keys.has(k)).length;
}

export type TodayItem=StartHere&{source:'goal'|'course'};
/** One ordered list for the day across coach-enabled goals and open plan tasks. */
export function todayList(goals:Goal[],tasks:Task[],coach:CourseCoach|undefined,now=new Date()):TodayItem[]{
  const items:TodayItem[]=startHere(goals,now).map(i=>({...i,source:'goal'}));
  if(coach?.enabled){
    const behind=new Set(courseSuggestions(coach,now).map(s=>s.stepId));
    for(const task of tasks){
      if(!isPlanTask(task)||!task.plan||isTaskDone(task,now))continue;
      if(task.period!=='daily'&&task.period!=='weekly'&&task.period!=='monthly')continue;
      const isBehind=(task.plan.kind==='week'&&behind.has('course-week'))||(task.plan.kind==='month'&&behind.has('course-month'));
      items.push({goalId:'course',goalTitle:'مقرر الخطة',stepId:task.id,title:task.title,period:task.period,reason:isBehind?'behind':'due',source:'course'});
    }
  }
  const rank={behind:0,deadline:1,due:2} as const;
  const order={daily:0,weekly:1,monthly:2} as const;
  return items.map((it,i)=>({it,i})).sort((a,b)=>rank[a.it.reason]-rank[b.it.reason]||order[a.it.period]-order[b.it.period]||a.i-b.i).map(x=>x.it);
}
export const courseCoachOn=(coach:CourseCoach|undefined)=>Boolean(coach?.enabled)&&coachOn({id:'x',title:'',benefit:'',coach:{enabled:true,enabledAt:''}});
