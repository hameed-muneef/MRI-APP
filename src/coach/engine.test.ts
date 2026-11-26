import {describe,expect,it} from 'vitest';
import {applyStepPeriod,dismissSuggestion,setCoach,startHere,stepAdherence,suggestionsFor,weeklySummary,finishedKeys} from './engine';
import {goalPeriodKey,type Goal,type GoalStep} from '../goal-plan';
import {storedStateSchema} from '../state-schema';

const now=new Date('2026-11-26T10:00:00');
const mk=(period:GoalStep['period'],doneKeys:string[],extra:Partial<Goal>={}):Goal=>({id:'g1',title:'هدف',benefit:'نية',createdAt:'2026-09-01',coach:{enabled:true,enabledAt:'2026-09-01'},steps:[{id:'s1',title:'خطوة',period,done:Object.fromEntries(doneKeys.map(k=>[k,true]))}],...extra});

describe('coach engine',()=>{
  it('excludes the running period',()=>{expect(finishedKeys('daily',now,2)).toEqual(['2026-11-25','2026-11-24'])});
  it('does nothing when the coach is off',()=>{const g=mk('daily',[]);g.coach={enabled:false,enabledAt:'2026-09-01'};expect(suggestionsFor(g,now)).toEqual([]);expect(startHere([g],now)).toEqual([])});
  it('says nothing without enough evidence',()=>{const g=mk('daily',[],{createdAt:'2026-11-22',coach:{enabled:true,enabledAt:'2026-11-22'}});expect(stepAdherence(g,g.steps![0],now)?.rate).toBeNull();expect(suggestionsFor(g,now).some(s=>s.kind==='lighten')).toBe(false)});
  it('suggests lightening a weak daily step and warns on a missed run',()=>{const kinds=suggestionsFor(mk('daily',['2026-11-10']),now);expect(kinds.map(s=>s.kind).sort()).toEqual(['early-warning','lighten']);expect(kinds.find(s=>s.kind==='lighten')?.to).toBe('weekly')});
  it('suggests an increase for a strong weekly step',()=>{const keys=Array.from({length:4},(_,i)=>finishedKeys('weekly',now,4)[i]);const s=suggestionsFor(mk('weekly',keys),now);expect(s.map(x=>x.kind)).toEqual(['increase']);expect(s[0].to).toBe('daily')});
  it('never touches yearly or custom steps',()=>{expect(suggestionsFor(mk('yearly',[]),now)).toEqual([]);expect(suggestionsFor(mk('custom',[]),now)).toEqual([])});
  it('accept keeps the log, keep hides the suggestion',()=>{const g=mk('daily',['2026-11-10']);const s=suggestionsFor(g,now).find(x=>x.kind==='lighten')!;const moved=applyStepPeriod(g,'s1','weekly');expect(moved.steps![0].done).toEqual(g.steps![0].done);const kept=dismissSuggestion(g,s.id);expect(suggestionsFor(kept,now).some(x=>x.id===s.id)).toBe(false)});
  it('flags deadline risk close to the target date',()=>{const g=mk('daily',['2026-11-10'],{targetDate:'2026-12-03'});expect(suggestionsFor(g,now).some(s=>s.kind==='deadline-risk')).toBe(true)});
  it('orders start-here: behind, then deadline, then due',()=>{const a=mk('daily',['2026-11-25','2026-11-24','2026-11-23']);a.id='a';const b=mk('daily',['2026-11-10']);b.id='b';const list=startHere([a,b],now);expect(list[0].goalId).toBe('b');expect(list[0].reason).toBe('behind')});
  it('summarises the last 7 days',()=>{const keys=finishedKeys('daily',now,7).slice(0,5);const s=weeklySummary(mk('daily',keys),now);expect(s).toMatchObject({done:5,expected:7})});
  it('setCoach is reversible and keeps dismissed',()=>{const g=setCoach(dismissSuggestion(mk('daily',[]),'x'),false,now);expect(g.coach).toMatchObject({enabled:false,dismissed:['x']})});
  it('state schema accepts old goals and goals with a coach',()=>{
    const base={tasks:[],goals:[{id:'1',title:'t',benefit:'b'}],wirds:[],reflections:[],lessonStep:0,prayers:{}};
    expect(storedStateSchema.safeParse(base).success).toBe(true);
    const withCoach={...base,goals:[{id:'1',title:'t',benefit:'b',coach:{enabled:true,enabledAt:'2026-11-26',dismissed:['a']}}]};
    const r=storedStateSchema.safeParse(withCoach);expect(r.success).toBe(true);
    expect(JSON.stringify(r.success?r.data:null)).toContain('enabledAt');
    expect(goalPeriodKey('daily',now)).toBe('2026-11-26');
  });
});
