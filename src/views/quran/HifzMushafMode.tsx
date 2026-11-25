import type {Task, TaskSchedule} from '../../app-state';
import {localDay} from '../../quran-mastery/planning';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff, Mic, Minus, Play, Plus, Settings2, Square, X} from 'lucide-react';
import {TAFSIRS, TRANSLATIONS} from '../../quran/content-api';
import type {QuranAsset} from '../../quran/types';
import {basmalaText, referenceLabel, showsBasmala, surahInfo, toArabicNumber, verseBody, verseMarker} from '../../quran/content';
import {selectRange, SESSION_RECITERS} from '../../quran-mastery/services';
import {VERSE_RECITERS, verseReciterById, verseReciterLabel, searchVerseReciters} from '../../quran/verse-reciters';
import {sessionAudio} from '../../quran/audio-adapter';
import {createBrowserRecorder, type SessionRecorder} from '../../quran-mastery/recorder';
import {buildPageLines, loadPageLines, type LineStart} from './MasteryWorkspace';
import UnderstandingSheet from './UnderstandingSheet';
import {uid} from '../../id';
import {loadMasteryState, saveMasteryState} from '../../quran-mastery/storage';
import {useBackHandler} from '../../navigation/useBackHandler';
import {advanceStage, applyAssessment, buildCumulativeLinkSequence, createRecallAttempt, createSession, formatCumulativePreview, interruptSession} from '../../quran-mastery/engine';
import {deleteRecording, readRecording, saveRecording} from '../../quran-mastery/recording-store';
import {ASSESSMENT_LABELS, MASTERY_SCHEMA_VERSION, MASTERY_STATES} from '../../quran-mastery/types';
import type {MasterySession, MasteryStateRoot, RecallHelpEvent} from '../../quran-mastery/types';
import {
  BILQURAN_PLAN_CHANGED_EVENT,
  buildBilQuranDailySteps,
  buildWeeklyReviewSegments,
  clearActiveBilQuranPlan,
  completeBilQuranStep,
  findBilQuranPlan,
  formatStepSummary,
  loadActiveBilQuranPlan,
  saveActiveBilQuranPlan,
  type ActiveBilQuranPlanState,
  type BilQuranDailyStep,
  type BilQuranDirection,
  type BilQuranPlanSpec,
} from '../../quran-mastery/bilquran-plans';
import BilQuranPlansBrowser from './BilQuranPlansBrowser';

// واجهة الحفظ الجديدة: الصفحة الكاملة من المصحف أولًا، وتحتها ثلاثة أزرار: إخفاء/إظهار، تشغيل القارئ، تسجيل التسميع.
// لا تغيّر نص القرآن ولا بيانات الإتقان القديمة؛ الوضع المفصّل ما زال متاحًا.

type Mode = 'new' | 'review';
type PlayMode = 'standard' | 'cumulative';
type Settings = {passageRepeat: number; ayahRepeat: number; reciterId: number; speed: number; follow: boolean; playMode: PlayMode};
type Ids = {passageId: string; sessionId: string};
type Seg = {surah: number; from: number; to: number};
type Saved = {tail?: Seg[]; tailIds?: Ids[]; mode: Mode; ids?: Ids | null; surah: number; from: number; to: number; page: number; started: boolean; settings: Settings; autoStart?: boolean; planStepIndex?: number};

const KEY = 'rabbani-hifz-mushaf-v1';
export const PENDING_RANGE_KEY = 'rabbani-hifz-pending-range-v1';
const DEFAULT_SETTINGS: Settings = {passageRepeat: 1, ayahRepeat: 3, reciterId: SESSION_RECITERS[0].id, speed: 1, follow: true, playMode: 'standard'};

const readSaved = (): Saved | null => {
  try {
    const pending = localStorage.getItem(PENDING_RANGE_KEY);
    if (pending) {
      localStorage.removeItem(PENDING_RANGE_KEY);
      const r = JSON.parse(pending) as {surah: number; ayahStart: number; ayahEnd: number; mode?: Mode; autoStart?: boolean; planStepIndex?: number; group?: {surah: number; ayahStart: number; ayahEnd: number}[]};
      if (r && typeof r.surah === 'number') {
        const g = Array.isArray(r.group) && r.group.length > 1 ? r.group : null;
        const first = g ? g[0] : {surah: r.surah, ayahStart: r.ayahStart, ayahEnd: r.ayahEnd};
        return {mode: r.mode === 'new' ? 'new' : 'review', surah: first.surah, from: first.ayahStart, to: first.ayahEnd, ...(g ? {tail: g.slice(1).map(x => ({surah: x.surah, from: x.ayahStart, to: x.ayahEnd}))} : {}), page: 0, started: false, settings: DEFAULT_SETTINGS, autoStart: r.autoStart, planStepIndex: r.planStepIndex};
      }
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    if (!v || typeof v.surah !== 'number') return null;
    const mergedSettings: Settings = {...DEFAULT_SETTINGS, ...(v.settings ?? {}), playMode: v.settings?.playMode === 'cumulative' ? 'cumulative' : 'standard'};
    return {...v, mode: v.mode === 'review' ? 'review' : 'new', settings: mergedSettings};
  } catch { return null; }
};

const STEP_LABEL: Record<string, string> = {listen: 'الاستماع', understand: 'التفسير', memorize: 'الحفظ والتكرار', connect: 'الربط', recite: 'التسميع', assess: 'التقييم'};
const STEP_TIP: Record<string, string> = {
  listen: 'استمع إلى المقطع من قارئ متقن مرة أو مرتين حتى تضبط التلاوة قبل أن تبدأ الحفظ.',
  understand: 'اقرأ تفسير هذه الآيات واطلع على ترجمتها؛ فهم المعنى يعين على الحفظ والعمل.',
  memorize: 'كرر كل آية والنص ظاهر أمامك حتى تثبت، ثم انتقل إلى التي بعدها.',
  connect: 'الربط التراكمي: تبدأ بالآية وحدها بالتكرار المحدد ثم تُربط بما قبلها من أول المقطع (١ ← ٢ ثم ١–٢ ← ٣ ثم ١–٣…). ويمكنك التبديل من الإعدادات.',
  recite: 'النص مخفي الآن. سمّع المقطع من حفظك، وسجّل نفسك إن أحببت. زر العين يكشف النص للتحقق وتُسجَّل مساعدة.',
  assess: 'قيّم استرجاعك بصدق. التقييم ذاتي ويُسجَّل في خططك وإنجازك، ولا يمنح الإتقان وحده.',
};
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75];

type Props = {asset: QuranAsset; notify: (text: string) => void; onDetailed?: () => void; onExit?: () => void; tasks?: Task[]; onTasks?: (t: Task[]) => void; taskSchedules?: Record<string, TaskSchedule>; onTaskSchedules?: (n: Record<string, TaskSchedule>) => void};
const upsert = <T extends {id: string}>(list: T[], item: T) => [...list.filter(v => v.id !== item.id), item];

export default function HifzMushafMode({asset, notify, onExit, tasks, onTasks, taskSchedules, onTaskSchedules}: Props) {
  const saved = useMemo(readSaved, []);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>(saved?.mode ?? 'new');
  const [surah, setSurah] = useState(saved?.surah ?? 1);
  const [from, setFrom] = useState(saved?.from ?? 1);
  const [to, setTo] = useState(saved?.to ?? 3);
  const [pageIdx, setPageIdx] = useState(saved?.page ?? 0);
  const [settings, setSettings] = useState<Settings>(saved?.settings ?? DEFAULT_SETTINGS);
  const [hidden, setHidden] = useState(false);
  const [ids, setIds] = useState<Ids | null>(saved?.ids ?? null);
  // مقاطع إضافية بعد المقطع الأول عند اختيار صفحات تعبر أكثر من سورة. لكل مقطع جلسته الخاصة، وتتقدم كلها معًا.
  const [tail, setTail] = useState<Seg[]>(saved?.tail ?? []);
  const [tailIds, setTailIds] = useState<Ids[]>(saved?.tailIds ?? []);
  const [uSeg, setUSeg] = useState(0);
  const [playingSurah, setPlayingSurah] = useState<number | null>(null);
  const [root, setRoot] = useState<MasteryStateRoot>(() => loadMasteryState());
  const rootRef = useRef(root);
  const helpRef = useRef<RecallHelpEvent[]>([]);
  const activePlanStepRef = useRef<number | null>(null);
  const [activePlan, setActivePlan] = useState<ActiveBilQuranPlanState | null>(() => loadActiveBilQuranPlan());

  useEffect(() => {
    const syncPlan = () => setActivePlan(loadActiveBilQuranPlan());
    window.addEventListener(BILQURAN_PLAN_CHANGED_EVENT, syncPlan);
    return () => window.removeEventListener(BILQURAN_PLAN_CHANGED_EVENT, syncPlan);
  }, []);

  const activePlanSpec = useMemo(
    () => (activePlan ? findBilQuranPlan(activePlan.planId) ?? null : null),
    [activePlan],
  );
  const activePlanSteps = useMemo(
    () => (activePlan && activePlanSpec ? buildBilQuranDailySteps(asset, activePlanSpec, activePlan.direction) : []),
    [asset, activePlan, activePlanSpec],
  );
  const activeCurrentStep = useMemo(
    () => (activePlan && activePlanSteps.length ? activePlanSteps[Math.min(activePlan.currentIndex, activePlanSteps.length - 1)] : null),
    [activePlan, activePlanSteps],
  );

  const [summary, setSummary] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const lastRecordingId = useRef<string | undefined>(undefined);
  const commit = (fn: (r: MasteryStateRoot) => MasteryStateRoot) => {
    const next = fn(rootRef.current);
    try { saveMasteryState(next, rootRef.current); rootRef.current = next; setRoot(next); return true; }
    catch { notify('تعذر الحفظ على الجهاز. لم يُسجّل التغيير.'); return false; }
  };
  const [phase, setPhase] = useState<'entry' | 'range' | 'plans'>('entry');
  const [rangeKind, setRangeKind] = useState<'ayah' | 'page'>('ayah');
  const [pageFrom, setPageFrom] = useState(1);
  const [pageTo, setPageTo] = useState(1);
  const [sheet, setSheet] = useState(false);
  const [rq, setRq] = useState('');
  const [tip, setTip] = useState(true);
  const [listSheet, setListSheet] = useState(false);
  const [reps, setReps] = useState(0);
  const [draft, setDraft] = useState<{from: number; to: number; settings: Settings}>({from: 1, to: 1, settings: DEFAULT_SETTINGS});
  const [source, setSource] = useState<{topic: 'tafsir' | 'translation'; id: number} | null>(null);
  const [validation, setValidation] = useState('');
  const [playing, setPlaying] = useState(false);
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [rec, setRec] = useState({status: 'idle', url: '', mimeType: '', durationMs: 0});
  const [lineData, setLineData] = useState<Record<string, LineStart[]> | null>(null);
  const [understandAyah, setUnderstandAyah] = useState<number | null>(null);
  const generation = useRef(0);
  const recorder = useRef<SessionRecorder | null>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const session = ids ? root.sessions.find(x => x.id === ids.sessionId) : undefined;
  const stage = session?.stage ?? 'listen';
  const steps = session?.stages ?? [];
  useEffect(() => {
    if (!started) return;
    setHidden(false);
    setTip(true);
    setAsk(stage === 'recite');
    setSched(false);
    setReps(0);
    setStatus('');
    if (stage === 'connect') {
      setSettings(s => (s.playMode === 'cumulative' ? s : {...s, playMode: 'cumulative'}));
    }
    stopAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, started]);
  const [ask, setAsk] = useState(false);
  const [sched, setSched] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('20:00');
  const [schedBusy, setSchedBusy] = useState(false);
  const schedLock = useRef(false);
  const [schedErr, setSchedErr] = useState('');
  const max = asset.surahs.find(s => s.n === surah)?.ayahs ?? 1;
  const segs: Seg[] = useMemo(() => [{surah, from, to}, ...tail], [surah, from, to, tail]);
  const verses = useMemo(() => (started ? segs.flatMap(g => selectRange(asset, {surah: g.surah, ayahStart: g.from, ayahEnd: g.to})) : []), [asset, started, segs]);
  const pageNums = useMemo(() => [...new Set(verses.map(v => v.p))], [verses]);
  const safeIdx = Math.min(Math.max(0, pageIdx), Math.max(0, pageNums.length - 1));
  const activePage = pageNums[safeIdx];
  const rangeKeys = useMemo(() => new Set(verses.map(v => `${v.s}:${v.a}`)), [verses]);
  const basmala = basmalaText(asset);

  useEffect(() => { let live = true; void loadPageLines().then(d => { if (live) setLineData(d); }); return () => { live = false; }; }, []);
  useEffect(() => {
    recorder.current = createBrowserRecorder(() => { const snap = recorder.current?.snapshot(); if (snap) setRec(snap); });
    return () => { generation.current++; sessionAudio.cancel(); recorder.current?.dispose(); };
  }, []);
  useEffect(() => {
    if (!started) return;
    try { localStorage.setItem(KEY, JSON.stringify({mode, ids, tail, tailIds, surah, from, to, page: safeIdx, started: true, settings})); } catch { /* ignore */ }
  }, [started, mode, ids, tail, tailIds, surah, from, to, safeIdx, settings]);

  const pageLines = useMemo(() => (activePage == null || !lineData ? null : buildPageLines(asset, lineData[String(activePage)])), [asset, lineData, activePage]);
  useLayoutEffect(() => {
    const box = linesRef.current;
    if (!box) return;
    const fit = () => {
      const host = box.parentElement;
      if (!host || !host.clientWidth) return;
      let fs = 23;
      box.style.fontSize = `${fs}px`;
      while (box.scrollWidth > host.clientWidth && fs > 11.5) { fs -= 0.5; box.style.fontSize = `${fs}px`; }
      const area = box.closest('.hf-pagearea') as HTMLElement | null;
      const card = box.closest('.hifz-page') as HTMLElement | null;
      if (area && card && area.clientHeight > 260) {
        while (card.scrollHeight > area.clientHeight - 12 && fs > 13.5) {
          fs -= 0.5;
          box.style.fontSize = `${fs}px`;
        }
      }
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(box);
    if (box.parentElement) ro?.observe(box.parentElement);
    window.addEventListener('resize', fit);
    void document.fonts?.ready.then(fit);
    return () => { ro?.disconnect(); window.removeEventListener('resize', fit); };
  }, [pageLines, activePage, started, stage]);

  const stopAudio = () => { generation.current++; sessionAudio.cancel(); setPlaying(false); setPlayingAyah(null); };

  // يبدأ جلسة جديدة (أو يستأنف الحالية) على نطاق واحد من سورة واحدة.
  const begin = (nextMode: Mode, resume = false, override?: Seg & {tail?: Seg[]}) => {
    const first: Seg = {surah: override?.surah ?? surah, from: override?.from ?? from, to: override?.to ?? to};
    const all: Seg[] = resume ? segs : [first, ...(override ? (override.tail ?? []) : tail)];
    if (!resume) {
      for (const g of all) {
        const gmax = asset.surahs.find(x => x.n === g.surah)?.ayahs ?? 1;
        if (!selectRange(asset, {surah: g.surah, ayahStart: g.from, ayahEnd: g.to}).length || g.from < 1 || g.to > gmax || g.to < g.from) {
          setValidation(`اختر نطاقًا صحيحًا من ١ إلى ${toArabicNumber(gmax)}، والنهاية بعد البداية.`);
          return false;
        }
      }
      setSurah(first.surah); setFrom(first.from); setTo(first.to);
      setTail(all.slice(1));
      setPageIdx(0);
    }
    setValidation('');
    setMode(nextMode);
    setSummary('');
    setReps(0);
    setStatus('');
    if (!resume) setSettings(s => ({...s, playMode: 'standard'}));
    helpRef.current = [];
    const liveSession = sessionOf();
    if (!(resume && ids && liveSession && !liveSession.endedAt)) {
      const now = new Date().toISOString();
      const made: Ids[] = [];
      const ok = commit(r => {
        let next = r;
        for (const g of all) {
          const range = {surah: g.surah, ayahStart: g.from, ayahEnd: g.to};
          const existing = next.passages.find(p => p.range.surah === range.surah && p.range.ayahStart === range.ayahStart && p.range.ayahEnd === range.ayahEnd);
          const passageId = existing?.id ?? uid();
          const session = createSession({purpose: nextMode === 'review' ? 'revision' : 'new', passageId, range, newId: uid});
          made.push({passageId, sessionId: session.id});
          const group = all.length > 1 ? all.map(a => ({surah: a.surah, ayahStart: a.from, ayahEnd: a.to})) : undefined;
          next = {...next, passages: existing ? next.passages.map(x => x.id === passageId ? {...x, group, updatedAt: now} : x) : [...next.passages, {id: passageId, range, ...(group ? {group} : {}), order: 0, schemaVersion: MASTERY_SCHEMA_VERSION, createdAt: now, updatedAt: now}], sessions: [...next.sessions, session], updatedAt: now};
        }
        return next;
      });
      if (!ok) return false;
      setIds(made[0]); setTailIds(made.slice(1));
      setHidden(false);
    } else setHidden(false);
    setTip(true);
    setPhase('entry');
    setStarted(true);
    return true;
  };

  const sessionOf = (): MasterySession | undefined => rootRef.current.sessions.find(x => x.id === ids?.sessionId);
  const allIds = (): Ids[] => (ids ? [ids, ...tailIds] : []);
  const leave = () => {
    stopAudio();
    recorder.current?.discard('exit');
    const live = allIds().map(i => rootRef.current.sessions.find(x => x.id === i.sessionId)).filter((x): x is MasterySession => !!x && !x.endedAt);
    if (live.length) commit(r => ({...r, sessions: live.reduce((list, ss) => upsert(list, interruptSession(ss)), r.sessions)}));
    activePlanStepRef.current = null;
    setIds(null); setTailIds([]);
    setStarted(false);
  };
  // زر الرجوع في الهاتف: يغلق أعلى طبقة داخل مصحف الحفظ (الإعدادات، الجدولة، الجلسة، ثم الشاشات الفرعية).
  // من الشاشة الأولى لا يوجد معالج هنا، فيرجع التطبيق إلى الشاشة التي فُتح منها فعلًا.
  useBackHandler(() => {
    if (sheet) { setSheet(false); return; }
    if (sched) { setSched(false); return; }
    if (started) { leave(); return; }
    setPhase('entry'); setValidation('');
  }, sheet || sched || started || phase !== 'entry');
  const finish = (label: typeof ASSESSMENT_LABELS[number]['value']) => {
    const session = sessionOf();
    if (!session || !ids) return;
    stopAudio();
    let message = '';
    const ok = commit(r => {
      let cur = r;
      const due: string[] = [];
      let firstState = '';
      for (const [i, id] of allIds().entries()) {
        const ss = cur.sessions.find(x => x.id === id.sessionId);
        if (!ss) continue;
        const attempt = {...createRecallAttempt({sessionId: ss.id, range: ss.range, hideMode: 'E', newId: uid}), helpEvents: helpRef.current, recordingId: i === 0 ? lastRecordingId.current : undefined, completedAt: new Date().toISOString()};
        const result = applyAssessment({...cur, recallAttempts: [...cur.recallAttempts, attempt]}, {passageId: id.passageId, attemptId: attempt.id, label, newId: uid});
        let closed: MasterySession = ss;
        while (closed.stage !== 'assess' && !closed.endedAt) closed = advanceStage(closed);
        closed = advanceStage(closed);
        cur = {...result.root, sessions: upsert(result.root.sessions, closed)};
        due.push(result.outcome.schedule.dueDate);
        if (!i) firstState = MASTERY_STATES.find(x => x.value === result.outcome.projection.state)?.label ?? '';
      }
      message = `أتممت الجلسة · تقييمك: ${ASSESSMENT_LABELS.find(x => x.value === label)?.label}. الحالة: ${firstState}. المراجعة: ${due[0]}.${tailIds.length ? ` سُجّل التقييم لكل مقطع (${toArabicNumber(tailIds.length + 1)} مقاطع).` : ''}`;
      return cur;
    });
    if (!ok) return;
    const completedPlanStep = activePlanStepRef.current;
    activePlanStepRef.current = null;
    if (completedPlanStep !== null && activePlan && activePlanSteps.length) {
      const updated = completeBilQuranStep(activePlan, completedPlanStep, activePlanSteps.length);
      setActivePlan(updated);
      message += ` · اكتمل مقرر اليوم ${toArabicNumber(completedPlanStep + 1)} من خطة الحفظ.`;
    }
    recorder.current?.discard('finished');
    setIds(null); setTailIds([]);
    setStarted(false);
    setSummary(message);
  };
  const saveLocalRecording = async () => {
    if (!ids) return;
    const savedRec = recorder.current?.recordingForSave(uid, ids.passageId, ids.sessionId);
    if (!savedRec) return;
    try {
      await saveRecording(savedRec.blob, savedRec.meta);
      if (commit(r => ({...r, recordings: [...r.recordings, savedRec.meta]}))) {
        lastRecordingId.current = savedRec.meta.id;
        recorder.current?.discard('saved');
        notify('حُفظ التسجيل على هذا الجهاز فقط، ومرتبط بمقطعك.');
      } else await deleteRecording(savedRec.meta.id);
    } catch { notify('تعذر حفظ التسجيل على الجهاز. لم يُرفع أي صوت.'); }
  };
  useEffect(() => () => { if (savedUrl) URL.revokeObjectURL(savedUrl); }, [savedUrl]);
  const passageRecordings = root.recordings.filter(m => ids && m.passageId === ids.passageId);

  const goPage = (delta: number) => setPageIdx(i => Math.min(pageNums.length - 1, Math.max(0, i + delta)));

  const play = async (cfg: Settings = settings) => {
    if (playing) { stopAudio(); setStatus('توقف التشغيل.'); return; }
    setReps(0);
    if (!verses.length) return;
    const token = ++generation.current;
    setPlaying(true);
    const cumulativeSteps = cfg.playMode === 'cumulative' ? buildCumulativeLinkSequence(verses, cfg.ayahRepeat) : null;
    try {
      for (let p = 0; p < cfg.passageRepeat; p++) {
        if (cumulativeSteps) {
          for (const step of cumulativeSteps) {
            if (token !== generation.current) return;
            const verse = step.verse;
            setPlayingAyah(verse.a); setPlayingSurah(verse.s);
            if (cfg.follow) { const idx = pageNums.indexOf(verse.p); if (idx >= 0) setPageIdx(idx); }
            const cycleSuffix = cfg.passageRepeat > 1 ? ` · المقطع ${toArabicNumber(p + 1)}/${toArabicNumber(cfg.passageRepeat)}` : '';
            setStatus(
              step.phase === 'solo'
                ? `الآية ${toArabicNumber(verse.a)} (وحدها) · تكرار ${toArabicNumber(step.repeatIndex)}/${toArabicNumber(step.repeatTotal)}${cycleSuffix}`
                : `ربط ${toArabicNumber(step.linkFromAyah)}–${toArabicNumber(step.linkToAyah)} · الآية ${toArabicNumber(verse.a)}${cycleSuffix}`,
            );
            const result = await sessionAudio.playVerse({reciterId: cfg.reciterId, surah: verse.s, ayah: verse.a, title: referenceLabel(asset, verse.s, verse.a, verse.a), playbackRate: cfg.speed});
            if (token !== generation.current || result === 'cancelled') return;
            if (result !== 'ended') {
              setStatus(result === 'missing' ? 'الصوت غير متاح الآن. تحقق من الاتصال وأعد المحاولة.' : result === 'rejected-narration' ? 'هذا القارئ غير متوافق مع نص حفص المعروض.' : 'تعذر تشغيل التلاوة. لم نتجاوز الآية.');
              stopAudio();
              return;
            }
          }
        } else {
          for (const verse of verses) {
            for (let a = 0; a < cfg.ayahRepeat; a++) {
              if (token !== generation.current) return;
              setPlayingAyah(verse.a); setPlayingSurah(verse.s);
              if (cfg.follow) { const idx = pageNums.indexOf(verse.p); if (idx >= 0) setPageIdx(idx); }
              setStatus(`الآية ${toArabicNumber(verse.a)} · تكرار الآية ${toArabicNumber(a + 1)}/${toArabicNumber(cfg.ayahRepeat)} · المقطع ${toArabicNumber(p + 1)}/${toArabicNumber(cfg.passageRepeat)}`);
              const result = await sessionAudio.playVerse({reciterId: cfg.reciterId, surah: verse.s, ayah: verse.a, title: referenceLabel(asset, verse.s, verse.a, verse.a), playbackRate: cfg.speed});
              if (token !== generation.current || result === 'cancelled') return;
              if (result !== 'ended') {
                setStatus(result === 'missing' ? 'الصوت غير متاح الآن. تحقق من الاتصال وأعد المحاولة.' : result === 'rejected-narration' ? 'هذا القارئ غير متوافق مع نص حفص المعروض.' : 'تعذر تشغيل التلاوة. لم نتجاوز الآية.');
                stopAudio();
                return;
              }
            }
          }
        }
        setReps(p + 1);
      }
      setStatus('اكتمل التشغيل المحدد.');
    } finally {
      if (token === generation.current) { setPlaying(false); setPlayingAyah(null); }
    }
  };

  const toggleRecord = async () => {
    const r = recorder.current;
    if (!r) { notify('التسجيل غير مدعوم في هذا الجهاز.'); return; }
    if (rec.status === 'recording') { r.stop(); return; }
    stopAudio();
    const result = await r.start();
    if (result === 'denied') notify('لم يُسمح بالميكروفون. فعّله من إعدادات الهاتف للتسجيل.');
    else if (result === 'unsupported') notify('التسجيل غير مدعوم في هذا الجهاز.');
  };

  const onTouchEnd = (x: number) => {
    if (touchX.current === null) return;
    const dx = x - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 50) return;
    // في المصحف (يمين إلى يسار) تُقلب الصفحة التالية بالسحب من اليسار إلى اليمين.
    goPage(dx > 0 ? 1 : -1);
  };

  const wordClass = (s: number, a: number) => {
    const inRange = rangeKeys.has(`${s}:${a}`);
    return `qm-w${inRange ? '' : ' qm-verse-context'}${inRange && hidden ? ' is-hidden' : ''}${playingAyah === a && playingSurah === s && inRange ? ' qm-verse-playing' : ''}`;
  };
  const onWordTap = (s: number, a: number) => {
    if (stage === 'understand' && rangeKeys.has(`${s}:${a}`)) { setUSeg(Math.max(0, segs.findIndex(g => g.surah === s))); setUnderstandAyah(a); }
  };

  const taskOpened = useRef(false);
  useEffect(() => {
    if (taskOpened.current) return;
    taskOpened.current = true;
    try {
      const raw = localStorage.getItem('rabbani-hifz-pending-task-v1');
      if (raw) {
        localStorage.removeItem('rabbani-hifz-pending-task-v1');
        const h = JSON.parse(raw) as {surah: number; from: number; to: number; tail?: Seg[]};
        if (typeof h.surah === 'number') { begin('review', false, {surah: h.surah, from: h.from, to: h.to, tail: h.tail ?? []}); return; }
      }
    } catch { /* ignore */ }
    if (saved?.autoStart) {
      activePlanStepRef.current = typeof saved.planStepIndex === 'number' ? saved.planStepIndex : null;
      begin(saved.mode, false, {surah: saved.surah, from: saved.from, to: saved.to, tail: saved.tail ?? []});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pagesToRange = (pf: number, pt: number) => {
    const vs = asset.verses.filter(v => v.p >= pf && v.p <= pt);
    if (!vs.length) return null;
    const order: number[] = [];
    for (const v of vs) if (!order.includes(v.s)) order.push(v.s);
    const list: Seg[] = order.map(sn => { const inS = vs.filter(v => v.s === sn); return {surah: sn, from: Math.min(...inS.map(v => v.a)), to: Math.max(...inS.map(v => v.a))}; });
    return {...list[0], list, multi: list.length > 1};
  };

  const launchPlanStep = (step: BilQuranDailyStep, nextMode: Mode = 'new') => {
    if (!step.segments.length) return;
    activePlanStepRef.current = nextMode === 'new' ? step.index : null;
    const [first, ...rest] = step.segments;
    begin(nextMode, false, {surah: first.surah, from: first.from, to: first.to, tail: rest});
  };

  const handleActivatePlan = (plan: BilQuranPlanSpec, dir: BilQuranDirection, startIndex = 0) => {
    const steps = buildBilQuranDailySteps(asset, plan, dir);
    const safeStart = Math.min(Math.max(0, startIndex), Math.max(0, steps.length - 1));
    const existingSame = activePlan && activePlan.planId === plan.id && activePlan.direction === dir;
    const nowIso = new Date().toISOString();
    const nextState = saveActiveBilQuranPlan({
      planId: plan.id,
      direction: dir,
      currentIndex: safeStart,
      completedIndices: existingSame ? activePlan.completedIndices : [],
      startedAt: existingSame ? activePlan.startedAt : nowIso,
      updatedAt: nowIso,
    });
    setActivePlan(nextState);
    const targetStep = steps[safeStart];
    if (targetStep) {
      launchPlanStep(targetStep, 'new');
    } else {
      setPhase('entry');
    }
  };

  if (!started) {
    const pageInfo = rangeKind === 'page' ? pagesToRange(pageFrom, pageTo) : null;
    const confirmRange = () => {
      activePlanStepRef.current = null;
      if (rangeKind === 'ayah') {
        const keep = tail.length > 0 && saved && surah === saved.surah && from === saved.from && to === saved.to;
        begin(mode, false, {surah, from, to, tail: keep ? tail : []});
        return;
      }
      if (pageFrom < 1 || pageTo > 604 || pageTo < pageFrom || !pageInfo) { setValidation('اختر صفحات صحيحة من ١ إلى ٦٠٤، ونهاية المدى بعد البداية أو تساويها.'); return; }
      begin(mode, false, {surah: pageInfo.surah, from: pageInfo.from, to: pageInfo.to, tail: pageInfo.list.slice(1)});
    };
    return <section className="hf-screen hf-entry" dir="rtl" aria-label="مصحف الحفظ والإتقان">
      <header className="hf-entry-head">
        <button type="button" className="hf-icon-btn" aria-label="رجوع" onClick={() => { if (phase !== 'entry') { setPhase('entry'); setValidation(''); } else (onExit ? onExit() : window.history.back()); }}><ChevronRight size={22}/></button>
        <strong>مصحف الحفظ والإتقان</strong>
      </header>
      {phase === 'entry' ? <div className="hf-entry-body">
        <h2>ماذا تريد اليوم؟</h2>
        {summary && <div className="qm-notice" role="status">{summary}</div>}

        {activePlan && activePlanSpec && activeCurrentStep && (
          <section className="hf-active-plan" aria-label="خطتي النشطة في الحفظ">
            <div className="hf-active-plan-head">
              <span className="hf-plan-kicker">
                خطتي المعتمدة · {activePlan.direction === 'nas' ? 'من الناس ← البقرة' : 'من البقرة ← الناس'}
              </span>
              <strong>{activePlanSpec.title} ({activePlanSpec.durationLabel})</strong>
              <p className="hf-active-plan-meta">
                اليوم {toArabicNumber(activeCurrentStep.dayNumber)} من {toArabicNumber(activePlanSteps.length)}
                {' · '}أُنجز {toArabicNumber(activePlan.completedIndices.length)} مقررًا
                {activeCurrentStep.isWeeklyMilestone ? ' · محطة ربط أسبوعي' : ''}
              </p>
            </div>
            <div className="hf-plan-progress" aria-hidden="true">
              <div style={{width: `${Math.min(100, Math.round((activePlan.completedIndices.length / Math.max(1, activePlanSteps.length)) * 100))}%`}}/>
            </div>
            <div className="hf-active-plan-portion">
              <span>مقرر اليوم: <strong>{formatStepSummary(asset, activeCurrentStep)}</strong></span>
              <small>صفحة {activeCurrentStep.pageStart === activeCurrentStep.pageEnd ? toArabicNumber(activeCurrentStep.pageStart) : `${toArabicNumber(activeCurrentStep.pageStart)}–${toArabicNumber(activeCurrentStep.pageEnd)}`} · {toArabicNumber(activeCurrentStep.verseCount)} آية</small>
            </div>
            <div className="hf-active-plan-actions">
              <button type="button" className="hf-ok" onClick={() => launchPlanStep(activeCurrentStep, 'new')}>
                ابدأ مقرر اليوم
              </button>
              {activePlan.currentIndex > 0 && (
                <button
                  type="button"
                  className="hf-chip"
                  onClick={() => {
                    const revSegs = buildWeeklyReviewSegments(activePlanSteps, activePlan.currentIndex, activePlanSpec.daysPerWeek);
                    if (revSegs.length) {
                      activePlanStepRef.current = null;
                      const [first, ...rest] = revSegs;
                      begin('review', false, {surah: first.surah, from: first.from, to: first.to, tail: rest});
                    }
                  }}
                >
                  مراجعة ربط الأسبوع
                </button>
              )}
            </div>
            <div className="hf-active-plan-nav">
              <button
                type="button"
                className="hf-chip"
                disabled={activePlan.currentIndex <= 0}
                onClick={() => setActivePlan(saveActiveBilQuranPlan({...activePlan, currentIndex: Math.max(0, activePlan.currentIndex - 1)}))}
              >
                المقرر السابق
              </button>
              <button
                type="button"
                className="hf-chip"
                disabled={activePlan.currentIndex >= activePlanSteps.length - 1}
                onClick={() => setActivePlan(saveActiveBilQuranPlan({...activePlan, currentIndex: Math.min(activePlanSteps.length - 1, activePlan.currentIndex + 1)}))}
              >
                المقرر التالي
              </button>
              <button type="button" className="hf-chip" onClick={() => setPhase('plans')}>
                تغيير الخطة
              </button>
              <button type="button" className="hf-link hf-link-quiet" onClick={() => { clearActiveBilQuranPlan(); setActivePlan(null); }}>
                إيقاف الخطة
              </button>
            </div>
          </section>
        )}

        <div className="hf-choices">
          <button type="button" className="hf-choice" onClick={() => { activePlanStepRef.current = null; setMode('new'); setPhase('range'); setValidation(''); }}><span>حفظ</span><small>مقطع جديد على خطوات</small></button>
          <button type="button" className="hf-choice" onClick={() => { activePlanStepRef.current = null; setMode('review'); setPhase('range'); setValidation(''); }}><span>مراجعة</span><small>سمّع من حفظك ثم قيّم</small></button>
        </div>

        <button type="button" className="hf-plan-launch" onClick={() => setPhase('plans')}>
          <div>
            <strong>خطط الحفظ والمراجعة (منهج بالقرآن نحيا)</strong>
            <small>اختر من ١٢ خطة للمبتدئين ومن البقرة ومن الناس (٥ إلى ٤٨ شهرًا) بأي اتجاه</small>
          </div>
          <span>استعراض الخطط</span>
        </button>

        {saved?.started && <button type="button" className="hf-link" onClick={() => { setSurah(saved.surah); setFrom(saved.from); setTo(saved.to); setTail(saved.tail ?? []); setTailIds(saved.tailIds ?? []); setPageIdx(saved.page); begin(saved.mode, true, undefined); }}>
          تابع من حيث توقفت: {[{surah: saved.surah, from: saved.from, to: saved.to}, ...(saved.tail ?? [])].map(g => referenceLabel(asset, g.surah, g.from, g.to)).join(' + ')}
        </button>}
      </div> : phase === 'plans' ? <div className="hf-entry-body">
        <BilQuranPlansBrowser asset={asset} activePlan={activePlan} onActivatePlan={handleActivatePlan}/>
      </div> : <div className="hf-entry-body">
        <div className="hf-range-card">
          <h2>{mode === 'review' ? 'مراجعة' : 'حفظ'}: حدّد المقطع</h2>
          <div className="hf-seg" role="tablist">
            <button type="button" role="tab" aria-selected={rangeKind === 'ayah'} className={rangeKind === 'ayah' ? 'on' : ''} onClick={() => setRangeKind('ayah')}>بالآيات</button>
            <button type="button" role="tab" aria-selected={rangeKind === 'page'} className={rangeKind === 'page' ? 'on' : ''} onClick={() => setRangeKind('page')}>بالصفحات</button>
          </div>
          {rangeKind === 'ayah' ? <div className="hf-fields">
            <label className="hf-wide">السورة<select value={surah} onChange={e => { const n = Number(e.target.value); setSurah(n); setFrom(1); setTo(Math.min(3, asset.surahs.find(x => x.n === n)?.ayahs ?? 1)); }}>
              {asset.surahs.map(x => <option key={x.n} value={x.n}>{toArabicNumber(x.n)}. {x.name}</option>)}
            </select></label>
            <label>من الآية<input type="number" inputMode="numeric" min={1} max={max} value={from} onChange={e => setFrom(Number(e.target.value))}/></label>
            <label>إلى الآية<input type="number" inputMode="numeric" min={from} max={max} value={to} onChange={e => setTo(Number(e.target.value))}/></label>
            {tail.length > 0 && saved && surah === saved.surah && from === saved.from && to === saved.to && <p className="hf-hint hf-wide">{[{surah, from, to}, ...tail].map(g => referenceLabel(asset, g.surah, g.from, g.to)).join(' + ')} · تُفتح كل المقاطع معًا.</p>}
          </div> : <div className="hf-fields">
            <label>من صفحة<input type="number" inputMode="numeric" min={1} max={604} value={pageFrom} onChange={e => { const v = Number(e.target.value); setPageFrom(v); if (pageTo < v) setPageTo(v); }}/></label>
            <label>إلى صفحة<input type="number" inputMode="numeric" min={pageFrom} max={604} value={pageTo} onChange={e => setPageTo(Number(e.target.value))}/></label>
            <p className="hf-hint hf-wide">{pageInfo ? `${pageInfo.list.map(g => referenceLabel(asset, g.surah, g.from, g.to)).join(' + ')}${pageInfo.multi ? ' · الصفحات تعبر أكثر من سورة، وتُسجَّل كل سورة كمقطع مستقل ضمن جلسة واحدة.' : ''}` : 'أدخل رقم صفحة صحيحًا. للصفحة الواحدة اكتب الرقم نفسه في الخانتين.'}</p>
          </div>}
          {validation && <p role="alert" className="qm-error">{validation}</p>}
          <button type="button" className="hf-ok" onClick={confirmRange}>موافق</button>
        </div>
      </div>}
    </section>;
  }

  const label = segs.map(g => referenceLabel(asset, g.surah, g.from, g.to)).join(' + ');
  const stepNo = Math.max(0, steps.indexOf(stage)) + 1;
  const isRepStep = stage === 'listen' || stage === 'memorize' || stage === 'connect';
  const stepTitle = `${toArabicNumber(stepNo)} - ${STEP_LABEL[stage]}`;
  const stepCount = isRepStep ? ` (${toArabicNumber(reps)} - ${toArabicNumber(settings.passageRepeat)})` : '';
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
  const dayKey = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return localDay(d, tz); };
  const confirmSchedule = () => {
    if (schedLock.current || !session || !ids) return;
    const date = schedDate || dayKey(1);
    if (date < dayKey(0) || !/^\d{2}:\d{2}$/.test(schedTime) || (date === dayKey(0) && schedTime <= new Date().toTimeString().slice(0, 5))) { setSchedErr('اختر يومًا ووقتًا قادمين.'); return; }
    if (!onTasks || !onTaskSchedules) { setSchedErr('تعذر الوصول إلى المهام. أعد فتح الصفحة.'); return; }
    schedLock.current = true; setSchedBusy(true); setSchedErr('');
    const taskId = `quran-recite-${ids.passageId}-${date}-${schedTime}`;
    const title = `تسميع ${label}`;
    if (!(tasks ?? []).some(t => t.id === taskId)) onTasks([...(tasks ?? []), {id: taskId, title, period: 'daily', done: false, optional: false, scheduledDate: date, sourceLabel: 'مصحف الحفظ والإتقان', hifz: {passageId: ids.passageId, sessionId: session.id, surah, from, to, ...(tail.length ? {tail} : {})}}]);
    onTaskSchedules({...(taskSchedules ?? {}), [taskId]: {confirmedDate: date, confirmedTime: schedTime, title, sourceLabel: "مصحف الحفظ والإتقان", notifyEnabled: true}});
    const now = new Date().toISOString();
    const ok = commit(r => {
      const prev = r.schedules.find(x => x.passageId === ids.passageId);
      if (prev && prev.scheduledSessionId === session.id && prev.dueDate === date && prev.dueTime === schedTime) return r;
      const item = {...(prev ?? {passageId: ids.passageId, timezone: tz, intervalIndex: 0, lapses: 0, deferrals: [] as {date: string; reason: string}[]}), dueDate: date, dueTime: schedTime, scheduledSessionId: session.id, deferrals: [...(prev?.deferrals ?? []), {date, reason: 'recitation scheduled by learner'}], updatedAt: now};
      const more = tailIds.map(t => { const p = r.schedules.find(x => x.passageId === t.passageId); return {...(p ?? {passageId: t.passageId, timezone: tz, intervalIndex: 0, lapses: 0, deferrals: [] as {date: string; reason: string}[]}), dueDate: date, dueTime: schedTime, scheduledSessionId: t.sessionId, updatedAt: now}; });
      const merged = [prev ? item : item, ...more];
      const kept = r.schedules.filter(x => !merged.some(m => m.passageId === x.passageId));
      const interrupted = allIds().reduce((list, id) => { const ss = list.find(x => x.id === id.sessionId); return ss && !ss.endedAt ? upsert(list, interruptSession(ss)) : list; }, r.sessions);
      return {...r, sessions: interrupted, schedules: [...kept, ...merged], updatedAt: now};
    });
    setSchedBusy(false);
    if (!ok) { schedLock.current = false; setSchedErr('تعذر حفظ الموعد على هذا الجهاز. أعد المحاولة.'); return; }
    stopAudio();
    setSummary(`تمت جدولة التسميع يوم ${date} الساعة ${schedTime}. سيظهر في «مراجعة اليوم» عند موعده، وتبدأ منه جلسة التسميع لنفس المقطع.`);
    setStarted(false); setAsk(false); setSched(false); setPhase('entry'); schedLock.current = false;
  };
  const next = () => {
    if (!session || session.endedAt || stage === 'assess') return;
    stopAudio();
    if (rec.status === 'recording') recorder.current?.stop();
    commit(r => ({...r, sessions: allIds().reduce((list, id) => { const ss = list.find(x => x.id === id.sessionId); return ss && !ss.endedAt && ss.stage === session.stage ? upsert(list, advanceStage(ss)) : list; }, r.sessions)}));
  };
  const toggleHidden = () => {
    if (hidden && stage === 'recite') helpRef.current = [...helpRef.current, {kind: 'reveal_all', surah, at: new Date().toISOString()} as RecallHelpEvent];
    setHidden(h => !h);
  };
  const openSheet = () => { setRq(''); setDraft({from, to, settings}); setSheet(true); };
  const applySheet = () => {
    const cfg = {...draft.settings, passageRepeat: Math.max(1, draft.settings.passageRepeat), ayahRepeat: Math.max(1, draft.settings.ayahRepeat)};
    setSettings(cfg);
    if (draft.from !== from || draft.to !== to) {
      if (draft.to < draft.from || draft.from < 1 || draft.to > max) { notify('النطاق غير صحيح.'); return; }
      stopAudio();
      if (session && !session.endedAt) commit(r => ({...r, sessions: upsert(r.sessions, interruptSession(session))}));
      if (!begin(mode, false, {surah, from: draft.from, to: draft.to})) return;
      setSheet(false);
      setStatus('تغيّر المقطع وبدأت جلسة جديدة له. اضغط التشغيل.');
      return;
    }
    setSheet(false);
    void play(cfg);
  };
  const stepper = (key: 'ayahRepeat' | 'passageRepeat', title: string) => <div className="hf-field"><span>{title}</span><div className="hf-stepper">
    <button type="button" aria-label={`زيادة ${title}`} onClick={() => setDraft(d => ({...d, settings: {...d.settings, [key]: Math.min(50, d.settings[key] + 1)}}))}><Plus size={18}/></button>
    <b>{toArabicNumber(draft.settings[key])}</b>
    <button type="button" aria-label={`إنقاص ${title}`} onClick={() => setDraft(d => ({...d, settings: {...d.settings, [key]: Math.max(1, d.settings[key] - 1)}}))}><Minus size={18}/></button>
  </div></div>;
  const ayahOptions = Array.from({length: max}, (_, i) => i + 1);

  return <section className="hf-screen hf-reading" dir="rtl" aria-label="الحفظ على صفحة المصحف">
    <header className="hf-top">
      <button type="button" className="hf-icon-btn" aria-label="إغلاق الجلسة" onClick={leave}><X size={22}/></button>
      <strong className="hf-title">{segs.length > 2 ? `${surahInfo(asset, segs[0].surah)?.name} ← ${surahInfo(asset, segs[segs.length - 1].surah)?.name} (${toArabicNumber(segs.length)} سور)` : label}</strong>
      <span className="hf-top-actions">
        <button type="button" className="hf-icon-btn" aria-label={hidden ? 'إظهار النص' : 'إخفاء النص'} aria-pressed={hidden} onClick={toggleHidden}>{hidden ? <Eye size={20}/> : <EyeOff size={20}/>}</button>
        <button type="button" className={`hf-icon-btn${rec.status === 'recording' ? ' rec' : ''}`} aria-label={rec.status === 'recording' ? 'إيقاف التسجيل' : 'تسجيل التسميع'} onClick={() => void toggleRecord()}><Mic size={20}/></button>
        <button type="button" className="hf-icon-btn" aria-label="إعدادات التشغيل" onClick={openSheet}><Settings2 size={20}/></button>
      </span>
    </header>
    <div className="hf-pagearea">
    <article className="qm-card qm-mushaf-card hifz-page"
      onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={e => onTouchEnd(e.changedTouches[0].clientX)}>
      {activePage != null && <div className="qm-page-bar">
        <span>صفحة {toArabicNumber(activePage)} من المصحف{pageNums.length > 1 ? ` · ${toArabicNumber(safeIdx + 1)}/${toArabicNumber(pageNums.length)} من مقطعك` : ''}</span>
        <span className="qm-page-nav">
          <button type="button" aria-label="الصفحة السابقة" disabled={safeIdx <= 0} onClick={() => goPage(-1)}><ChevronRight size={18}/></button>
          <button type="button" aria-label="الصفحة التالية" disabled={safeIdx >= pageNums.length - 1} onClick={() => goPage(1)}><ChevronLeft size={18}/></button>
        </span>
      </div>}
      {pageLines ? <div className="qm-lines-scroll" dir="rtl"><div className="qm-lines" dir="rtl" ref={linesRef}>
        {pageLines.map((line, li) => {
          const f = line[0];
          const lastW = line[line.length - 1];
          const surahEnd = lastW.last && lastW.a === (surahInfo(asset, lastW.s)?.ayahs ?? -1);
          const head = f.a === 1 && f.w === 0;
          return <div key={li} className="qm-line-wrap">
            {head && <div className="qm-surah-head"><span className="mf-surah-band-inner">سُورَةُ {surahInfo(asset, f.s)?.name ?? ''}</span></div>}
            {head && showsBasmala(f.s) && basmala && <div className="qm-basmala-line">{basmala}</div>}
            <div className={`qm-line${surahEnd || activePage === 1 ? ' qm-line-center' : ''}`}>
              {line.map(word => <span key={`${word.a}:${word.w}`} className={wordClass(word.s, word.a)} onClick={() => onWordTap(word.s, word.a)}>
                <span className="qm-w-text">{word.text}</span>{word.last && <span className="quran-verse-marker">{word.marker}</span>}
              </span>)}
            </div>
          </div>;
        })}
      </div></div> : <p className="qm-mushaf-flow" dir="rtl">
        {asset.verses.filter(v => v.p === activePage).map(v => <span key={`${v.s}:${v.a}`} className="qm-verse-inline">
          {verseBody(v.t).split(/\s+/).filter(Boolean).map((w, i) => <span key={i} className={wordClass(v.s, v.a)} onClick={() => onWordTap(v.s, v.a)}><span className="qm-w-text">{w}</span>{' '}</span>)}
          <span className="quran-verse-marker">{verseMarker(v.t) || `۝${toArabicNumber(v.a)}`}</span>{' '}
        </span>)}
      </p>}
    </article>
      {status && <p className="hf-status" role="status">{status}</p>}
      {rec.status === 'denied' && <p role="alert" className="qm-error">لم يُسمح بالميكروفون. فعّله من إعدادات الهاتف.</p>}
    </div>
    {tip && <button type="button" className="hf-scrim" aria-label="إغلاق الشرح" onClick={() => setTip(false)}/>}
    <footer className="hf-bottom">
      {rec.status === 'stopped' && rec.url && <div className="hf-rec">
        <audio controls src={rec.url}/>
        <div><button type="button" onClick={() => void saveLocalRecording()}>حفظ التسجيل على الجهاز</button><button type="button" onClick={() => recorder.current?.discard('dismissed')}>حذف المؤقت</button></div>
      </div>}
      <div className="hf-strip">
        {stage === 'assess' ? <div className="hf-assess"><strong>{stepTitle}: كيف كان استرجاعك؟</strong><div>{ASSESSMENT_LABELS.map(l => <button key={l.value} type="button" onClick={() => finish(l.value)}>{l.label}</button>)}</div></div> : <>
          {stage === 'understand'
            ? <button type="button" className="hf-step" onClick={() => setListSheet(true)}><BookOpen size={26}/><span>الذهاب إلى التفسير</span></button>
            : stage === 'recite'
              ? <div className="hf-step hf-recite"><span>{stepTitle}</span><button type="button" className="hf-chip" aria-pressed={hidden} onClick={toggleHidden}>{hidden ? <Eye size={18}/> : <EyeOff size={18}/>}{hidden ? 'إظهار الآيات' : 'إخفاء الآيات'}</button><button type="button" className="hf-chip" onClick={() => void toggleRecord()}><Mic size={18}/>{rec.status === 'recording' ? 'إيقاف' : 'تسجيل'}</button></div>
              : stage === 'memorize'
                ? <div className="hf-step hf-counter"><button type="button" className="hf-plus" aria-label="عدّ تكرارًا" onClick={() => setReps(n => n + 1)}><Plus size={22}/></button><i/><span>{stepTitle} ({toArabicNumber(reps)})</span></div>
                : <button type="button" className="hf-step" aria-pressed={playing} aria-haspopup={playing ? undefined : 'dialog'} onClick={() => { if (playing) void play(); else openSheet(); }}>{playing ? <Square size={22}/> : <Play size={24}/>}<i/><span>{stepTitle}{stepCount}</span></button>}
          <button type="button" className="hf-next" onClick={next}>التالي</button>
        </>}
      </div>
      {tip && <div className="hf-tip" role="note"><i/><h3>{stage === 'understand' ? 'التفسير' : STEP_LABEL[stage]}</h3><p>{STEP_TIP[stage]}</p></div>}
    </footer>

    {ask && stage === 'recite' && <div className="hf-sheet-wrap" role="dialog" aria-modal="true" aria-label="هل تريد التسميع الآن؟">
      <div className="hf-sheet-scrim"/>
      <div className="hf-sheet hf-ask">
        {!sched ? <>
          <h3>هل تريد التسميع الآن؟</h3>
          <p>سمّع المقطع من حفظك بعد الخطوات السابقة، أو حدّد موعدًا يناسبك.</p>
          <button type="button" className="hf-ok" onClick={() => setAsk(false)}>نعم، ابدأ التسميع</button>
          <button type="button" className="hf-ghost" onClick={() => { setSched(true); setSchedDate(dayKey(1)); }}>لا، جدولة التسميع</button>
        </> : <>
          <h3>جدولة التسميع</h3>
          <p className="hf-list-sub">{label}</p>
          <div className="hf-speeds">{[['اليوم', 0], ['غدًا', 1], ['بعد ٣ أيام', 3], ['بعد أسبوع', 7]].map(([n, o]) => <button key={n as string} type="button" className={schedDate === dayKey(o as number) ? 'on' : ''} onClick={() => setSchedDate(dayKey(o as number))}>{n}</button>)}</div>
          <div className="hf-pair">
            <label className="hf-field"><span>اليوم</span><input type="date" min={dayKey(0)} value={schedDate} onChange={e => setSchedDate(e.target.value)}/></label>
            <label className="hf-field"><span>الوقت</span><input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}/></label>
          </div>
          {schedErr && <p role="alert" className="qm-error">{schedErr}</p>}
          <button type="button" className="hf-ok" disabled={schedBusy} onClick={confirmSchedule}>تأكيد الجدولة</button>
          <button type="button" className="hf-ghost" onClick={() => setSched(false)}>رجوع</button>
        </>}
      </div>
    </div>}

    {sheet && <div className="hf-sheet-wrap" role="dialog" aria-modal="true" aria-label="إعدادات التشغيل">
      <button type="button" className="hf-sheet-scrim" aria-label="إغلاق" onClick={() => setSheet(false)}/>
      <div className="hf-sheet">
        <button type="button" className="hf-icon-btn hf-sheet-x" aria-label="إغلاق" onClick={() => setSheet(false)}><X size={26}/></button>
        <p className="hf-sheet-surah">{surahInfo(asset, surah)?.name}</p>
        <div className="hf-pair">
          <div className="hf-field"><span>من الآية</span><select disabled={tail.length > 0} value={draft.from} onChange={e => { const v = Number(e.target.value); setDraft(d => ({...d, from: v, to: Math.max(d.to, v)})); }}>{ayahOptions.map(n => <option key={n} value={n}>{n}</option>)}</select></div>
          <div className="hf-field"><span>إلى الآية</span><select disabled={tail.length > 0} value={draft.to} onChange={e => setDraft(d => ({...d, to: Number(e.target.value)}))}>{ayahOptions.filter(n => n >= draft.from).map(n => <option key={n} value={n}>{n}</option>)}</select></div>
        </div>
        <div className="hf-pair">{stepper('ayahRepeat', 'تكرار الآية')}{stepper('passageRepeat', 'تكرار المقطع')}</div>
        <div className="hf-field hf-full">
          <span>طريقة التكرار والربط</span>
          <div className="hf-seg" role="radiogroup" aria-label="طريقة التكرار والربط">
            <button type="button" role="radio" aria-checked={draft.settings.playMode === 'standard'} className={draft.settings.playMode === 'standard' ? 'on' : ''} onClick={() => setDraft(d => ({...d, settings: {...d.settings, playMode: 'standard'}}))}>كل آية ثم التالية</button>
            <button type="button" role="radio" aria-checked={draft.settings.playMode === 'cumulative'} className={draft.settings.playMode === 'cumulative' ? 'on' : ''} onClick={() => setDraft(d => ({...d, settings: {...d.settings, playMode: 'cumulative'}}))}>آية ثم ربط تراكمي</button>
          </div>
          {draft.settings.playMode === 'cumulative' && <small className="hf-rnote">
            {formatCumulativePreview(
              tail.length > 0 ? verses.map(v => v.a) : Array.from({length: Math.max(0, draft.to - draft.from + 1)}, (_, i) => draft.from + i),
              draft.settings.ayahRepeat,
              toArabicNumber,
            )}
          </small>}
        </div>
        <div className="hf-field hf-full hf-reciter"><span>اختر المقرئ ({toArabicNumber(VERSE_RECITERS.length)} قارئًا · رواية حفص عن عاصم)</span>
          <input type="search" className="hf-rsearch" aria-label="ابحث عن قارئ بالاسم" placeholder="ابحث عن قارئ بالاسم" value={rq} onChange={e => setRq(e.target.value)}/>
          <select aria-label="القارئ" value={draft.settings.reciterId} onChange={e => setDraft(d => ({...d, settings: {...d.settings, reciterId: Number(e.target.value)}}))}>
            {(() => { const cur = verseReciterById(draft.settings.reciterId); const list = searchVerseReciters(rq); const shown = cur && !list.includes(cur) ? [cur, ...list] : list; return shown.length ? shown.map(r => <option key={r.id} value={r.id}>{verseReciterLabel(r)}</option>) : <option value="" disabled>لا يوجد قارئ بهذا الاسم</option>; })()}
          </select>
          <small className="hf-rnote">{(() => { const cur = verseReciterById(draft.settings.reciterId); return cur ? `الصوت آية بآية من ${cur.source === 'qurancom' ? 'Quran.com' : 'EveryAyah.com'} · ${cur.riwaya}` : ''; })()}{rq ? (searchVerseReciters(rq).length === 0 ? ' · لا يوجد قارئ بهذا الاسم' : ` · ${toArabicNumber(searchVerseReciters(rq).length)} نتيجة`) : ''}</small>
        </div>
        <div className="hf-field hf-full"><span>سرعة التشغيل</span><div className="hf-speeds">{SPEEDS.map(v => <button key={v} type="button" aria-pressed={draft.settings.speed === v} className={draft.settings.speed === v ? 'on' : ''} onClick={() => setDraft(d => ({...d, settings: {...d.settings, speed: v}}))}>{v.toFixed(v === 1 ? 1 : v === 0.75 || v === 1.25 || v === 1.75 ? 2 : 1).replace(/0$/, v === 1 ? '0' : '')}x</button>)}</div></div>
        <label className="hf-follow"><input type="checkbox" checked={draft.settings.follow} onChange={e => setDraft(d => ({...d, settings: {...d.settings, follow: e.target.checked}}))}/> تتبع القارئ بقلب الصفحات تلقائيًا</label>
        {passageRecordings.length > 0 && <div className="hf-saved"><h3>تسجيلاتي المحفوظة لهذا المقطع</h3>
          {passageRecordings.map(meta => <div className="qm-passage" key={meta.id}>
            <span>{new Date(meta.createdAt).toLocaleString('ar-EG')} · {toArabicNumber(Math.round(meta.durationMs / 1000))} ثانية</span>
            <button type="button" onClick={() => void readRecording(meta.id).then(v => { if (v) setSavedUrl(URL.createObjectURL(v.blob)); else notify('ملف التسجيل غير موجود على هذا الجهاز.'); }).catch(() => notify('تعذر فتح التسجيل المحلي.'))}>استماع</button>
            <button type="button" onClick={() => void deleteRecording(meta.id).then(() => { setSavedUrl(''); commit(r => ({...r, recordings: r.recordings.filter(x => x.id !== meta.id)})); }).catch(() => notify('تعذر حذف التسجيل. أعد المحاولة.'))}>حذف</button>
          </div>)}
          {savedUrl && <audio controls src={savedUrl} aria-label="تسجيل محفوظ محليًا"/>}
        </div>}
        <button type="button" className="hf-ok" onClick={applySheet}>تشغيل</button>
      </div>
    </div>}

    {listSheet && <div className="hf-sheet-wrap" role="dialog" aria-modal="true" aria-label="اختر التفسير أو الترجمة">
      <button type="button" className="hf-sheet-scrim" aria-label="إغلاق" onClick={() => setListSheet(false)}/>
      <div className="hf-sheet hf-list">
        <h3>اختر التفسير</h3>
        <p className="hf-list-sub">{segs[uSeg] ? referenceLabel(asset, segs[uSeg].surah, segs[uSeg].from, segs[uSeg].to) : label}</p>
        {segs.length > 1 && <div className="hf-speeds">{segs.map((g, i) => <button key={i} type="button" className={uSeg === i ? 'on' : ''} onClick={() => setUSeg(i)}>{surahInfo(asset, g.surah)?.name}</button>)}</div>}
        <div className="hf-list-group">التفاسير (عربي)</div>
        {TAFSIRS.map(t => <button key={`t${t.id}`} type="button" className="hf-list-row" aria-current={source?.topic === 'tafsir' && source.id === t.id} onClick={() => { setSource({topic: 'tafsir', id: t.id}); setListSheet(false); setUnderstandAyah(segs[uSeg]?.from ?? from); }}><span>{t.name}</span>{source?.topic === 'tafsir' && source.id === t.id && <b>✓</b>}</button>)}
        <div className="hf-list-group">الترجمات (إنجليزي)</div>
        {TRANSLATIONS.map(t => <button key={`r${t.id}`} type="button" className="hf-list-row" aria-current={source?.topic === 'translation' && source.id === t.id} onClick={() => { setSource({topic: 'translation', id: t.id}); setListSheet(false); setUnderstandAyah(segs[uSeg]?.from ?? from); }}><span>{t.name}</span>{source?.topic === 'translation' && source.id === t.id && <b>✓</b>}</button>)}
      </div>
    </div>}
    {understandAyah != null && <UnderstandingSheet surah={segs[uSeg]?.surah ?? surah} surahName={surahInfo(asset, segs[uSeg]?.surah ?? surah)?.name} ayahStart={understandAyah} ayahEnd={segs[uSeg]?.to ?? to}
      initialTopic={source?.topic} initialTafsirId={source?.topic === 'tafsir' ? source.id : undefined} initialTranslationId={source?.topic === 'translation' ? source.id : undefined}
      verseText={(s, a) => asset.verses.find(v => v.s === s && v.a === a)?.t ?? null} onClose={() => setUnderstandAyah(null)}/>}
  </section>;
}
