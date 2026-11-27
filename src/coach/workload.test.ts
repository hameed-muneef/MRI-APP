import {describe,expect,it} from 'vitest';
import {allCoachMessageSamples} from './messages';
import {analyzeWorkload,defaultMinutes,TIGHT_SHARE} from './workload';
import {buildCoachHomeSummary,buildSmartTodayPlan} from './smart';
import type {Goal} from '../goal-plan';

const goalItem={source:'goal' as const,period:'daily' as const};

describe('workload (minutes, default durations)',()=>{
  it('uses fixed defaults per kind',()=>{
    expect(defaultMinutes(goalItem)).toBe(15);
    expect(defaultMinutes({source:'goal',period:'weekly'})).toBe(30);
    expect(defaultMinutes({source:'goal',period:'monthly'})).toBe(45);
    expect(defaultMinutes({source:'habit',period:'daily'})).toBe(10);
    expect(defaultMinutes({source:'course',period:'daily'})).toBe(30);
    expect(defaultMinutes({source:'course',period:'weekly'})).toBe(20);
  });
  it('ok when planned time fits comfortably',()=>{
    const w=analyzeWorkload({items:[goalItem,goalItem],freeMinutes:120,openCount:2,capacity:4});
    expect(w).toMatchObject({plannedMinutes:30,freeMinutes:120,level:'ok',exceedsCapacity:false,basis:'default'});
  });
  it('tight above the tight share, over above free time',()=>{
    const items=[goalItem,goalItem,goalItem,goalItem];
    expect(analyzeWorkload({items,freeMinutes:70,openCount:4,capacity:4}).level).toBe('tight');
    expect(analyzeWorkload({items,freeMinutes:59,openCount:4,capacity:4}).level).toBe('over');
    expect(60*TIGHT_SHARE).toBe(48);
  });
  it('no items is ok even without free time',()=>{
    expect(analyzeWorkload({items:[],freeMinutes:0,openCount:0,capacity:4}).level).toBe('ok');
  });
  it('flags exceeding the usual daily capacity by open count',()=>{
    expect(analyzeWorkload({items:[],freeMinutes:100,openCount:5,capacity:4}).exceedsCapacity).toBe(true);
    expect(analyzeWorkload({items:[],freeMinutes:100,openCount:4,capacity:4}).exceedsCapacity).toBe(false);
  });
  it('is deterministic and handles negative or fractional free minutes',()=>{
    const a=analyzeWorkload({items:[goalItem],freeMinutes:-5.4,openCount:1,capacity:4});
    expect(a).toEqual(analyzeWorkload({items:[goalItem],freeMinutes:-5.4,openCount:1,capacity:4}));
    expect(a.freeMinutes).toBe(0);
    expect(a.level).toBe('over');
  });
  it('workload messages are in the scanned catalog',()=>{
    const ids=allCoachMessageSamples().map(x=>x.id);
    for(const id of ['workloadOver','workloadTight','workloadOverCapacity','workloadNoHistory'])expect(ids).toContain(id);
  });
});

describe('workload in the smart plan',()=>{
  const prayers={'الفجر':'05:00','الشروق':'06:25','الظهر':'12:00','العصر':'15:15','المغرب':'17:35','العشاء':'19:00'};
  const mk=(n:number):Goal[]=>Array.from({length:n},(_,i)=>({id:`g${i}`,title:`هدف ${i}`,benefit:'م',createdAt:'2026-09-01',steps:[{id:`s${i}`,title:`خطوة ${i}`,period:'daily' as const,done:{}}]}));
  it('plan carries estimates and a workload status; late evening has little free time',()=>{
    const plan=buildSmartTodayPlan({goals:mk(4),tasks:[],prayers,coachSettings:{globalEnabled:true,enabledAt:'2026-11-01'},now:new Date('2026-11-26T21:00:00')});
    expect(plan.recommended.every(i=>i.estimatedMinutes>0)).toBe(true);
    expect(plan.workload.level).toBe('over');
    expect(plan.workload.freeMinutes).toBeLessThan(plan.workload.plannedMinutes);
  });
  it('morning with free slots is not over',()=>{
    const plan=buildSmartTodayPlan({goals:mk(2),tasks:[],prayers,coachSettings:{globalEnabled:true,enabledAt:'2026-11-01'},now:new Date('2026-11-26T05:30:00')});
    expect(plan.workload.level).toBe('ok');
  });
  it('home summary lines: top item and workload when over; none when coach is off',()=>{
    const on=buildCoachHomeSummary({goals:mk(4),tasks:[],prayers,coachSettings:{globalEnabled:true,enabledAt:'2026-11-01'},now:new Date('2026-11-26T21:00:00')});
    expect(on.detailLines.length).toBeGreaterThan(0);
    expect(on.detailLines.some(l=>l.includes('الوقت التقديري'))).toBe(true);
    for(const l of on.detailLines)expect(l).not.toMatch(/[?؟]/);
    const off=buildCoachHomeSummary({goals:mk(4),tasks:[],prayers,coachSettings:{globalEnabled:false,enabledAt:'2026-11-01',suggestionsMuted:true},now:new Date('2026-11-26T21:00:00')});
    expect(off.detailLines).toEqual([]);
  });
});
