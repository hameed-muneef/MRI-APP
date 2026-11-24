import {describe,it,expect,vi,afterEach} from 'vitest';
import {createSeed,loadFromRaw,load} from './app-state';
import {storedStateSchema} from './state-schema';
import {importLocalBackup} from './local-backup';
import {nextDueDate,isDue} from './notifications/scheduler';
import {pickDueItems} from './notifications/engine';
import {DEFAULT_NOTIFICATION_PREFERENCE as prefs,type Reminder} from './notifications/types';
import {logRoutineCompletion} from './quran/learning';
import {periodKey} from './wird-periods';

const at=(day:number,hour=8)=>new Date(2026,10,day,hour);
const reminder=(recurrence:Reminder['recurrence'],config:Reminder['recurrence_config']={}):Reminder=>({id:'r',user_id:'',title:'Test',scheduled_at:at(23).toISOString(),recurrence,recurrence_config:config,enabled:true,category:'reminder',created_at:'',updated_at:''});
afterEach(()=>vi.unstubAllGlobals());
describe('deep local audit regressions',()=>{
 it.each(['daily','weekly','weekdays','weekday','monthly','custom','specific_dates'] as const)('%s never fires before its start date',recurrence=>{
  const next=nextDueDate(reminder(recurrence,{start_date:'2026-12-20',days_of_week:[0,1,2,3,4,5,6],specific_dates:['2026-11-24','2026-12-21']}),at(23,7));
  expect(next).not.toBeNull();expect(next!.getTime()).toBeGreaterThanOrEqual(new Date(2026,11,20,8).getTime());
 });
 it('also respects the original future date without explicit start config',()=>{expect(nextDueDate(reminder('daily'),at(1))?.getTime()).toBe(at(23).getTime())});
 it('invalid intervals cannot freeze the recurrence loop',()=>{expect(nextDueDate(reminder('custom',{interval_days:Infinity}),at(24))?.getTime()).toBe(at(25).getTime())});
 it('detects a one-off reminder at and just after the exact due time',()=>{expect(isDue(reminder('none'),at(23))).toBe(true);expect(isDue(reminder('none'),new Date(at(23).getTime()+30000))).toBe(true)});
 it('delivers within the documented catch-up windows and not twice',()=>{
  const r=reminder('none'), now=new Date(at(23).getTime()+30*60000);
  const due=pickDueItems([r],null,prefs,new Set(),now);expect(due).toHaveLength(1);
  expect(pickDueItems([r],null,prefs,new Set([due[0].key]),now)).toHaveLength(0);
  expect(pickDueItems([r],null,prefs,new Set(),new Date(at(23).getTime()+61*60000))).toHaveLength(0);
  expect(pickDueItems([],{'الفجر':'08:00'},prefs,new Set(),new Date(at(23).getTime()+5*60000)).some(x=>x.kind==='prayer')).toBe(true);
 });
 it('does not deliver the 9am review notification at 2am',()=>{
  const passage={id:'p',dueDate:'2026-11-23'} as never;
  expect(pickDueItems([],null,prefs,new Set(),at(23,2),[passage])).toHaveLength(0);
  expect(pickDueItems([],null,prefs,new Set(),at(23,9),[passage])).toHaveLength(1);
 });
 it('does not advance a second passage when a daily routine is checked twice',()=>{
  const state=createSeed().quran;
  const activity={id:'a',kind:'quran_memorization',slot:'any',days:[1],enabled:true,config:{},createdAt:'',updatedAt:''} as const;
  const once={...state,activityLog:[{activityId:'a',date:'2026-11-23',kind:'quran_memorization' as const}]};
  expect(logRoutineCompletion(once,activity as never,'2026-11-23')).toBe(once);
 });
 it('weekly wird keys do not change during a Sunday',()=>{
  expect(periodKey('weekly',new Date(2026,10,22,0,1))).toBe(periodKey('weekly',new Date(2026,10,22,23,59)));
 });
 it.each([{tasks:{}},{tasks:[null]},{goals:[{id:'g',steps:null}]},{quran:{routine:[{config:null}]}},{quran:{settings:null}},{dayRecords:{bad:{items:null}}},{taskSchedules:[]},{wirds:'bad'}])('rejects malformed nested state without crashing load: %j',bad=>{
  expect(storedStateSchema.safeParse(bad).success).toBe(false);
  expect(loadFromRaw(JSON.stringify(bad)).tasks.length).toBeGreaterThan(0);
 });
 it('loads complete current state and sparse legacy state',()=>{
  const seed=createSeed();expect(loadFromRaw(JSON.stringify(seed))).toEqual(seed);
  expect(loadFromRaw('{"tasks":[]}').tasks).toEqual([]);
 });
 it('handles storage access being denied at startup',()=>{vi.stubGlobal('localStorage',{getItem(){throw Error('denied')}});expect(load().tasks.length).toBeGreaterThan(0)});
 it('validates the entire backup before any writes',()=>{
  const setItem=vi.fn();vi.stubGlobal('window',{localStorage:{setItem}});
  const payload={app:'al-rabbaniyyun-local',version:1,storage:{'rabbani-theme-v1':'dark','rabbani-v1':JSON.stringify({quran:{passages:[null]}})}};
  expect(()=>importLocalBackup(JSON.stringify(payload))).toThrow();expect(setItem).not.toHaveBeenCalled();
 });
 it('rolls back earlier keys if import hits a quota error',()=>{
  const store=new Map([['rabbani-theme-v1','light']]);
  vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{if(k==='rabbani-v1')throw Error('quota');store.set(k,v)},removeItem:(k:string)=>store.delete(k)}});
  expect(()=>importLocalBackup(JSON.stringify({app:'al-rabbaniyyun-local',version:1,storage:{'rabbani-theme-v1':'dark','rabbani-v1':'{}'}}))).toThrow('quota');
  expect(store.get('rabbani-theme-v1')).toBe('light');expect(store.has('rabbani-v1')).toBe(false);
 });
});
