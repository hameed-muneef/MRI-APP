import {describe,expect,it} from 'vitest';
import type {TaskSchedule} from '../app-state';
import type {Goal} from '../goal-plan';
import {buildSmartTodayPlan} from './smart';

const now=new Date('2026-11-26T08:00:00');
const prayers={'الفجر':'05:00','الشروق':'06:25','الظهر':'12:00','العصر':'15:15','المغرب':'17:35','العشاء':'19:00'};
const goal:Goal={id:'g1',title:'هدف',benefit:'منفعة',createdAt:'2026-09-01',steps:[{id:'s1',title:'خطوة',period:'daily',done:{}}]};
const settings={globalEnabled:true,enabledAt:'2026-11-01'};
const taskId='goal:g1:s1';
const plan=(taskSchedules:Record<string,TaskSchedule>)=>buildSmartTodayPlan({goals:[goal],tasks:[],prayers,taskSchedules,coachSettings:settings,now});
const sched=(date:string,time='09:00'):TaskSchedule=>({title:'خطوة',sourceLabel:'هدف',initialDate:date,initialTime:time,confirmedDate:date,confirmedTime:time});

describe('suggesting a time never replaces an existing schedule',()=>{
  it('unscheduled item gets a suggested slot and no scheduled date',()=>{
    const item=plan({}).recommended[0];
    expect(item.suggestedSlot).not.toBeNull();
    expect(item.scheduledDate).toBeUndefined();
  });
  it('item scheduled for tomorrow is marked and gets no suggested slot',()=>{
    const item=plan({[taskId]:sched('2026-11-27')}).recommended[0];
    expect(item.scheduledDate).toBe('2026-11-27');
    expect(item.suggestedSlot).toBeNull();
  });
  it('item scheduled for today keeps its time and gets no suggested slot',()=>{
    const item=plan({[taskId]:sched('2026-11-26','10:30')}).recommended[0];
    expect(item.scheduledTimeToday).toBe('10:30');
    expect(item.suggestedSlot).toBeNull();
  });
  it('a stale schedule from a past date does not block a new suggestion',()=>{
    const item=plan({[taskId]:sched('2026-11-20')}).recommended[0];
    expect(item.scheduledDate).toBeUndefined();
    expect(item.suggestedSlot).not.toBeNull();
  });
});
