import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {QuranAsset} from '../../quran/types';
import {basmalaText,referenceLabel,showsBasmala,surahInfo,toArabicNumber,verseBody,verseMarker} from '../../quran/content';
import {uid} from '../../id';
import {deleteRecording,readRecording,saveRecording} from '../../quran-mastery/recording-store';
import type {AssessmentLabel,HideMode,MasterySession,MasteryStateRoot,RepetitionEvent,RepetitionScope,SessionPurpose,VerseRange} from '../../quran-mastery/types';
import {ASSESSMENT_LABELS,HIDE_MODES,MASTERY_SCHEMA_VERSION,MASTERY_STATES,REPETITION_PRESETS} from '../../quran-mastery/types';
import {advanceStage,applyAssessment,completePlayback,connectionChains,connectionWithPrevious,createRecallAttempt,createRepetitionEvent,createSession,dateKey,interruptPlayback,interruptSession,resumeSession,STAGE_LABELS} from '../../quran-mastery/engine';
import {loadMasteryState,saveMasteryState,masteryStorageIssue} from '../../quran-mastery/storage';
import {hiddenAriaLabel,hideVerse,initialHide,isHidden,revealAll,revealVerse} from '../../quran-mastery/hide';
import {createBrowserRecorder,type SessionRecorder} from '../../quran-mastery/recorder';
import {selectRange,SESSION_RECITERS} from '../../quran-mastery/services';
import {sessionAudio,SESSION_AUDIO_OWNER} from '../../quran/audio-adapter';
import {useBackgroundAudio} from '../../audio/useBackgroundAudio';
import UnderstandingSheet from './UnderstandingSheet';
import MasteryPlanning from './MasteryPlanning';
import MasteryOffline from './MasteryOffline';
import '../../quran-mastery/mastery.css';

type Props={asset:QuranAsset;purpose:SessionPurpose;notify:(text:string)=>void};
const upsert=<T extends {id:string}>(list:T[],item:T)=>[...list.filter(v=>v.id!==item.id),item];
export type LineStart=[number,number,number,number?];
export type PageWord={s:number;a:number;w:number;text:string;last:boolean;marker:string};
let pageLinesPromise:Promise<Record<string,LineStart[]>|null>|null=null;
// Madinah mushaf line breaks: Quran.com API v4 verses/by_page word line_number, compacted into /quran/mushaf-lines.json.
export const loadPageLines=()=>{pageLinesPromise??=fetch('/quran/mushaf-lines.json').then(r=>r.ok?r.json():null).then(j=>(j&&j.pages)||null).catch(()=>null);return pageLinesPromise;};
const verseTokens=(t:string)=>{const parts=t.replace(/\s*۝.*$/u,'').trim().split(/\s+/).filter(Boolean);const out:string[]=[];let pend='';for(const w of parts){if(!/\p{L}/u.test(w)){pend+=w+' ';continue;}out.push(pend+w);pend='';}if(pend&&out.length)out[out.length-1]+=' '+pend.trim();return out;};
export const buildPageLines=(asset:QuranAsset,starts:LineStart[]|undefined):PageWord[][]|null=>{
  if(!starts||starts.length<2)return null;
  const first=starts[0],end=starts[starts.length-1];
  const verses=asset.verses;const i0=verses.findIndex(v=>v.s===first[0]&&v.a===first[1]);if(i0<0)return null;
  const flat:PageWord[]=[];
  for(let i=i0;i<verses.length;i++){const v=verses[i];const toks=verseTokens(v.t);const isEnd=v.s===end[0]&&v.a===end[1];const from=i===i0?first[2]:0;const to=isEnd?end[2]:toks.length;
    if(to>toks.length||from>to)return null;
    for(let w=from;w<to;w++)flat.push({s:v.s,a:v.a,w,text:toks[w],last:w===toks.length-1,marker:verseMarker(v.t)||`۝${toArabicNumber(v.a)}`});
    if(isEnd)break;}
  const startKeys=new Set(starts.slice(0,-1).map(x=>`${x[0]}:${x[1]}:${x[2]}`));
  const lines:PageWord[][]=[];
  for(const word of flat){if(startKeys.has(`${word.s}:${word.a}:${word.w}`)||!lines.length)lines.push([]);lines[lines.length-1].push(word);}
  return lines.length===starts.length-1?lines:null;
};
export default function MasteryWorkspace({asset,purpose:initialPurpose,notify}:Props){
  const [purpose,setPurpose]=useState<SessionPurpose>(initialPurpose);
  useEffect(()=>setPurpose(initialPurpose),[initialPurpose]);
  const entryRef=useRef<HTMLElement>(null);
  const [root,setRoot]=useState(()=>loadMasteryState());
  const rootRef=useRef(root);
  const [storageError,setStorageError]=useState(()=>masteryStorageIssue());
  const [savedUrl,setSavedUrl]=useState('');
  useEffect(()=>()=>{if(savedUrl)URL.revokeObjectURL(savedUrl);},[savedUrl]);
  const commit=(fn:(r:MasteryStateRoot)=>MasteryStateRoot)=>{
    const next=fn(rootRef.current);
    try {saveMasteryState(next,rootRef.current);rootRef.current=next;setRoot(next);setStorageError('');return true;}
    catch (error) {setStorageError(`${error instanceof Error?error.message:'تعذر الحفظ على الجهاز.'} لم يُسجّل التغيير.`);return false;}
  };
  const [surah,setSurah]=useState(1),[from,setFrom]=useState(1),[to,setTo]=useState(3);
  const [activeId,setActiveId]=useState<string|null>(null);
  const [summary,setSummary]=useState('');
  const [celebrate,setCelebrate]=useState(false);
  const [validation,setValidation]=useState('');
  const active=root.sessions.find(s=>s.id===activeId);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{const heading=entryRef.current?.querySelector<HTMLElement>('h2');heading?.focus({preventScroll:true});entryRef.current?.scrollIntoView({block:'start',behavior:'auto'});});return()=>cancelAnimationFrame(frame);},[activeId]);
  const max=asset.surahs.find(s=>s.n===surah)?.ayahs??1;
  const open=(range:VerseRange,passageId?:string,resume?:MasterySession,sessionPurpose:SessionPurpose=purpose)=>{
    const now=new Date().toISOString();
    const id=passageId??uid();
    const session=resume?{...resumeSession(resume,uid),...(resume.stage==='assess'?{stage:'recite' as const}:{})}:createSession({purpose:sessionPurpose,passageId:id,range,newId:uid});
    const oldAttempt=resume?rootRef.current.recallAttempts.filter(a=>a.sessionId===resume.id).slice(-1)[0]:undefined;
    const continuedAttempt=oldAttempt?{...oldAttempt,id:uid(),sessionId:session.id,completedAt:undefined,createdAt:now}:undefined;
    const ok=commit(r=>({...r,recallAttempts:continuedAttempt?[...r.recallAttempts,continuedAttempt]:r.recallAttempts,passages:passageId?r.passages:[...r.passages,{id,range,order:0,schemaVersion:MASTERY_SCHEMA_VERSION,createdAt:now,updatedAt:now}],sessions:[...r.sessions,session],updatedAt:now}));
    if(ok){setActiveId(session.id);setSummary('');}
  };
  const create=()=>{
    const range={surah,ayahStart:from,ayahEnd:to};
    if(!selectRange(asset,range).length||from<1||to>max||to<from){setValidation(`اختر نطاقًا صحيحًا من ١ إلى ${toArabicNumber(max)}، والنهاية بعد البداية.`);return;}
    setValidation('');open(range);
  };
  // Interrupted records remain immutable; only the newest session per passage can be resumed.
  const latest=new Map<string,MasterySession>();
  root.sessions.forEach(s=>latest.set(s.passageId,s));
  const resumable=[...latest.values()].filter(s=>s.purpose===purpose&&(!s.endedAt||s.completionReason==='interrupted'));
  const finish=(message:string)=>{setActiveId(null);setSummary(message);setCelebrate(message.startsWith('أتممت الجلسة'));};
  if(active&&!active.endedAt)return <SessionPanel key={active.id} asset={asset} session={active} root={root} commit={commit} notify={notify} storageError={storageError} onClose={finish}/>;
  return <section ref={entryRef} className="qm-workspace" dir="rtl" aria-label="مصحف الحفظ والإتقان">
    <header className="qm-heading"><span className="qm-kicker">مصحف الحفظ والإتقان · محلي على جهازك</span><h2 tabIndex={-1}>{purpose==='new'?'ابدأ حفظك خطوة بخطوة':'راجع ما حفظته'}</h2><p>{purpose==='new'?'اختر آيات قليلة واضغط ابدأ الحفظ. سنرشدك في كل خطوة، ويمكنك التوقف والعودة لاحقًا.':'اختر مقطعًا لتسميعه من الذاكرة، أو افتح مراجعاتك المستحقة أدناه.'}</p></header>
    <nav className="qm-chips qm-purpose" aria-label="مسار الحفظ والمراجعة">
      <button aria-pressed={purpose==='new'} onClick={()=>setPurpose('new')}>حفظ جديد</button>
      <button aria-pressed={purpose==='revision'} onClick={()=>setPurpose('revision')}>مراجعة واسترجاع</button>
    </nav>
    {storageError&&<p role="alert" className="qm-error">{storageError}</p>}
    {summary&&<div className="qm-notice" role="status">{summary}</div>}
    {celebrate&&summary&&<div className="qm-done-backdrop" role="dialog" aria-modal="true" aria-label="تمت الجلسة"><div className="qm-done"><span className="qm-done-mark" aria-hidden="true">✓</span><h3>تمت الجلسة بحمد الله</h3><p>{summary}</p><button className="qm-primary" autoFocus onClick={()=>setCelebrate(false)}>تم بحمد الله</button></div></div>}
    {resumable.length>0&&<div className="qm-card"><h3>أكمل من حيث توقفت</h3>{resumable.map(s=><button className="qm-row" key={s.id} onClick={()=>{
      // Close a stale live record (e.g. after browser crash) before resuming.
      if(!s.endedAt&&!commit(r=>({...r,sessions:upsert(r.sessions,interruptSession(s))})))return;
      open(s.range,s.passageId,s);
    }}>{referenceLabel(asset,s.range.surah,s.range.ayahStart,s.range.ayahEnd)} · {STAGE_LABELS[s.stage]} <span>استئناف ←</span></button>)}</div>}
    <div className="qm-card"><h3>{summary?'جلسة أخرى (اختياري)':'١. اختر الآيات'}</h3><p className="qm-muted">ابدأ بمقطع صغير. اخترنا لك أول ثلاث آيات من الفاتحة، ويمكنك تغييرها.</p><div className="qm-fields">
      <label>السورة<select value={surah} onChange={e=>{setSurah(Number(e.target.value));setFrom(1);setTo(Math.min(3,asset.surahs.find(s=>s.n===Number(e.target.value))?.ayahs??1));}}>{asset.surahs.map(s=><option key={s.n} value={s.n}>{s.name}</option>)}</select></label>
      <label>من الآية<input type="number" min="1" max={max} value={from} onChange={e=>setFrom(Number(e.target.value))}/></label>
      <label>إلى الآية<input type="number" min={from} max={max} value={to} onChange={e=>setTo(Number(e.target.value))}/></label>
    </div>{validation&&<p role="alert" className="qm-error">{validation}</p>}<p>٢. {purpose==='new'?'ابدأ بالاستماع، ثم انتقل خطوة بخطوة.':'سمّع المقطع، ثم قيّم استرجاعك بنفسك.'}</p><button className="qm-primary" onClick={create}>ابدأ {purpose==='new'?'الحفظ':'الاسترجاع'}</button></div>
    <details className="qm-card qm-tools" open={purpose==='revision'?true:undefined}><summary>خططي ومراجعات اليوم والتقدم</summary><MasteryPlanning asset={asset} root={root} commit={commit} open={open}/></details>
    <MasteryOffline asset={asset}/>
    {root.recordings.length>0&&<div className="qm-card"><h3>تسجيلاتي الخاصة على الجهاز</h3><p>لا تُرفع التسجيلات. حذف بيانات المتصفح يحذفها أيضًا.</p>{root.recordings.map(meta=><div className="qm-passage" key={meta.id}><span>{new Date(meta.createdAt).toLocaleString('ar-EG')} · {Math.round(meta.durationMs/1000)} ثانية</span><button onClick={()=>void readRecording(meta.id).then(value=>{if(value)setSavedUrl(URL.createObjectURL(value.blob));else notify('ملف التسجيل غير موجود على هذا الجهاز.');}).catch(()=>notify('تعذر فتح التسجيل المحلي.'))}>استماع</button><button onClick={()=>void deleteRecording(meta.id).then(()=>{setSavedUrl('');commit(r=>({...r,recordings:r.recordings.filter(x=>x.id!==meta.id)}));}).catch(()=>notify('تعذر حذف التسجيل. أعد المحاولة.'))}>حذف التسجيل المحفوظ</button></div>)}{savedUrl&&<audio controls src={savedUrl} aria-label="تسجيل محفوظ محليًا"/>}</div>}
    {root.passages.length>0&&<div className="qm-card"><h3>مقاطعك وأدلة الإتقان</h3>{root.passages.map(p=>{
      const projection=root.projections.find(x=>x.passageId===p.id),schedule=root.schedules.find(x=>x.passageId===p.id);
      return <div className="qm-passage" key={p.id}><div><strong>{referenceLabel(asset,p.range.surah,p.range.ayahStart,p.range.ayahEnd)}</strong><p>{MASTERY_STATES.find(s=>s.value===projection?.state)?.label??'قيد الحفظ'}{schedule?` · المراجعة: ${schedule.dueDate}${schedule.dueDate<=dateKey()?' · مستحقة':''}`:''}</p><small>{projection?.evidence.length??0} دليل مُقيّم · {projection?.policyVersion??'mastery-v1'}</small></div><button onClick={()=>open(p.range,p.id,undefined,'revision')}>مراجعة المقطع</button></div>;
    })}</div>}
  </section>;
}

type SessionProps={asset:QuranAsset;session:MasterySession;root:MasteryStateRoot;commit:(fn:(r:MasteryStateRoot)=>MasteryStateRoot)=>boolean;notify:(s:string)=>void;storageError:string;onClose:(s:string)=>void};
function SessionPanel({asset,session,root,commit,notify,storageError,onClose}:SessionProps){
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{const heading=panelRef.current?.querySelector<HTMLElement>('h2');heading?.focus({preventScroll:true});panelRef.current?.scrollIntoView({block:'start',behavior:'auto'});});return()=>cancelAnimationFrame(frame);},[session.stage]);
  const sessionRef=useRef(session);sessionRef.current=session;
  const commitRef=useRef(commit);commitRef.current=commit;
  const verses=useMemo(()=>selectRange(asset,session.range),[asset,session.range]);
  const ayahs=verses.map(v=>v.a);
  const [hide,setHide]=useState(()=>initialHide(root.recallAttempts.filter(a=>a.sessionId===session.id).slice(-1)[0]?.hideMode??'B',ayahs));
  const [attemptId,setAttemptId]=useState<string|null>(()=>root.recallAttempts.filter(a=>a.sessionId===session.id) .slice(-1)[0]?.id??null);
  const plan=root.plans.find(p=>p.id===root.passages.find(p=>p.id===session.passageId)?.planId);
  const [repeat,setRepeat]=useState(plan?.repeatPreset??3),[scope,setScope]=useState<RepetitionScope>('verse'),[pause,setPause]=useState(0),[auto,setAuto]=useState(true),[reciter,setReciter]=useState(plan?.reciterId??7);
  const [chain,setChain]=useState(0),[connectPrevious,setConnectPrevious]=useState(false);
  const playerState=useBackgroundAudio();
  const [selectedAyah,setSelectedAyah]=useState(session.range.ayahStart);
  const [paused,setPaused]=useState(false),[speed,setSpeed]=useState(1);
  const pausedRef=useRef(false),pendingNext=useRef<(()=>void)|null>(null);
  const speedRef=useRef(speed);speedRef.current=speed;
  const [audioStatus,setAudioStatus]=useState('جاهز للاستماع'),[playing,setPlaying]=useState(false);
  const [recorderSnapshot,setRecorderSnapshot]=useState({status:'idle',url:'',mimeType:'',durationMs:0});
  const recorder=useRef<SessionRecorder|null>(null);
  const mounted=useRef(false);
  const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),eventRef=useRef<RepetitionEvent|null>(null),inFlight=useRef(false);
  const [completed,setCompleted]=useState(0);
  const [tally,setTally]=useState(0);
  const [pageIdx,setPageIdx]=useState(0);
  const [lineData,setLineData]=useState<Record<string,LineStart[]>|null>(null);
  const linesRef=useRef<HTMLDivElement>(null);
  const [playingAyah,setPlayingAyah]=useState<number|null>(null);
  const [recallDone,setRecallDone]=useState(false);
  const chains=connectionChains(session.range);
  const previous=root.sessions.filter(s=>s.completionReason==='completed'&&s.range.surah===session.range.surah&&s.range.ayahEnd+1===session.range.ayahStart) .slice(-1)[0];
  const connected=connectPrevious?connectionWithPrevious(session.range,previous?.range):chains[chain];
  const [showUnderstanding,setShowUnderstanding]=useState(false);
  const [understandingAyah,setUnderstandingAyah]=useState(session.range.ayahStart);
  const openUnderstanding=(ayah=session.range.ayahStart)=>{if(session.stage==='recite')reveal();setUnderstandingAyah(ayah);setShowUnderstanding(true);};
  const attempt=root.recallAttempts.find(a=>a.id===attemptId);
  
  const stopAudio=(interrupted=true)=>{
    pausedRef.current=false;setPaused(false);pendingNext.current=null;generation.current++; if(timer.current)clearTimeout(timer.current);timer.current=null;
    sessionAudio.cancel();
    if(interrupted&&eventRef.current&&(inFlight.current||playing)){const e=interruptPlayback(eventRef.current);eventRef.current=e;commitRef.current(r=>({...r,repetitionEvents:upsert(r.repetitionEvents,e)}));}
    inFlight.current=false;setPlaying(false);setPlayingAyah(null);
  };
  useEffect(()=>{
    mounted.current=true;
    recorder.current=createBrowserRecorder(()=>{const snap=recorder.current?.snapshot();if(snap)setRecorderSnapshot(snap);});
    const interrupt=()=>{stopAudio();recorder.current?.discard('background');const current=sessionRef.current;if(!current.endedAt)commitRef.current(r=>({...r,sessions:upsert(r.sessions,interruptSession(current))}));onClose('حُفظ موضع الجلسة للاستئناف. التسجيل المؤقت حُذف عند الخروج.');};
    const visibility=()=>{if(document.visibilityState==='hidden')interrupt();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',interrupt);
    return()=>{mounted.current=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',interrupt);stopAudio();recorder.current?.dispose();queueMicrotask(()=>{const current=sessionRef.current;if(!mounted.current&&!current.endedAt)commitRef.current(r=>({...r,sessions:upsert(r.sessions,interruptSession(current))}));});};
  // Instance owns resources for this one session only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const ensureAttempt=(mode:HideMode=hide.mode)=>{
    if(attemptId)return attemptId;
    const a=createRecallAttempt({sessionId:session.id,range:session.range,hideMode:mode,newId:uid});
    if(commit(r=>({...r,recallAttempts:[...r.recallAttempts,a]}))) {setAttemptId(a.id);return a.id;}return null;
  };
  const changeMode=(mode:HideMode)=>{
    stopAudio();
    const a=createRecallAttempt({sessionId:session.id,range:session.range,hideMode:mode,newId:uid});
    if(commit(r=>({...r,recallAttempts:[...r.recallAttempts,a]}))){setAttemptId(a.id);setHide(initialHide(mode,ayahs));setRecallDone(false);}
  };
  const reveal=(ayah?:number)=>{
    const id=ensureAttempt();if(!id)return;
    const next=ayah==null?revealAll(hide,ayahs):revealVerse(hide,ayahs,ayah);
    if(commit(r=>({...r,recallAttempts:r.recallAttempts.map(a=>a.id===id?{...a,helpEvents:[...a.helpEvents,{kind:ayah==null?'reveal_all':'reveal_verse',surah:session.range.surah,ayah,at:new Date().toISOString()}]}:a)})))setHide(next);
  };
  const cursor=useRef({group:0,verse:0,cycle:0});
  const playbackStart=useRef(selectedAyah);
  const selectedReciter=useRef(reciter);selectedReciter.current=reciter;
  const play=async(resume=false)=>{
    if(!resume)stopAudio();if(!resume){cursor.current={group:0,verse:0,cycle:0};playbackStart.current=scope==='passage'?session.range.ayahStart:selectedAyah;}const token=generation.current;setPlaying(true);if(!resume)setCompleted(0);setAudioStatus('جارٍ تجهيز التلاوة…');
    const range=session.stage==='connect'?connected:{...session.range,ayahStart:playbackStart.current};
    const selected=selectRange(asset,range);
    const groups=scope==='verse'?selected.map(v=>[v]):scope==='group'?Array.from({length:Math.ceil(selected.length/2)},(_,i)=>selected.slice(i*2,i*2+2)):[selected];
    let groupIndex=cursor.current.group,verseIndex=cursor.current.verse,cycle=cursor.current.cycle;
    const createEvent=()=>{const group=groups[groupIndex];const e=createRepetitionEvent({sessionId:session.id,scope,configured:repeat,newId:uid,surah:range.surah,ayah:scope==='verse'?group[0].a:undefined,groupRefs:group.map(v=>`${v.s}:${v.a}`),reciterId:selectedReciter.current});eventRef.current=e;return commit(r=>({...r,repetitionEvents:[...r.repetitionEvents,e]}));};
    if(!groups.length||groupIndex>=groups.length){stopAudio();return;}
    if(!resume||!eventRef.current){if(!createEvent()){stopAudio();return;}}else{const updated={...eventRef.current,reciterId:selectedReciter.current,reciterHistory:[...(eventRef.current.reciterHistory??[{reciterId:eventRef.current.reciterId??7,at:eventRef.current.createdAt,completedBefore:0}]),{reciterId:selectedReciter.current,at:new Date().toISOString(),completedBefore:eventRef.current.completed}]};eventRef.current=updated;commit(r=>({...r,repetitionEvents:upsert(r.repetitionEvents,updated)}));}
    const next=async():Promise<void>=>{
      if(token!==generation.current)return;
      const verse=groups[groupIndex][verseIndex];setPlayingAyah(verse.a);setSelectedAyah(verse.a);setAudioStatus(`الآية ${toArabicNumber(verse.a)} · تكرار ${toArabicNumber(cycle+1)} من ${toArabicNumber(repeat)}`);
      inFlight.current=true;
      const result=await sessionAudio.playVerse({reciterId:selectedReciter.current,surah:verse.s,ayah:verse.a,title:`${referenceLabel(asset,verse.s,verse.a,verse.a)}`,playbackRate:speedRef.current});
      if(token!==generation.current||result==='cancelled')return;
      inFlight.current=false;
      if(result==='missing'){setAudioStatus('الصوت غير متاح. أعد المحاولة أو تابع دون صوت؛ لم يُحسب تشغيل.');stopAudio();return;}
      if(result==='rejected-narration'){setAudioStatus('هذا القارئ غير متوافق مع نص حفص المعروض؛ لم يُستبدل بآخر ولم يُحسب تشغيل.');stopAudio();return;}
      if(result==='error'){setAudioStatus('تعذر تشغيل التلاوة. لم نتجاوز الآية ولم يُحسب تشغيل.');stopAudio();return;}
      if(result==='preempted'){setAudioStatus('توقف صوت الجلسة لأن تشغيلًا آخر بدأ أو أُوقف المشغّل. لم يُحسب تشغيل.');stopAudio();return;}
      // ended: تشغيل مكتمل واحد يُحسب فقط
      verseIndex++;
      if(verseIndex>=groups[groupIndex].length){verseIndex=0;cycle++;const e=completePlayback(eventRef.current!);eventRef.current=e;
        if(!commit(r=>({...r,repetitionEvents:upsert(r.repetitionEvents,e)}))){stopAudio(false);return;}setCompleted(cycle);
        if(cycle>=repeat){groupIndex++;cycle=0;if(groupIndex>=groups.length||!auto){setAudioStatus('اكتمل التكرار المحدد.');stopAudio(false);return;}if(!createEvent()){stopAudio(false);return;}}
      }
      cursor.current={group:groupIndex,verse:verseIndex,cycle};
      pendingNext.current=()=>{pendingNext.current=null;void next();};
      if(!pausedRef.current)timer.current=setTimeout(()=>pendingNext.current?.(),pause*1000);
    };
    void next();
  };
  useEffect(()=>{
    if(playerState.currentTrack?.meta?.owner!==SESSION_AUDIO_OWNER)return;
    if(playerState.status==='paused'){pausedRef.current=true;setPaused(true);}
    if(playerState.status==='playing'){pausedRef.current=false;setPaused(false);}
  },[playerState.status,playerState.currentTrack]);
  const togglePause=async()=>{
    try {if(pausedRef.current){pausedRef.current=false;setPaused(false);await sessionAudio.resume();pendingNext.current?.();}
    else {pausedRef.current=true;setPaused(true);if(timer.current){clearTimeout(timer.current);timer.current=null;}await sessionAudio.pause();}}catch{stopAudio();setAudioStatus('تعذر إيقاف أو استكمال الصوت. أعد التشغيل؛ لم يُحسب تكرار غير مكتمل.');}
  };
  const navigateAyah=(delta:number)=>{const next=Math.max(session.range.ayahStart,Math.min(session.range.ayahEnd,selectedAyah+delta));stopAudio();setSelectedAyah(next);setScope('verse');setCompleted(0);cursor.current={group:0,verse:0,cycle:0};eventRef.current=null;setAudioStatus(`الآية المحددة ${toArabicNumber(next)}. اضغط تشغيل؛ الانتقال لا يحسب تكرارًا.`);};
  const nextStage=()=>{
    stopAudio();setSelectedAyah(session.range.ayahStart);recorder.current?.discard('stage_change');
    const next=advanceStage(session);if(commit(r=>({...r,sessions:upsert(r.sessions,next)}))){sessionRef.current=next;if(next.stage==='connect')setScope('passage');if(next.stage==='recite'){const recallMode=hide.mode==='B'||hide.mode==='D'?'E':hide.mode;const a=createRecallAttempt({sessionId:session.id,range:session.range,hideMode:recallMode,newId:uid});if(commit(r=>({...r,recallAttempts:[...r.recallAttempts,a]})))setAttemptId(a.id);setHide(initialHide(recallMode,ayahs));}}
  };
  const finishRecall=()=>{
    stopAudio();const id=ensureAttempt();if(!id)return;
    if(commit(r=>({...r,recallAttempts:r.recallAttempts.map(a=>a.id===id?{...a,completedAt:new Date().toISOString()}:a),sessions:upsert(r.sessions,advanceStage(session))}))){sessionRef.current=advanceStage(session);setRecallDone(true);recorder.current?.stop();}
  };
  const assess=(label:AssessmentLabel)=>{
    if(!attemptId)return;
    let resultMessage='';
    const ok=commit(r=>{const result=applyAssessment(r,{passageId:session.passageId,attemptId,label,newId:uid});const closed=advanceStage(session);
      resultMessage=`أتممت الجلسة · تقييمك: ${ASSESSMENT_LABELS.find(x=>x.value===label)?.label}. الحالة: ${MASTERY_STATES.find(x=>x.value===result.outcome.projection.state)?.label}. المراجعة: ${result.outcome.schedule.dueDate}. ${result.outcome.sameDayRetry?'محاولة اليوم نفسها لا تزيد دليل الاحتفاظ.':''}`;
      return {...result.root,sessions:upsert(result.root.sessions,closed)};});
    if(ok){stopAudio();recorder.current?.dispose();onClose(resultMessage);}
  };
  const saveLocalRecording=async()=>{
    const saved=recorder.current?.recordingForSave(uid,session.passageId,session.id);if(!saved)return;
    try {
      await saveRecording(saved.blob,saved.meta);
      if(commit(r=>({...r,recordings:[...r.recordings,saved.meta],recallAttempts:r.recallAttempts.map(a=>a.id===attemptId?{...a,recordingId:saved.meta.id}:a)}))){recorder.current?.discard('saved');notify('حُفظ التسجيل على هذا الجهاز فقط في تسجيلاتي الخاصة.');}
      else await deleteRecording(saved.meta.id);
    } catch {notify('تعذر حفظ التسجيل على الجهاز. لم يُرفع أي صوت.');}
  };
  const masking=session.stage==='memorize'||session.stage==='recite';
  const playButtons=<span className="qm-chips">{playing&&<button onClick={()=>void togglePause()}>{paused?'استكمال من نفس الموضع':'إيقاف مؤقت'}</button>}{playing?<button onClick={()=>{stopAudio();setAudioStatus('توقف التشغيل. التشغيل غير المكتمل مسجل كمقطوع.');}}>إيقاف</button>:<button className="qm-primary" disabled={recorderSnapshot.status==='requesting'} onClick={()=>{if(session.stage==='recite'){reveal();recorder.current?.stop();}document.querySelectorAll<HTMLAudioElement>('audio').forEach(a=>a.pause());void play();}}>تشغيل التكرار</button>}</span>;
  const audioControls=['listen','memorize','connect','recite'].includes(session.stage)&&<div className="qm-card"><h3>التكرار الصوتي</h3>{session.stage==='recite'&&<p className="qm-notice">تشغيل القارئ للمقارنة مساعدة في هذه المحاولة، وليس دليل استرجاع مستقلًا.</p>}{playButtons}<details className="qm-audio-settings" open={session.stage==='listen'?true:undefined}><summary>إعدادات القارئ والتكرار (اختياري)</summary><div className="qm-fields"><label>القارئ<select aria-label="القارئ" value={reciter} onChange={e=>{const wasPlaying=playing;stopAudio();selectedReciter.current=Number(e.target.value);setReciter(selectedReciter.current);setAudioStatus('تم تغيير القارئ مع حفظ الآية والتكرارات المكتملة.');if(wasPlaying)void play(true);}}>{SESSION_RECITERS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>سرعة التشغيل<select aria-label="سرعة التشغيل" disabled={!sessionAudio.supportsPlaybackRate()} value={speed} onChange={e=>{const rate=Number(e.target.value);if(sessionAudio.setPlaybackRate(rate))setSpeed(rate);}}>{[.5,.75,1,1.25,1.5,2].map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select>{!sessionAudio.supportsPlaybackRate()&&<small>تغيير السرعة غير مدعوم في مشغل أندرويد الحالي؛ السرعة الأصلية ١×.</small>}</label><label>النطاق<select disabled={playing} value={scope} onChange={e=>setScope(e.target.value as RepetitionScope)}><option value="verse">كل آية</option><option value="group">مجموعة آيتين</option><option value="passage">المقطع كاملًا</option></select></label><label>مرات التكرار<input disabled={playing} type="number" min="1" max="100" value={repeat} onChange={e=>setRepeat(Math.max(1,Math.min(100,Math.round(Number(e.target.value))||1)))}/></label><label>وقفة بين الآيات (ثوانٍ)<input disabled={playing} type="number" min="0" max="30" value={pause} onChange={e=>setPause(Math.max(0,Math.min(30,Number(e.target.value)||0)))}/></label></div><div className="qm-chips">{REPETITION_PRESETS.map(n=><button disabled={playing} aria-pressed={repeat===n} key={n} onClick={()=>setRepeat(n)}>{toArabicNumber(n)}</button>)}</div><label className="qm-check"><input type="checkbox" checked={auto} disabled={playing} onChange={e=>setAuto(e.target.checked)}/>انتقال تلقائي للمجموعة التالية</label></details><p role="status">{audioStatus}</p><p className="qm-muted">المكتمل في النطاق الحالي: {toArabicNumber(completed)}. لا يُحسب التشغيل المقطوع. الصوت يحتاج اتصالًا ما لم يوفّره مخزن المتصفح.</p>{session.stage!=='connect'&&<div className="qm-chips"><button disabled={selectedAyah<=session.range.ayahStart} onClick={()=>navigateAyah(-1)}>الآية السابقة</button><span>الآية المحددة: {toArabicNumber(selectedAyah)}</span><button disabled={selectedAyah>=session.range.ayahEnd} onClick={()=>navigateAyah(1)}>الآية التالية</button></div>}</div>;
  const displayedRange=session.stage==='connect'?connected:session.range;
  const displayedVerses=session.stage==='connect'?selectRange(asset,connected):verses;
  const basmala=basmalaText(asset);
  const pageNums=[...new Set(displayedVerses.map(v=>v.p))];
  const activePage=pageNums[Math.min(pageIdx,Math.max(0,pageNums.length-1))];
  const rangeKeys=new Set(displayedVerses.map(v=>`${v.s}:${v.a}`));
  const pageVerses=activePage==null?displayedVerses:asset.verses.filter(v=>v.p===activePage);
  useEffect(()=>{let live=true;void loadPageLines().then(d=>{if(live)setLineData(d);});return()=>{live=false;};},[]);
  const pageLines=useMemo(()=>activePage==null||!lineData?null:buildPageLines(asset,lineData[String(activePage)]),[asset,lineData,activePage]);
  useLayoutEffect(()=>{const box=linesRef.current;if(!box)return;const fit=()=>{const host=box.parentElement;if(!host)return;let fs=24;box.style.fontSize=`${fs}px`;const over=()=>box.scrollWidth>host.clientWidth+1;while(over()&&fs>15){fs-=0.5;box.style.fontSize=`${fs}px`;}};fit();const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(fit):null;ro?.observe(box);void document.fonts?.ready.then(fit);return()=>ro?.disconnect();},[pageLines,activePage]);
  useEffect(()=>{if(session.stage==='assess')return;const t=setTimeout(()=>{panelRef.current?.querySelector<HTMLElement>('.qm-verse-inline:not(.qm-verse-context)')?.scrollIntoView({block:'center',behavior:'auto'});},120);return()=>clearTimeout(t);},[activePage,session.stage==='assess']);
  return <section ref={panelRef} className="qm-workspace" dir="rtl" aria-label="جلسة الحفظ والإتقان">
    <header className="qm-heading"><button onClick={()=>{stopAudio();recorder.current?.discard('exit');const interrupted=interruptSession(session);if(commit(r=>({...r,sessions:upsert(r.sessions,interrupted)}))){sessionRef.current=interrupted;onClose('حُفظت مرحلة الجلسة. يمكنك استئنافها لاحقًا.');}}}>رجوع وحفظ الموضع</button><span className="qm-kicker">{session.purpose==='new'?'حفظ جديد':'مراجعة'} · {referenceLabel(asset,session.range.surah,session.range.ayahStart,session.range.ayahEnd)}</span><h2 tabIndex={-1}>{session.stage==='recite'?'سمّع من ذاكرتك':STAGE_LABELS[session.stage]}</h2><div className="qm-journey-steps"><ol className="qm-steps" aria-label="مراحل الجلسة">{session.stages.map((stage,i)=><li key={stage} aria-current={stage===session.stage?'step':undefined}><span>{toArabicNumber(i+1)}</span>{STAGE_LABELS[stage]}</li>)}</ol></div></header>
    <p className="qm-notice qm-guidance" role="status"><strong>الخطوة {toArabicNumber(session.stages.indexOf(session.stage)+1)} من {toArabicNumber(session.stages.length)}</strong><br/>{({listen:'الآيات أمامك كاملة. اضبط التكرار هنا ثم استمع. بعدها انتقل إلى الفهم.',understand:'اقرأ الآيات وافتح فهم الآية عند الحاجة. ثم انتقل إلى الحفظ.',memorize:'اقرأ الآيات وكررها، ثم أخفها وجرب استرجاعها. يمكنك إظهارها في أي وقت.',connect:'اقرأ الآيات متصلة. ابدأ بآية ثم أضف التالية حتى يترابط المقطع.',recite:'سمّع من ذاكرتك. الآيات مخفية لمحاولة بلا مساعدة، ويمكنك إظهارها عند الحاجة وتُسجَّل المساعدة. التسجيل اختياري. بعد المحاولة انتقل للتقييم.',assess:'اختر الوصف الأقرب لاسترجاعك. هذا تقييمك الذاتي وليس تصحيحًا آليًا.'})[session.stage]}</p>
    {session.stage==='listen'&&<div className="qm-listen-quick"><span>استمع للمقطع:</span>{playButtons}</div>}
    {storageError&&<p role="alert" className="qm-error">{storageError}</p>}
    {session.stage!=='assess'&&<div className="qm-verses"><article className="qm-card qm-mushaf-card">{activePage!=null&&<div className="qm-page-bar"><span>صفحة {toArabicNumber(activePage)} من المصحف</span>{pageNums.length>1&&<span className="qm-page-nav"><button aria-label="الصفحة السابقة" disabled={pageIdx<=0} onClick={()=>setPageIdx(i=>Math.max(0,i-1))}>‹</button><button aria-label="الصفحة التالية" disabled={pageIdx>=pageNums.length-1} onClick={()=>setPageIdx(i=>Math.min(pageNums.length-1,i+1))}>›</button></span>}</div>}{playingAyah!==null&&<div className="qm-current-verse qm-playing-banner" aria-current="true"><span>الآية الحالية: {referenceLabel(asset,session.range.surah,playingAyah)}</span></div>}{!pageLines&&showsBasmala(displayedRange.surah)&&displayedRange.ayahStart===1&&basmala&&<p className="qm-basmala" dir="rtl">{basmala}</p>}{pageLines?<div className="qm-lines-scroll" dir="rtl"><div className="qm-lines" dir="rtl" ref={linesRef}>{pageLines.map((line,li)=>{const f=line[0];const lastW=line[line.length-1];const surahEnd=lastW.last&&lastW.a===(surahInfo(asset,lastW.s)?.ayahs??-1);const head=f.a===1&&f.w===0;return <div key={li} className="qm-line-wrap">{head&&<div className="qm-surah-head"><span className="mf-surah-band-inner">سُورَةُ {surahInfo(asset,f.s)?.name??''}</span></div>}{head&&showsBasmala(f.s)&&basmala&&<div className="qm-basmala-line">{basmala}</div>}<div className={`qm-line${surahEnd||activePage===1?' qm-line-center':''}`}>{line.map(word=>{const inRange=rangeKeys.has(`${word.s}:${word.a}`);const hidden=inRange&&masking&&isHidden(hide,word.a);const playingThis=playingAyah===word.a&&inRange;const selected=selectedAyah===word.a&&playingAyah===null&&inRange;return <span key={`${word.a}:${word.w}`} className={`qm-w${inRange?'':' qm-verse-context'}${hidden?' is-hidden':''}${playingThis?' qm-verse-playing':''}${selected?' qm-verse-selected':''}`} data-surah={word.s} data-ayah={word.a} onClick={inRange?()=>{setSelectedAyah(word.a);if(masking){if(isHidden(hide,word.a))reveal(word.a);else setHide(hideVerse(hide,word.a));}else if(session.stage==='understand'){openUnderstanding(word.a);}}:undefined}><span className="qm-w-text">{word.text}</span>{word.last&&<span className="quran-verse-marker">{word.marker}</span>}</span>;})}</div></div>;})}</div></div>:<p className="qm-mushaf-flow" dir="rtl">{pageVerses.map(v=>{const inRange=rangeKeys.has(`${v.s}:${v.a}`);if(!inRange)return <span key={`${v.s}:${v.a}`} className="qm-verse-inline qm-verse-context" data-surah={v.s} data-ayah={v.a} aria-label="آية من نفس الصفحة خارج مقطعك">{verseBody(v.t)}<span className="quran-verse-marker">{verseMarker(v.t)||`۝${toArabicNumber(v.a)}`}</span>{' '}</span>;const hidden=masking&&isHidden(hide,v.a);const isPlayingThis=playingAyah===v.a;const isSelected=selectedAyah===v.a&&playingAyah===null;return <span key={`${v.s}:${v.a}`} className={`qm-verse-inline${isPlayingThis?' qm-verse-playing':''}${isSelected?' qm-verse-selected':''}${hidden?' is-hidden':''}`} data-surah={v.s} data-ayah={v.a} onClick={()=>{setSelectedAyah(v.a);if(masking){if(isHidden(hide,v.a))reveal(v.a);else setHide(hideVerse(hide,v.a));}else if(session.stage==='understand'){openUnderstanding(v.a);}}}>{hidden?<span className="quran-verse-hidden qm-hidden-slot" aria-label="آية مخفية للاختبار" style={{width:`${Math.min(14,Math.max(2.5,verseBody(v.t).length*0.3)).toFixed(1)}em`}}>{'\u00A0'}</span>:verseBody(v.t)}<span className="quran-verse-marker" aria-label={`رقم الآية ${v.a}`}>{verseMarker(v.t)||`۝${toArabicNumber(v.a)}`}</span>{' '}</span>;})}</p>}{(session.stage==='understand'||masking)?<div className="qm-verse-controls">{displayedVerses.map(v=><div key={`${v.s}:${v.a}`} className="qm-verse-actions"><small>{referenceLabel(asset,v.s,v.a)}</small>{session.stage==='understand'&&<button onClick={()=>openUnderstanding(v.a)}>فهم الآية {toArabicNumber(v.a)}</button>}{masking&&<><button aria-label={`${isHidden(hide,v.a)?'إظهار الآية':'إخفاء الآية'} ${v.a}`} title={hiddenAriaLabel(hide.mode)} onClick={()=>{if(isHidden(hide,v.a)){reveal(v.a);}else setHide(hideVerse(hide,v.a));}}>{isHidden(hide,v.a)?'إظهار الآية':'إخفاء الآية'}</button><button aria-pressed={attempt?.difficultVerses.includes(`${v.s}:${v.a}`)??false} onClick={()=>{const id=ensureAttempt();if(id)commit(r=>({...r,recallAttempts:r.recallAttempts.map(a=>a.id===id?{...a,difficultVerses:a.difficultVerses.includes(`${v.s}:${v.a}`)?a.difficultVerses.filter(x=>x!==`${v.s}:${v.a}`):[...a.difficultVerses,`${v.s}:${v.a}`]}:a)}));}}>آية صعبة</button></>}</div>)}</div>:<div className="qm-verse-actions qm-passage-summary"><small>{referenceLabel(asset,displayedRange.surah,displayedRange.ayahStart,displayedRange.ayahEnd)} · {toArabicNumber(displayedVerses.length)} {displayedVerses.length===1?'آية':'آيات'}</small></div>}</article></div>}
    {session.stage==='understand'&&<div className="qm-card"><h3>الفهم قبل الحفظ</h3><p>اقرأ الآيات بتأنٍ، ويمكنك فتح لوحة فهم الآية للاطلاع على التفسير وأسباب النزول ومعاني الكلمات.</p></div>}
    {session.stage==='connect'&&<div className="qm-card"><h3>سلسلة الربط التدريجي</h3><p>١، ثم ١–٢، ثم ١–٣ حتى المقطع كاملًا. هذا تدريب ربط، وليس اختبار ترتيب الآيات.</p><div className="qm-chips">{chains.map((c,i)=><button key={i} aria-pressed={!connectPrevious&&chain===i} onClick={()=>{stopAudio();setChain(i);setConnectPrevious(false);}}>{toArabicNumber(c.ayahStart)}{c.ayahEnd!==c.ayahStart?`–${toArabicNumber(c.ayahEnd)}`:''}</button>)}</div>{previous&&<button aria-pressed={connectPrevious} onClick={()=>{stopAudio();setConnectPrevious(v=>!v);}}>اربط بالمقطع السابق: {referenceLabel(asset,previous.range.surah,previous.range.ayahStart,session.range.ayahEnd)}</button>}</div>}
    {masking&&<div className="qm-card"><h3>الإخفاء والاسترجاع</h3>{hide.mode==='D'&&<p className="qm-notice">الإخفاء التدريجي تدريب يبدأ بنص ظاهر، ولا يبني دليل إتقان مستقلًا. استخدم إخفاء الكل أو اختبار الاسترجاع الكامل لمحاولة مقيمة بلا مساعدة.</p>}<div className="qm-chips">{HIDE_MODES.map(m=><button key={m.value} aria-pressed={hide.mode===m.value} onClick={()=>changeMode(m.value)}>{m.label}</button>)}<button disabled>إخفاء كلمات · قيد التحقق</button></div><p className="qm-muted">{HIDE_MODES.find(m=>m.value===hide.mode)?.hint}</p><button className="qm-primary" onClick={()=>reveal()}>إظهار الكل فورًا</button>{hide.mode==='D'&&<button onClick={()=>{const next=ayahs.find(a=>!isHidden(hide,a));if(next!=null)setHide(hideVerse(hide,next));}}>أخفي الآية التالية</button>}<p role="status" className="qm-muted">المخفي: {ayahs.filter(a=>isHidden(hide,a)).map(toArabicNumber).join('، ')||'لا توجد آيات مخفية'}</p></div>}
    {session.stage==='memorize'&&<div className="qm-card qm-tally"><h3>عدّاد التكرار</h3><p className="qm-muted">اضغط + بعد كل مرة تكرر فيها المقطع. الهدف ١٥ مرة، والتكرار سر الحفظ المتقن.</p><div className="qm-tally-row"><button aria-label="زيادة العدد" className="qm-primary" onClick={()=>setTally(n=>Math.min(99,n+1))}>+</button><strong aria-live="polite">{toArabicNumber(tally)} / {toArabicNumber(15)}</strong><button aria-label="تصفير العدد" disabled={tally===0} onClick={()=>setTally(0)}>تصفير</button></div><div className="qm-tally-bar" role="progressbar" aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.min(tally,15)}><span style={{width:`${Math.min(100,Math.round(tally/15*100))}%`}}/></div></div>}
    {audioControls}
    {session.stage==='recite'&&<div className="qm-card"><h3>سمّع من الذاكرة</h3><p>لا تحليل آليًا للصوت ولا درجات مخمّنة. التسجيل اختياري ومؤقت ومحلي، ويُحذف عند مغادرة الجلسة أو دخول الخلفية ما لم تحفظه صراحة على الجهاز.</p>{!recorder.current?<p>الميكروفون غير مدعوم هنا. يمكنك التسميع دون تسجيل.</p>:<><p role="status">{recorderSnapshot.status==='denied'?'لم يُمنح إذن الميكروفون. تابع دون تسجيل أو أعد المحاولة.':recorderSnapshot.status==='recording'?'جارٍ التسجيل محليًا…':recorderSnapshot.status==='requesting'?'بانتظار إذن الميكروفون…':recorderSnapshot.status==='unsupported'?'تعذر تشغيل الميكروفون أو جهاز التسجيل. تابع دون تسجيل أو أعد المحاولة.':'التسجيل اختياري'}</p><div className="qm-chips">{recorderSnapshot.status==='recording'?<button onClick={()=>recorder.current?.stop()}>إيقاف التسجيل</button>:<button disabled={recorderSnapshot.status==='requesting'} onClick={()=>{const instance=recorder.current;if(!instance)return;stopAudio();const pending=instance.start();setRecorderSnapshot(instance.snapshot());void pending.then(()=>{if(mounted.current)setRecorderSnapshot(instance.snapshot());});}}>ابدأ التسجيل بإذني</button>}{recorderSnapshot.url&&<><p className="qm-muted qm-listenback">استمع إلى تسجيلك وقارنه بالآيات. يمكنك إظهار الآيات الآن للمقارنة.</p><audio controls onPlay={()=>stopAudio()} src={recorderSnapshot.url} aria-label="تسجيل التسميع المؤقت"/><button onClick={()=>void saveLocalRecording()}>حفظ على الجهاز</button><button onClick={()=>recorder.current?.discard('user')}>حذف التسجيل</button></>}</div></>}</div>}
    {session.stage==='assess'&&<div className="qm-card"><h3>كيف كان استرجاعك؟</h3><p>التقييم ذاتي ومرتبط بمحاولة الاسترجاع. اختيار «متقن» لا يمنح الإتقان فورًا؛ يلزم دليل استرجاع متباعد بلا مساعدة على سلم المراجعة.</p>{attempt?.helpEvents.length? <p className="qm-notice">استُخدم الإظهار في هذه المحاولة. لن تبني دليل إتقان مستقلًا.</p>:null}<div className="qm-ratings">{ASSESSMENT_LABELS.map(a=><button key={a.value} disabled={!attempt?.completedAt&&!recallDone} onClick={()=>assess(a.value)}>{a.label}</button>)}</div></div>}
    {showUnderstanding&&<UnderstandingSheet surah={session.range.surah} surahName={surahInfo(asset,session.range.surah)?.name} ayahStart={understandingAyah} ayahEnd={session.range.ayahEnd} verseText={(s,a)=>asset.verses.find(v=>v.s===s&&v.a===a)?.t??null} onClose={()=>setShowUnderstanding(false)}/>}
    {session.stage!=='assess'&&<footer className="qm-footer"><button onClick={()=>openUnderstanding()}>فهم الآيات</button>{session.stage==='recite'?<button className="qm-primary" onClick={finishRecall}>أنهيت محاولة الاسترجاع، انتقل للتقييم</button>:<button className="qm-primary" onClick={nextStage}>التالي: {session.stages[session.stages.indexOf(session.stage)+1]==='recite'?'سمّع':STAGE_LABELS[session.stages[session.stages.indexOf(session.stage)+1]]}</button>}<small>موضعك محفوظ على جهازك فقط</small></footer>}
  </section>;
      }
