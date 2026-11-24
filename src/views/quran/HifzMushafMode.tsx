import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Eye, EyeOff, Mic, Play, Square} from 'lucide-react';
import type {QuranAsset} from '../../quran/types';
import {basmalaText, referenceLabel, showsBasmala, surahInfo, toArabicNumber, verseBody, verseMarker} from '../../quran/content';
import {selectRange, SESSION_RECITERS} from '../../quran-mastery/services';
import {sessionAudio} from '../../quran/audio-adapter';
import {createBrowserRecorder, type SessionRecorder} from '../../quran-mastery/recorder';
import {buildPageLines, loadPageLines, type LineStart} from './MasteryWorkspace';
import UnderstandingSheet from './UnderstandingSheet';
import {uid} from '../../id';
import {loadMasteryState, saveMasteryState} from '../../quran-mastery/storage';
import {advanceStage, applyAssessment, createRecallAttempt, createSession, interruptSession} from '../../quran-mastery/engine';
import {deleteRecording, readRecording, saveRecording} from '../../quran-mastery/recording-store';
import {ASSESSMENT_LABELS, MASTERY_SCHEMA_VERSION, MASTERY_STATES} from '../../quran-mastery/types';
import type {MasterySession, MasteryStateRoot, RecallHelpEvent} from '../../quran-mastery/types';

// واجهة الحفظ الجديدة: الصفحة الكاملة من المصحف أولًا، وتحتها ثلاثة أزرار: إخفاء/إظهار، تشغيل القارئ، تسجيل التسميع.
// لا تغيّر نص القرآن ولا بيانات الإتقان القديمة؛ الوضع المفصّل ما زال متاحًا.

type Mode = 'new' | 'recite' | 'understand' | 'review';
type Settings = {passageRepeat: number; ayahRepeat: number; reciterId: number; speed: number; follow: boolean};
type Ids = {passageId: string; sessionId: string};
type Saved = {mode: Mode; ids?: Ids | null; surah: number; from: number; to: number; page: number; started: boolean; settings: Settings};

const KEY = 'rabbani-hifz-mushaf-v1';
export const PENDING_RANGE_KEY = 'rabbani-hifz-pending-range-v1';
const MODES: {id: Mode; label: string; hint: string}[] = [
  {id: 'new', label: 'حفظ جديد', hint: 'استمع وكرر والنص ظاهر.'},
  {id: 'recite', label: 'تسميع من الحفظ', hint: 'النص مخفي؛ سمّع ثم اضغط إظهار للمقارنة.'},
  {id: 'understand', label: 'فهم', hint: 'اضغط أي آية في مقطعك لفتح التفسير ومعاني الكلمات.'},
  {id: 'review', label: 'مراجعة', hint: 'راجع مقطعًا سبق حفظه بنص مخفي.'},
];
const DEFAULT_SETTINGS: Settings = {passageRepeat: 1, ayahRepeat: 3, reciterId: SESSION_RECITERS[0].id, speed: 1, follow: true};

const readSaved = (): Saved | null => {
  try {
    const pending = localStorage.getItem(PENDING_RANGE_KEY);
    if (pending) {
      localStorage.removeItem(PENDING_RANGE_KEY);
      const r = JSON.parse(pending) as {surah: number; ayahStart: number; ayahEnd: number};
      if (r && typeof r.surah === 'number') return {mode: 'review', surah: r.surah, from: r.ayahStart, to: r.ayahEnd, page: 0, started: false, settings: DEFAULT_SETTINGS};
    }
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    if (!v || typeof v.surah !== 'number') return null;
    return {...v, settings: {...DEFAULT_SETTINGS, ...(v.settings ?? {})}};
  } catch { return null; }
};

type Props = {asset: QuranAsset; notify: (text: string) => void; onDetailed?: () => void};
const upsert = <T extends {id: string}>(list: T[], item: T) => [...list.filter(v => v.id !== item.id), item];

export default function HifzMushafMode({asset, notify, onDetailed}: Props) {
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
  const [root, setRoot] = useState<MasteryStateRoot>(() => loadMasteryState());
  useEffect(() => {
    // يثبت شريط الأدوات أسفل الشاشة فقط حين تكون صفحة المقطع المفتوحة ظاهرة
    const update = () => {
      const page = document.querySelector('.hifz-page');
      const bar = document.querySelector('.hifz-actions');
      if (!page || !bar) return;
      const r = page.getBoundingClientRect();
      const natural = r.bottom - 8;
      const visible = r.top < window.innerHeight - 200 && r.bottom > 160 && natural > window.innerHeight - 76;
      bar.classList.toggle('hifz-actions-docked', visible);
    };
    const t = window.setInterval(update, 250);
    window.addEventListener('scroll', update, {passive: true});
    window.addEventListener('resize', update);
    update();
    return () => { window.clearInterval(t); window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  const rootRef = useRef(root);
  const helpRef = useRef<RecallHelpEvent[]>([]);
  const [assessing, setAssessing] = useState(false);
  const [summary, setSummary] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const lastRecordingId = useRef<string | undefined>(undefined);
  const commit = (fn: (r: MasteryStateRoot) => MasteryStateRoot) => {
    const next = fn(rootRef.current);
    try { saveMasteryState(next, rootRef.current); rootRef.current = next; setRoot(next); return true; }
    catch { notify('تعذر الحفظ على الجهاز. لم يُسجّل التغيير.'); return false; }
  };
  const [openSettings, setOpenSettings] = useState(false);
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

  const max = asset.surahs.find(s => s.n === surah)?.ayahs ?? 1;
  const verses = useMemo(() => (started ? selectRange(asset, {surah, ayahStart: from, ayahEnd: to}) : []), [asset, started, surah, from, to]);
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
    try { localStorage.setItem(KEY, JSON.stringify({mode, ids, surah, from, to, page: safeIdx, started: true, settings})); } catch { /* ignore */ }
  }, [started, mode, ids, surah, from, to, safeIdx, settings]);

  const pageLines = useMemo(() => (activePage == null || !lineData ? null : buildPageLines(asset, lineData[String(activePage)])), [asset, lineData, activePage]);
  useLayoutEffect(() => {
    const box = linesRef.current;
    if (!box) return;
    const fit = () => {
      const host = box.parentElement;
      if (!host) return;
      let fs = 24;
      box.style.fontSize = `${fs}px`;
      while (box.scrollWidth > host.clientWidth + 1 && fs > 15) { fs -= 0.5; box.style.fontSize = `${fs}px`; }
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(box);
    void document.fonts?.ready.then(fit);
    return () => ro?.disconnect();
  }, [pageLines, activePage]);

  const stopAudio = () => { generation.current++; sessionAudio.cancel(); setPlaying(false); setPlayingAyah(null); };

  const begin = (nextMode: Mode, resume = false) => {
    if (!resume) {
      if (!selectRange(asset, {surah, ayahStart: from, ayahEnd: to}).length || from < 1 || to > max || to < from) {
        setValidation(`اختر نطاقًا صحيحًا من ١ إلى ${toArabicNumber(max)}، والنهاية بعد البداية.`);
        return;
      }
      setPageIdx(0);
    }
    setValidation('');
    setMode(nextMode);
    setHidden(nextMode === 'recite' || nextMode === 'review');
    setSummary('');
    setAssessing(false);
    helpRef.current = [];
    const liveSession = sessionOf();
    if (!(resume && ids && liveSession && !liveSession.endedAt)) {
      // كل جلسة صفحة كاملة تُسجَّل في نظام الإتقان نفسه: مقطع + جلسة (تقييم ذاتي فقط، بلا إتقان آلي).
      const range = {surah, ayahStart: from, ayahEnd: to};
      const now = new Date().toISOString();
      const existing = rootRef.current.passages.find(p => p.range.surah === range.surah && p.range.ayahStart === range.ayahStart && p.range.ayahEnd === range.ayahEnd);
      const passageId = existing?.id ?? uid();
      const session = createSession({purpose: nextMode === 'review' ? 'revision' : 'new', passageId, range, newId: uid});
      const ok = commit(r => ({...r, passages: existing ? r.passages : [...r.passages, {id: passageId, range, order: 0, schemaVersion: MASTERY_SCHEMA_VERSION, createdAt: now, updatedAt: now}], sessions: [...r.sessions, session], updatedAt: now}));
      if (!ok) return;
      setIds({passageId, sessionId: session.id});
    }
    setStarted(true);
  };

  const sessionOf = (): MasterySession | undefined => rootRef.current.sessions.find(x => x.id === ids?.sessionId);
  const leave = () => {
    stopAudio();
    recorder.current?.discard('exit');
    const session = sessionOf();
    if (session && !session.endedAt) commit(r => ({...r, sessions: upsert(r.sessions, interruptSession(session))}));
    setIds(null);
    setStarted(false);
  };
  const finish = (label: typeof ASSESSMENT_LABELS[number]['value']) => {
    const session = sessionOf();
    if (!session || !ids) return;
    stopAudio();
    const attempt = {...createRecallAttempt({sessionId: session.id, range: session.range, hideMode: mode === 'recite' || mode === 'review' ? 'E' : 'B', newId: uid}), helpEvents: helpRef.current, recordingId: lastRecordingId.current, completedAt: new Date().toISOString()};
    let message = '';
    const ok = commit(r => {
      const result = applyAssessment({...r, recallAttempts: [...r.recallAttempts, attempt]}, {passageId: ids.passageId, attemptId: attempt.id, label, newId: uid});
      let closed: MasterySession = session;
      while (closed.stage !== 'assess' && !closed.endedAt) closed = advanceStage(closed);
      closed = advanceStage(closed);
      message = `أتممت الجلسة · تقييمك: ${ASSESSMENT_LABELS.find(x => x.value === label)?.label}. الحالة: ${MASTERY_STATES.find(x => x.value === result.outcome.projection.state)?.label}. المراجعة: ${result.outcome.schedule.dueDate}.`;
      return {...result.root, sessions: upsert(result.root.sessions, closed)};
    });
    if (!ok) return;
    recorder.current?.discard('finished');
    setIds(null);
    setAssessing(false);
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

  const chooseMode = (next: Mode) => {
    stopAudio();
    setMode(next);
    setHidden(next === 'recite' || next === 'review');
    setOpenSettings(true);
  };

  const goPage = (delta: number) => setPageIdx(i => Math.min(pageNums.length - 1, Math.max(0, i + delta)));

  const play = async () => {
    if (playing) { stopAudio(); setStatus('توقف التشغيل.'); return; }
    if (!verses.length) return;
    const token = ++generation.current;
    setPlaying(true);
    try {
      for (let p = 0; p < settings.passageRepeat; p++) {
        for (const verse of verses) {
          for (let a = 0; a < settings.ayahRepeat; a++) {
            if (token !== generation.current) return;
            setPlayingAyah(verse.a);
            if (settings.follow) { const idx = pageNums.indexOf(verse.p); if (idx >= 0) setPageIdx(idx); }
            setStatus(`الآية ${toArabicNumber(verse.a)} · تكرار الآية ${toArabicNumber(a + 1)}/${toArabicNumber(settings.ayahRepeat)} · المقطع ${toArabicNumber(p + 1)}/${toArabicNumber(settings.passageRepeat)}`);
            const result = await sessionAudio.playVerse({reciterId: settings.reciterId, surah: verse.s, ayah: verse.a, title: referenceLabel(asset, verse.s, verse.a, verse.a), playbackRate: settings.speed});
            if (token !== generation.current || result === 'cancelled') return;
            if (result !== 'ended') {
              setStatus(result === 'missing' ? 'الصوت غير متاح الآن. تحقق من الاتصال وأعد المحاولة.' : result === 'rejected-narration' ? 'هذا القارئ غير متوافق مع نص حفص المعروض.' : 'تعذر تشغيل التلاوة. لم نتجاوز الآية.');
              stopAudio();
              return;
            }
          }
        }
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
    return `qm-w${inRange ? '' : ' qm-verse-context'}${inRange && hidden ? ' is-hidden' : ''}${playingAyah === a && inRange ? ' qm-verse-playing' : ''}`;
  };
  const onWordTap = (s: number, a: number) => {
    if (mode === 'understand' && rangeKeys.has(`${s}:${a}`)) setUnderstandAyah(a);
  };

  if (!started) {
    return <section className="qm-workspace hifz-entry" dir="rtl" aria-label="مصحف الحفظ والإتقان">
      <header className="qm-heading"><span className="qm-kicker">مصحف الحفظ والإتقان</span><h2>ماذا تريد اليوم؟</h2></header>
      {summary && <div className="qm-notice" role="status">{summary}</div>}
      <div className="hifz-entry-actions">
        <button type="button" className="primary" onClick={() => begin('review')}>مراجعة</button>
        <button type="button" className="primary" onClick={() => begin('new')}>حفظ جديد</button>
        {saved?.started && <button type="button" className="soft-btn" onClick={() => { setSurah(saved.surah); setFrom(saved.from); setTo(saved.to); setPageIdx(saved.page); begin(saved.mode, true); }}>
          استئناف: {referenceLabel(asset, saved.surah, saved.from, saved.to)}
        </button>}
        {onDetailed && <button type="button" className="soft-btn" onClick={onDetailed}>الجلسة المفصّلة بالخطوات</button>}
      </div>
      <div className="qm-card">
        <h3>اختر السورة ومدى الآيات</h3>
        <div className="qm-grid">
          <label>السورة<select value={surah} onChange={e => { const n = Number(e.target.value); setSurah(n); setFrom(1); setTo(Math.min(3, asset.surahs.find(s => s.n === n)?.ayahs ?? 1)); }}>
            {asset.surahs.map(s => <option key={s.n} value={s.n}>{toArabicNumber(s.n)}. {s.name}</option>)}
          </select></label>
          <label>من الآية<input type="number" min={1} max={max} value={from} onChange={e => setFrom(Number(e.target.value))}/></label>
          <label>إلى الآية<input type="number" min={from} max={max} value={to} onChange={e => setTo(Number(e.target.value))}/></label>
        </div>
        {validation && <p role="alert" className="qm-error">{validation}</p>}
        <p className="qm-muted">بعد الضغط على «مراجعة» أو «حفظ جديد» تُفتح الصفحة الكاملة التي فيها آياتك، وتنتقل تلقائيًا للصفحة التالية إن امتد المقطع.</p>
      </div>
    </section>;
  }

  const modeInfo = MODES.find(m => m.id === mode)!;
  return <section className="qm-workspace hifz-mushaf" dir="rtl" aria-label="الحفظ على صفحة المصحف">
    <header className="qm-heading hifz-head">
      <button type="button" className="soft-btn" onClick={leave}>تغيير المقطع</button>
      <strong>{referenceLabel(asset, surah, from, to)}</strong>
    </header>

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

    <div className="hifz-actions" role="group" aria-label="أدوات المقطع">
      <button type="button" className="soft-btn" aria-pressed={hidden} onClick={() => { if (hidden && (mode === 'recite' || mode === 'review')) helpRef.current = [...helpRef.current, {kind: 'reveal_all', surah, at: new Date().toISOString()} as RecallHelpEvent]; setHidden(h => !h); }}>
        {hidden ? <Eye size={17}/> : <EyeOff size={17}/>} {hidden ? 'إظهار' : 'إخفاء'}
      </button>
      <button type="button" className={playing ? 'soft-btn selected' : 'primary'} aria-pressed={playing} onClick={() => void play()}>
        {playing ? <Square size={16}/> : <Play size={16}/>} {playing ? 'إيقاف' : 'تشغيل القارئ'}
      </button>
      <button type="button" className={rec.status === 'recording' ? 'soft-btn selected' : 'soft-btn'} onClick={() => void toggleRecord()}>
        <Mic size={16}/> {rec.status === 'recording' ? 'إيقاف التسجيل' : 'تسجيل التسميع'}
      </button>
    </div>
    {status && <p className="qm-muted hifz-status" role="status">{status}</p>}
    {rec.status === 'stopped' && rec.url && <div className="qm-card hifz-rec">
      <audio controls src={rec.url}/>
      <div className="qm-chips"><button type="button" onClick={() => void saveLocalRecording()}>حفظ التسجيل على الجهاز</button><button type="button" onClick={() => recorder.current?.discard('dismissed')}>حذف المؤقت</button></div>
      <small>غير محفوظ حتى تضغط «حفظ». لا يُرفع أبدًا ويُحذف المؤقت عند المغادرة.</small>
    </div>}
    {passageRecordings.length > 0 && <div className="qm-card hifz-saved-recs"><h3>تسجيلاتي المحفوظة لهذا المقطع</h3>
      {passageRecordings.map(meta => <div className="qm-passage" key={meta.id}>
        <span>{new Date(meta.createdAt).toLocaleString('ar-EG')} · {toArabicNumber(Math.round(meta.durationMs / 1000))} ثانية</span>
        <button type="button" onClick={() => void readRecording(meta.id).then(v => { if (v) setSavedUrl(URL.createObjectURL(v.blob)); else notify('ملف التسجيل غير موجود على هذا الجهاز.'); }).catch(() => notify('تعذر فتح التسجيل المحلي.'))}>استماع</button>
        <button type="button" onClick={() => void deleteRecording(meta.id).then(() => { setSavedUrl(''); commit(r => ({...r, recordings: r.recordings.filter(x => x.id !== meta.id)})); }).catch(() => notify('تعذر حذف التسجيل. أعد المحاولة.'))}>حذف</button>
      </div>)}
      {savedUrl && <audio controls src={savedUrl} aria-label="تسجيل محفوظ محليًا"/>}
    </div>}
    {rec.status === 'denied' && <p role="alert" className="qm-error">لم يُسمح بالميكروفون. فعّله من إعدادات الهاتف.</p>}

    <nav className="qm-chips hifz-modes" aria-label="أنماط الحفظ">
      {MODES.map(m => <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => chooseMode(m.id)}>{m.label}</button>)}
    </nav>
    <p className="qm-muted small">{modeInfo.hint}</p>

    {openSettings && <div className="qm-card hifz-settings">
      <h3>إعدادات «{modeInfo.label}»</h3>
      <div className="qm-grid">
        <label>السورة<select value={surah} onChange={e => { stopAudio(); const n = Number(e.target.value); setSurah(n); setFrom(1); setTo(Math.min(3, asset.surahs.find(s => s.n === n)?.ayahs ?? 1)); setPageIdx(0); }}>
          {asset.surahs.map(s => <option key={s.n} value={s.n}>{toArabicNumber(s.n)}. {s.name}</option>)}
        </select></label>
        <label>من الآية<input type="number" min={1} max={max} value={from} onChange={e => { stopAudio(); const v = Math.min(max, Math.max(1, Number(e.target.value) || 1)); setFrom(v); if (to < v) setTo(v); setPageIdx(0); }}/></label>
        <label>إلى الآية<input type="number" min={from} max={max} value={to} onChange={e => { stopAudio(); setTo(Math.min(max, Math.max(from, Number(e.target.value) || from))); setPageIdx(0); }}/></label>
        <label>تكرار المقطع<input type="number" min={1} max={50} value={settings.passageRepeat} onChange={e => setSettings(s => ({...s, passageRepeat: Math.min(50, Math.max(1, Number(e.target.value) || 1))}))}/></label>
        <label>تكرار كل آية<input type="number" min={1} max={50} value={settings.ayahRepeat} onChange={e => setSettings(s => ({...s, ayahRepeat: Math.min(50, Math.max(1, Number(e.target.value) || 1))}))}/></label>
        <label>القارئ<select value={settings.reciterId} onChange={e => setSettings(s => ({...s, reciterId: Number(e.target.value)}))}>
          {SESSION_RECITERS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select></label>
        <label>سرعة التلاوة<select value={settings.speed} onChange={e => setSettings(s => ({...s, speed: Number(e.target.value)}))}>
          {[0.75, 1, 1.25, 1.5].map(v => <option key={v} value={v}>{toArabicNumber(v)}×</option>)}
        </select></label>
        <label>تتبع الصفحات<select value={settings.follow ? 'auto' : 'manual'} onChange={e => setSettings(s => ({...s, follow: e.target.value === 'auto'}))}>
          <option value="auto">تلقائي مع القارئ</option><option value="manual">يدوي (أقلب بنفسي)</option>
        </select></label>
      </div>
    </div>}

    <div className="qm-card hifz-finish">
      {!assessing ? <button type="button" className="qm-primary primary" onClick={() => setAssessing(true)}>أنهيت، قيّم استرجاعي</button> : <>
        <h3>كيف كان استرجاعك؟</h3>
        <p className="qm-muted">تقييم ذاتي يُسجَّل في خططك وإنجازك. «متقن» لا يمنح الإتقان فورًا؛ يلزم استرجاع متباعد بلا مساعدة.{helpRef.current.length > 0 ? ' سُجّلت مساعدة (إظهار النص) في هذه المحاولة.' : ''}</p>
        <div className="qm-chips">{ASSESSMENT_LABELS.map(l => <button key={l.value} type="button" onClick={() => finish(l.value)}>{l.label}</button>)}</div>
        <button type="button" className="soft-btn" onClick={() => setAssessing(false)}>رجوع</button>
      </>}
    </div>
    {understandAyah != null && <UnderstandingSheet surah={surah} surahName={surahInfo(asset, surah)?.name} ayahStart={understandAyah} ayahEnd={to}
      verseText={(s, a) => asset.verses.find(v => v.s === s && v.a === a)?.t ?? null} onClose={() => setUnderstandAyah(null)}/>}
  </section>;
}
