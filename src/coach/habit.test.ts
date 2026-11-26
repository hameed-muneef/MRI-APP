import {describe,expect,it} from 'vitest';
import {applyHabitTarget,dismissHabit,habitSuggestions,recordHabitCompletions,setHabitCoach,type WirdWithCoach} from './habit';
import {periodKey} from '../wird-periods';
import {finishedKeys} from './engine';
import {storedStateSchema} from '../state-schema';
import {todayList} from './course';

const now=new Date('2026-11-26T10:00:00');
const wird=(extra:Partial<WirdWithCoach>={}):WirdWithCoach=>({id:'w1',title:'استغفار',target:100,count:0,period:'daily',periodKey:periodKey('daily',now),coach:{enabled:true,enabledAt:'2026-09-01',dismissed:[],log:[]},...extra});

describe('habit coach',()=>{
  it('logs nothing while off',()=>{const w=wird({count:100,coach:{enabled:false,enabledAt:'2026-09-01'}});const l=[w];expect(recordHabitCompletions(l,now)).toBe(l)});
  it('logs a reached target once and undoes it when the count is corrected',()=>{
    const l=[wird({count:100})];const a=recordHabitCompletions(l,now);expect(a[0].coach?.log).toEqual(['2026-11-26']);expect(recordHabitCompletions(a,now)).toBe(a);
    const b=recordHabitCompletions([{...a[0],count:99}],now);expect(b[0].coach?.log).toEqual([]);
  });
  it('ignores a stored count from an earlier period',()=>{const l=[wird({count:100,periodKey:'2026-11-25'})];expect(recordHabitCompletions(l,now)).toBe(l)});
  it('says nothing without enough history',()=>{expect(habitSuggestions(wird({coach:{enabled:true,enabledAt:'2026-11-24',log:[]}}),now)).toEqual([])});
  it('warns and suggests a lighter target after a weak stretch',()=>{
    const s=habitSuggestions(wird({coach:{enabled:true,enabledAt:'2026-09-01',log:['2026-11-10']}}),now);
    expect(s.map(x=>x.kind).sort()).toEqual(['early-warning','lighten-target']);expect(s.find(x=>x.kind==='lighten-target')?.target).toBe(75);
  });
  it('suggests a higher target after a steady stretch',()=>{
    const s=habitSuggestions(wird({coach:{enabled:true,enabledAt:'2026-09-01',log:finishedKeys('daily',now,14)}}),now);
    expect(s.map(x=>x.kind)).toEqual(['raise-target']);expect(s[0].target).toBe(125);
  });
  it('never lightens a target of 1, keeps it a whole number',()=>{expect(habitSuggestions(wird({target:1,coach:{enabled:true,enabledAt:'2026-09-01',log:[]}}),now).some(x=>x.kind==='lighten-target')).toBe(false);expect(applyHabitTarget(wird(),0.2).target).toBe(1)});
  it('keep hides the suggestion without touching the target',()=>{const w=wird({coach:{enabled:true,enabledAt:'2026-09-01',log:['2026-11-10']}});const s=habitSuggestions(w,now)[0];const k=dismissHabit(w,s.id);expect(k.target).toBe(100);expect(habitSuggestions(k,now).some(x=>x.id===s.id)).toBe(false)});
  it('switch is reversible and keeps the log',()=>{const w=setHabitCoach(wird({coach:{enabled:true,enabledAt:'2026-09-01',log:['a']}}),false,now);expect(w.coach).toMatchObject({enabled:false,log:['a']})});
  it('adds open coached wirds to the day list, behind first',()=>{
    const done=wird({id:'w2',count:100});const open=wird({coach:{enabled:true,enabledAt:'2026-09-01',log:['2026-11-10']}});const off=wird({id:'w3',coach:undefined});
    const list=todayList([],[],undefined,now,[done,open,off]);expect(list.map(i=>i.stepId)).toEqual(['w1']);expect(list[0]).toMatchObject({source:'habit',reason:'behind'});
  });
  it('schema accepts old wirds and a coach field',()=>{
    const base={tasks:[],goals:[],wirds:[{id:'1',title:'t',target:1,count:0,period:'daily',periodKey:'k'}],reflections:[],lessonStep:0,prayers:{}};
    expect(storedStateSchema.safeParse(base).success).toBe(true);
    const r=storedStateSchema.safeParse({...base,wirds:[{...base.wirds[0],coach:{enabled:true,enabledAt:'2026-11-26',log:['x']}}]});expect(r.success).toBe(true);expect(JSON.stringify(r.success?r.data:{})).toContain('enabledAt');
  });
});
