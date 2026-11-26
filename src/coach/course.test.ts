import {describe,expect,it} from 'vitest';
import type {Task} from '../app-state';
import {courseSuggestions,recordCourseCompletions,setCourseCoach,todayList,courseDaysDone,type CourseCoach} from './course';
import {finishedKeys} from './engine';
import {storedStateSchema} from '../state-schema';

const now=new Date('2026-11-26T10:00:00');
const plan=(id:string,kind:'day'|'week'|'month',extra:Partial<Task>={}):Task=>({id:`bilquran:p1:${id}`,title:`مهمة ${id}`,period:kind==='day'?'daily':kind==='week'?'weekly':'monthly',done:false,optional:false,sourceLabel:'x',plan:{planId:'p1',kind},...extra});
const coach=(extra:Partial<CourseCoach>={}):CourseCoach=>({enabled:true,enabledAt:'2026-09-01',dismissed:[],log:{},...extra});

describe('course coach',()=>{
  it('records nothing while off',()=>{const off=coach({enabled:false});expect(recordCourseCompletions(off,[plan('w','week',{done:true,doneKey:'2026-11-23',weekStart:'2026-11-23'})],now)).toBe(off);expect(recordCourseCompletions(undefined,[],now)).toBeUndefined()});
  it('records finished period keys once',()=>{
    const t=plan('w','week',{done:true,doneKey:'2026-11-23',weekStart:'2026-11-23'});
    const a=recordCourseCompletions(coach(),[t],now)!;expect(a.log?.week).toEqual(['2026-11-23']);
    expect(recordCourseCompletions(a,[t],now)).toBe(a);
  });
  it('ignores non-plan tasks and tasks not done in the current period',()=>{
    const stale=plan('w','week',{done:true,doneKey:'2026-11-16',weekStart:'2026-11-23'});
    const own:Task={id:'mine',title:'x',period:'weekly',done:true,optional:true,weekStart:'2026-11-23',doneKey:'2026-11-23'};
    const c=coach();expect(recordCourseCompletions(c,[stale,own],now)).toBe(c);
  });
  it('warns after two missed weeks, never judges daily tasks',()=>{
    const warn=courseSuggestions(coach({log:{week:finishedKeys('weekly',now,4).slice(2)}}),now);expect(warn.map(w=>w.kind)).toEqual(['early-warning','early-warning']);expect(warn.map(w=>w.stepId).sort()).toEqual(['course-month','course-week']);
    expect(courseSuggestions(coach({log:{day:[]}}),now).every(s=>s.stepId!=='course-day')).toBe(true);
    expect(courseSuggestions(coach({enabled:false}),now)).toEqual([]);
  });
  it('counts days done in the last 7',()=>{expect(courseDaysDone(coach({log:{day:[...finishedKeys('daily',now,3),'2026-01-01']}}),now)).toBe(3)});
  it('orders today across goals and course tasks, behind first',()=>{
    const goal={id:'g',title:'هدف',benefit:'',createdAt:'2026-09-01',coach:{enabled:true,enabledAt:'2026-09-01'},steps:[{id:'s',title:'خطوة',period:'daily' as const,done:{}}]};
    const tasks=[plan('d','day',{scheduledDate:'2026-11-26'}),plan('w','week',{weekStart:'2026-11-23'}),plan('x','week',{done:true,doneKey:'2026-11-23',weekStart:'2026-11-23'})];
    const list=todayList([goal],tasks,coach({log:{week:finishedKeys('weekly',now,4).slice(2)}}),now);
    expect(list.map(i=>i.source)).toContain('course');expect(list.find(i=>i.stepId==='bilquran:p1:x')).toBeUndefined();
    expect(list[0].reason).toBe('behind');
  });
  it('is empty when nothing is switched on',()=>{expect(todayList([],[plan('d','day')],undefined,now)).toEqual([])});
  it('schema accepts old state and a course coach',()=>{
    const base={tasks:[],goals:[],wirds:[],reflections:[],lessonStep:0,prayers:{}};
    expect(storedStateSchema.safeParse(base).success).toBe(true);
    const r=storedStateSchema.safeParse({...base,courseCoach:setCourseCoach(undefined,true,now)});expect(r.success).toBe(true);
    expect(JSON.stringify(r.success?r.data:{})).toContain('enabledAt');
  });
});
