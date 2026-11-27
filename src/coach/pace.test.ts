import {describe,expect,it} from 'vitest';
import type {Goal} from '../goal-plan';
import {goalPace} from './engine';
import {periodElapsedShare,wirdPace,type WirdWithCoach} from './habit';

const now=new Date('2026-11-27T12:00:00');
const goal=(over:Partial<Goal>={},done:Record<string,boolean>={}):Goal=>({
  id:'g1',title:'هدف',benefit:'',createdAt:'2026-01-01',
  steps:[{id:'s1',title:'خطوة',period:'daily',done}],
  ...over,
});
const days=(keys:string[])=>Object.fromEntries(keys.map(k=>[k,true]));

describe('goal pace: recent periods against the ones before',()=>{
  it('reads a slowdown as behind',()=>{
    const older=['2026-11-19','2026-11-18','2026-11-17','2026-11-16','2026-11-15','2026-11-14','2026-11-13'];
    const pace=goalPace(goal({},days(older)),now);
    expect(pace.recent).toEqual({done:0,expected:7,rate:0});
    expect(pace.previous.expected).toBe(7);
    expect(pace.trend).toBe('down');
    expect(pace.behind).toBe(true);
  });
  it('reads a recovery as on track',()=>{
    const recent=['2026-11-26','2026-11-25','2026-11-24','2026-11-23','2026-11-22','2026-11-21','2026-11-20'];
    const older=['2026-11-19','2026-11-18'];
    const pace=goalPace(goal({},days([...recent,...older])),now);
    expect(pace.recent.done).toBe(7);
    expect(pace.trend).toBe('up');
    expect(pace.behind).toBe(false);
  });
  it('stays neutral when both windows are equal',()=>{
    const keys=['2026-11-26','2026-11-25','2026-11-24','2026-11-19','2026-11-18','2026-11-17'];
    expect(goalPace(goal({},days(keys)),now).trend).toBe('flat');
  });
  it('says nothing before enough periods have finished',()=>{
    const pace=goalPace(goal({createdAt:'2026-11-26'}),now);
    expect(pace.enough).toBe(false);
    expect(pace.trend).toBe(null);
    expect(pace.behind).toBe(false);
  });
  it('counts a goal with no coachable steps as empty',()=>{
    const pace=goalPace({id:'g',title:'t',benefit:'',createdAt:'2026-01-01',steps:[{id:'s',title:'x',period:'yearly',done:{}}]},now);
    expect(pace.steps).toBe(0);
    expect(pace.recent.expected).toBe(0);
  });
  it('does not claim a pace for monthly-only goals inside a 7-day window',()=>{
    const pace=goalPace({id:'g',title:'t',benefit:'',createdAt:'2026-01-01',steps:[{id:'s',title:'x',period:'monthly',done:{'2026-10':true}}]},now);
    expect(pace.steps).toBe(1);
    expect(pace.enough).toBe(false);
  });
  it('is deterministic',()=>{
    const g=goal({},days(['2026-11-26']));
    expect(goalPace(g,now)).toEqual(goalPace(g,now));
  });
});

describe('wird pace: progress against elapsed time',()=>{
  const daily=(over:Partial<WirdWithCoach>={}):WirdWithCoach=>({id:'w1',title:'ورد',target:100,count:20,period:'daily',periodKey:'2026-11-27',...over});

  it('is behind at midday with a fifth of the target',()=>{
    const pace=wirdPace(daily(),now);
    expect(pace.elapsed).toBeCloseTo(0.5,2);
    expect(pace.progress).toBeCloseTo(0.2,2);
    expect(pace.behind).toBe(true);
  });
  it('is on track once progress passes elapsed time',()=>{
    const pace=wirdPace(daily({count:70}),now);
    expect(pace.behind).toBe(false);
  });
  it('does not count a previous period as progress',()=>{
    const pace=wirdPace(daily({periodKey:'2026-11-26',count:100}),now);
    expect(pace.progress).toBe(0);
    expect(pace.behind).toBe(true);
  });
  it('never divides by a zero target',()=>{
    const pace=wirdPace(daily({target:0,count:5}),now);
    expect(pace.progress).toBe(0);
    expect(pace.enough).toBe(false);
    expect(pace.behind).toBe(false);
  });
  it('measures elapsed share inside the period for each cadence',()=>{
    expect(periodElapsedShare('daily',now)).toBeCloseTo(0.5,2);
    const weekly=periodElapsedShare('weekly',now);
    expect(weekly).toBeGreaterThanOrEqual(0);
    expect(weekly).toBeLessThanOrEqual(1);
    const monthly=periodElapsedShare('monthly',now);
    expect(monthly).toBeGreaterThan(0.8);
    expect(monthly).toBeLessThan(1);
  });
  it('is deterministic',()=>{
    expect(wirdPace(daily(),now)).toEqual(wirdPace(daily(),now));
  });
});
