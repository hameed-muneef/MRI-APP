import {beforeEach,describe,expect,it,vi} from 'vitest';
import {advanceStage,applyAssessment,buildCumulativeLinkSequence,buildMasteryPassages,completePlayback,connectionChains,connectionWithPrevious,createRecallAttempt,createRepetitionEvent,createSession,formatCumulativePreview,groupCumulativeLinkSteps,interruptPlayback,interruptSession,resumeSession} from './engine';
import {createEmptyMasteryState,loadMasteryState,masteryRootSchema,saveMasteryState} from './storage';
import {MASTERY_STORAGE_KEY,type AssessmentLabel,type MasteryStateRoot} from './types';
import {hideVerse,initialHide,isHidden,revealAll,revealVerse} from './hide';
import {SessionRecorder,type RecorderDeps} from './recorder';
const range={surah:1,ayahStart:1,ayahEnd:3};let count=0;const id=()=>`id-${++count}`;
const session=()=>createSession({purpose:'new',passageId:'p',range,newId:id});
function rate(root:MasteryStateRoot,date:string,label:AssessmentLabel='mastered',help=false,selfReport=false){
 const s=session(),a={...createRecallAttempt({sessionId:s.id,range,hideMode:'E',newId:id}),completedAt:date,helpEvents:help?[{kind:'reveal_all' as const,at:date}]:[]};
 return applyAssessment({...root,sessions:[...root.sessions,s],recallAttempts:[...root.recallAttempts,a]},{passageId:'p',attemptId:a.id,label,newId:id,now:new Date(date),selfReport});
}
describe('mastery session engine',()=>{
 it('runs all six stages, completing never creates a projection',()=>{let s=session();const seen=[s.stage];for(let i=0;i<5;i++){s=advanceStage(s);seen.push(s.stage);}expect(seen).toEqual(['listen','understand','memorize','connect','recite','assess']);s=advanceStage(s);expect(s.completionReason).toBe('completed');expect(advanceStage(s)).toBe(s);expect(createEmptyMasteryState().projections).toEqual([]);});
 it('revision shares recite and assess, interruption resumes exact stage',()=>{const s={...session(),stage:'connect' as const};const stopped=interruptSession(s);const resumed=resumeSession(stopped,id);expect(resumed.stage).toBe('connect');expect(resumed.id).not.toBe(s.id);expect(stopped.completionReason).toBe('interrupted');expect(createSession({purpose:'revision',passageId:'p',range,newId:id}).stages).toEqual(['recite','assess']);});
 it('counts only completed playbacks, tracks interrupted separately',()=>{let e=createRepetitionEvent({sessionId:'s',scope:'passage',configured:20,newId:id});e=interruptPlayback(e);expect(e.completed).toBe(0);expect(e.interrupted).toBe(1);e=completePlayback(e);expect(e.completed).toBe(1);});
 it('builds progressive chains and adjacent previous connection without text',()=>{expect(connectionChains(range).map(r=>r.ayahEnd)).toEqual([1,2,3]);expect(connectionWithPrevious({...range,ayahStart:4,ayahEnd:6},range)).toEqual({...range,ayahEnd:6});expect(connectionWithPrevious({...range,surah:2},range).surah).toBe(2);});
 it('partitions plans without losing references',()=>{const p={id:'plan',title:'test',range:{...range,ayahEnd:7},dailyTargetVerses:3,repeatPreset:5,status:'active' as const,schemaVersion:1,createdAt:'',updatedAt:''};expect(buildMasteryPassages(p,id).map(p=>[p.range.ayahStart,p.range.ayahEnd])).toEqual([[1,3],[4,6],[7,7]]);});
});
describe('cumulative linking playback sequence',()=>{
 it('matches user example 1: ayahRepeat=1 plays 1, 2, 1-2, 3, 1-2-3',()=>{
  const verses=[1,2,3].map(a=>({s:1,a}));
  const seq=buildCumulativeLinkSequence(verses,1);
  expect(seq.map(x=>x.verse.a)).toEqual([1,2,1,2,3,1,2,3]);
  expect(seq.map(x=>x.phase)).toEqual(['solo','solo','link','link','solo','link','link','link']);
 });
 it('matches user example 2: ayahRepeat=2 plays 1,1 -> 2,2,1,2 -> 3,3,1,2,3 -> 4,4,1,2,3,4',()=>{
  const verses=[1,2,3,4].map(a=>({s:1,a}));
  const seq=buildCumulativeLinkSequence(verses,2);
  expect(seq.map(x=>x.verse.a)).toEqual([1,1,2,2,1,2,3,3,1,2,3,4,4,1,2,3,4]);
  expect(seq[0]).toMatchObject({phase:'solo',targetIndex:0,repeatIndex:1,repeatTotal:2});
  expect(seq[1]).toMatchObject({phase:'solo',targetIndex:0,repeatIndex:2,repeatTotal:2});
  expect(seq[4]).toMatchObject({phase:'link',targetIndex:1,linkFromAyah:1,linkToAyah:2});
  expect(seq[13]).toMatchObject({phase:'link',targetIndex:3,linkFromAyah:1,linkToAyah:4});
 });
 it('handles empty, single-verse, non-1 starting ayah, and multi-surah segments',()=>{
  expect(buildCumulativeLinkSequence([],3)).toEqual([]);
  expect(buildCumulativeLinkSequence([{s:112,a:1}],3).map(x=>[x.verse.a,x.phase])).toEqual([[1,'solo'],[1,'solo'],[1,'solo']]);
  const mid=buildCumulativeLinkSequence([{s:2,a:10},{s:2,a:11},{s:2,a:12}],2);
  expect(mid.map(x=>x.verse.a)).toEqual([10,10,11,11,10,11,12,12,10,11,12]);
  expect(mid[4]).toMatchObject({linkFromAyah:10,linkToAyah:11});
  const multi=buildCumulativeLinkSequence([{s:109,a:6},{s:110,a:1}],2);
  expect(multi.map(x=>`${x.verse.s}:${x.verse.a}`)).toEqual(['109:6','109:6','110:1','110:1','109:6','110:1']);
 });
 it('groups cumulative steps per target ayah and validates cumulative RepetitionEvent schema',()=>{
  const verses=[1,2,3].map(a=>({s:1,a}));
  const groups=groupCumulativeLinkSteps(verses,2);
  expect(groups.map(g=>g.map(x=>x.verse.a))).toEqual([[1,1],[2,2,1,2],[3,3,1,2,3]]);
  expect(formatCumulativePreview([1,2,3,4],2)).toContain('1، 1 ← 2، 2 ← ربط (1–2)');
  const root=createEmptyMasteryState();
  const ev=createRepetitionEvent({sessionId:'s1',scope:'cumulative',configured:2,newId:id,surah:1,ayah:2,groupRefs:['1:2','1:2','1:1','1:2']});
  expect(masteryRootSchema.safeParse({...root,repetitionEvents:[ev]}).success).toBe(true);
 });
});
describe('honest spaced evidence',()=>{
 it('first mastered self-rating does not grant mastery',()=>{const out=rate(createEmptyMasteryState(),'2026-11-23T12:00:00Z').outcome;expect(out.masteryGranted).toBe(false);expect(out.projection.state).toBe('in_progress');expect(out.projection.evidence).toHaveLength(1);});
 it('same-day retries never increase evidence or interval',()=>{const first=rate(createEmptyMasteryState(),'2026-11-23T12:00:00Z');const retry=rate(first.root,'2026-11-23T14:00:00Z');expect(retry.outcome.sameDayRetry).toBe(true);expect(retry.outcome.projection.evidence).toHaveLength(1);expect(retry.outcome.schedule.intervalIndex).toBe(1);expect(retry.outcome.masteryGranted).toBe(false);});
 it('requires due spaced recall through the ladder, resets on failure',()=>{let r=createEmptyMasteryState();for(const day of ['2026-11-23','2026-11-24','2026-11-27','2026-12-04','2026-12-18'])r=rate(r,`${day}T12:00:00Z`).root;expect(r.projections[0].state).toBe('mastered');expect(r.projections[0].evidence).toHaveLength(5);r=rate(r,'2026-12-19T12:00:00Z','not_mastered').root;expect(r.projections[0].state).toBe('needs_reinforcement');expect(r.projections[0].evidence).toHaveLength(0);expect(r.schedules[0].intervalIndex).toBe(0);});
 it('early retries, assisted recall and self-report cannot advance evidence',()=>{let r=rate(createEmptyMasteryState(),'2026-11-23T12:00:00Z').root;r=rate(r,'2026-11-24T12:00:00Z').root;const early=rate(r,'2026-11-25T12:00:00Z');expect(early.outcome.projection.evidence).toHaveLength(2);expect(rate(r,'2026-11-27T12:00:00Z','mastered',true).outcome.projection.evidence).toHaveLength(2);expect(rate(r,'2026-11-27T12:00:00Z','mastered',false,true).outcome.masteryGranted).toBe(false);});
 it('rejects missing or duplicate attempt links',()=>{expect(()=>applyAssessment(createEmptyMasteryState(),{passageId:'p',attemptId:'missing',label:'good',newId:id})).toThrow();const result=rate(createEmptyMasteryState(),'2026-11-23T12:00:00Z');expect(()=>applyAssessment(result.root,{passageId:'p',attemptId:result.outcome.assessment.attemptId,label:'mastered',newId:id})).toThrow();});
});
describe('visual-only hiding',()=>{for(const mode of ['A','B','D','E'] as const){it(`${mode} always offers individual and full reveal without source mutation`,()=>{const source=Object.freeze([{a:1,t:'source-1'},{a:2,t:'source-2'}]);const before=JSON.stringify(source);let s=initialHide(mode,[1,2]);s=hideVerse(s,1);s=revealVerse(s,[1,2],1);expect(isHidden(s,1)).toBe(false);s=revealAll(s,[1,2]);expect(isHidden(s,2)).toBe(false);expect(JSON.stringify(source)).toBe(before);});}});
describe('independent local repository',()=>{
 let data:Map<string,string>;
 beforeEach(()=>{data=new Map([['rabbani-v1','legacy-data']]);vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)}});});
 it('round trips one root and never touches legacy key',()=>{const root=createEmptyMasteryState();saveMasteryState(root);expect(loadMasteryState()).toEqual(root);expect(data.get('rabbani-v1')).toBe('legacy-data');expect(data.has(`${MASTERY_STORAGE_KEY}:pending`)).toBe(false);});
 it('preserves corrupt source in quarantine',()=>{data.set(MASTERY_STORAGE_KEY,'bad-json');expect(loadMasteryState().plans).toEqual([]);expect(data.get(`${MASTERY_STORAGE_KEY}:quarantine`)).toBe('bad-json');});
});
describe('recorder resource lifecycle',()=>{
 function fixture(delayed=false){let finish!:(s:{getTracks:()=>{stop:()=>void}[]})=>void;const track=vi.fn();const stream={getTracks:()=>[{stop:track}]};const media={mimeType:'audio/webm',ondataavailable:null as ((e:{data:Blob})=>void)|null,onstop:null as (()=>void)|null,start:vi.fn(),stop:vi.fn(()=>{media.ondataavailable?.({data:new Blob(['audio'])});media.onstop?.();})};let clock=100;let background=()=>{};const revoke=vi.fn();const deps:RecorderDeps={getUserMedia:()=>delayed?new Promise(resolve=>{finish=resolve;}):Promise.resolve(stream),createRecorder:()=>media,createObjectURL:()=> 'blob:test',revokeObjectURL:revoke,onBackground:fn=>{background=fn;return vi.fn();},now:()=>clock};return {recorder:new SessionRecorder(deps),track,media,revoke,advance:()=>{clock+=500;},background:()=>background(),finish:()=>finish(stream)};}
 it('stops tracks, saves only explicitly, keeps duration, revokes URLs',async()=>{const f=fixture();await f.recorder.start();f.advance();f.recorder.stop();expect(f.recorder.snapshot().status).toBe('stopped');expect(f.track).toHaveBeenCalled();const saved=f.recorder.saveToDevice(id);expect(saved?.meta.durationMs).toBe(500);expect(saved?.meta.retention).toBe('saved_local');expect(f.revoke).toHaveBeenCalledWith('blob:test');});
 it('discards on background even after recording stopped',async()=>{const f=fixture();await f.recorder.start();f.recorder.stop();f.background();expect(f.recorder.snapshot().url).toBe('');expect(f.recorder.saveToDevice(id)).toBe(null);expect(f.revoke).toHaveBeenCalled();});
 it('ignores permission results arriving after unmount',async()=>{const f=fixture(true);const pending=f.recorder.start();f.recorder.dispose();f.finish();await pending;expect(f.track).toHaveBeenCalled();expect(f.media.start).not.toHaveBeenCalled();});
 it('never creates a blob after unmount while recording',async()=>{const f=fixture();await f.recorder.start();f.recorder.dispose();expect(f.recorder.snapshot().url).toBe('');expect(f.track).toHaveBeenCalled();});
});
