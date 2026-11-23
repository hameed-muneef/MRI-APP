import {afterEach,describe,expect,it,vi} from 'vitest';
import {applyAssessment,buildMasteryPassages,createRecallAttempt,createSession} from './engine';
import {createEmptyMasteryState,loadMasteryState,saveMasteryState} from './storage';
import type {MasteryPlan} from './types';
let counter=0;const id=()=>`audit-${++counter}`;
afterEach(()=>vi.unstubAllGlobals());
describe('fresh comprehensive audit regressions',()=>{
 it('progressive recall starts visible and cannot grant unassisted evidence',()=>{
  const range={surah:1,ayahStart:1,ayahEnd:3};const s=createSession({purpose:'revision',passageId:'p',range,newId:id});
  const a={...createRecallAttempt({sessionId:s.id,range,hideMode:'D',newId:id}),completedAt:new Date().toISOString()};
  const root={...createEmptyMasteryState(),sessions:[s],recallAttempts:[a]};
  const out=applyAssessment(root,{passageId:'p',attemptId:a.id,label:'mastered',newId:id});
  expect(out.outcome.projection.evidence).toHaveLength(0);
  expect(out.outcome.schedule.intervalIndex).toBe(0);
 });
 it('orders a multi-surah journey globally, never interleaves chunks',()=>{
  const plan:MasteryPlan={id:'plan',title:'journey',range:{surah:1,ayahStart:1,ayahEnd:7},ranges:[{surah:1,ayahStart:1,ayahEnd:7},{surah:2,ayahStart:1,ayahEnd:7}],dailyTargetVerses:3,repeatPreset:3,status:'active',schemaVersion:1,createdAt:'',updatedAt:''};
  const chunks=buildMasteryPassages(plan,id);
  expect(chunks.map(p=>p.order)).toEqual([0,1,2,3,4,5]);
 });
 it('denied storage reads do not crash, writes never silently claim success',()=>{
  vi.stubGlobal('window',{get localStorage(){throw new DOMException('denied','SecurityError');}});
  expect(()=>loadMasteryState()).not.toThrow();
  expect(()=>saveMasteryState(createEmptyMasteryState())).toThrow();
 });
 it('unavailable storage cannot pretend to persist assessments',()=>{
  vi.stubGlobal('window',{});
  expect(()=>saveMasteryState(createEmptyMasteryState())).toThrow();
 });
});
it('a recall completed on an earlier day cannot become new spaced evidence after resume',()=>{
 const range={surah:1,ayahStart:1,ayahEnd:3};const s=createSession({purpose:'revision',passageId:'p',range,newId:id});
 const a={...createRecallAttempt({sessionId:s.id,range,hideMode:'E',newId:id}),completedAt:'2026-11-22T12:00:00Z'};
 const out=applyAssessment({...createEmptyMasteryState(),sessions:[s],recallAttempts:[a]},{passageId:'p',attemptId:a.id,label:'mastered',newId:id,now:new Date('2026-11-23T12:00:00Z')});
 expect(out.outcome.projection.evidence).toHaveLength(0);
});
it('a stale second window cannot overwrite a newly saved session',()=>{
 const values=new Map<string,string>();vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 const first=createEmptyMasteryState(),stale=createEmptyMasteryState();saveMasteryState(first);
 const next={...first,sessions:[createSession({purpose:'new',passageId:'p',range:{surah:1,ayahStart:1,ayahEnd:3},newId:id})]};
 saveMasteryState(next,first);expect(()=>saveMasteryState(stale,first)).toThrow();expect(loadMasteryState().sessions).toHaveLength(1);
});
it('corrupt or future-version data is never silently replaced with an empty root',()=>{
 const values=new Map([['rabbani-mastery-v1','{"schemaVersion":999,"private":"preserve"}']]);vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 const empty=loadMasteryState();expect(()=>saveMasteryState(empty,empty)).toThrow();expect(values.get('rabbani-mastery-v1')).toContain('preserve');
});
it('malformed schedule timezones are quarantined before the dashboard can crash',()=>{
 const root=createEmptyMasteryState();root.schedules=[{passageId:'p',dueDate:'2026-11-23',timezone:'not-a-zone',intervalIndex:0,lapses:0,deferrals:[],updatedAt:''}];
 const values=new Map([['rabbani-mastery-v1',JSON.stringify(root)]]);vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 expect(loadMasteryState().schedules).toEqual([]);expect(values.has('rabbani-mastery-v1:quarantine')).toBe(true);
});

it('invalid mastery backup is rejected before unrelated values are written',async()=>{
 const {importLocalBackup}=await import('../local-backup');
 const values=new Map([['rabbani-v1','keep']]);vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)}});
 expect(()=>importLocalBackup(JSON.stringify({app:'al-rabbaniyyun-local',version:1,storage:{'rabbani-theme-v1':'dark','rabbani-mastery-v1':'bad-json'}}))).toThrow();expect(values.has('rabbani-theme-v1')).toBe(false);expect(values.get('rabbani-v1')).toBe('keep');
});
