import {attributionLabel} from './UnderstandingSheet';
// «المصحف الشريف» بترتيب صفحات المصحف (٦٠٤ صفحة): تمرير رأسي متصل،
// بحدود الصفحات وأرقامها وأسماء السور ومواضع الأجزاء والأحزاب.
// النص من أصل معتمد محلي، ولا يُعدّل حرف منه.
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Bookmark, BookmarkCheck, ChevronLeft, Copy, Loader2, Pause, Play, Search,
  Share2, Square, StickyNote, Trash2, X, WifiOff, BookOpen, TrendingUp, CheckCircle2, Users
} from 'lucide-react';
import type {QuranAsset, QuranLearningState, QuranVerse} from '../../quran/types';
import {
  showsBasmala, surahInfo, toArabicNumber, verseBody, verseMarker,
  searchVerses, basmalaText
} from '../../quran/content';
import {TRANSLATIONS, TAFSIRS, fetchTafsir, fetchTranslation, tafsirProviderLabel, type FetchState} from '../../quran/content-api';
import {
  audioUrl, defaultMoshaf, loadReciters, moshafCategory, type Reciter, type ReciterMoshaf
} from '../../quran/audio';
import {
  DEFAULT_MP3QURAN_RECITER_ID, resolveSingleAyahUrl
} from '../../quran/ayah-audio';
import {
  getSelectedReciterPref, isSurahOfflineDownloaded, offlineTrackId, saveSelectedReciterPref
} from '../../quran/offline-audio';
import RecitersAudioLibrary from './RecitersAudioLibrary';
import {backgroundAudio} from '../../audio/background-player';
import {useBackgroundAudio} from '../../audio/useBackgroundAudio';
import type {AudioTrack} from '../../audio/types';
import {InternetBadge, useOnline} from '../../online';
import {copyText, shareText} from './ui';
import {useBackHandler} from '../../navigation/useBackHandler';


const AUTO_SCROLL_SPEEDS = [
  {value: 90, label: 'بطيء جدًا'},
  {value: 180, label: 'بطيء'},
  {value: 360, label: 'متوسط'},
  {value: 700, label: 'سريع'},
  {value: 1200, label: 'الأسرع'},
];

const TOOLBAR_OFFSET = 92;

type Props = {
  asset: QuranAsset;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  notify: (text: string) => void;
  autoPlayToken?: number;
};

type PageBlock = {page: number; verses: QuranVerse[]};

export default function MushafPages({asset, state, onState, notify, autoPlayToken = 0}: Props) {
  const online = useOnline();

  // تجميع الآيات في صفحات المصحف المعتمدة (٦٠٤ صفحة) مرة واحدة.
  const pages = useMemo<PageBlock[]>(() => {
    const map = new Map<number, QuranVerse[]>();
    for (const verse of asset.verses) {
      const list = map.get(verse.p);
      if (list) list.push(verse); else map.set(verse.p, [verse]);
    }
    const total = asset.counts.pages || 604;
    return Array.from({length: total}, (_, index) => ({page: index + 1, verses: map.get(index + 1) ?? []}));
  }, [asset]);

  const surahFirstPage = useMemo(() => {
    const map = new Map<number, number>();
    for (const verse of asset.verses) if (!map.has(verse.s)) map.set(verse.s, verse.p);
    return map;
  }, [asset]);

  const pageMeta = useMemo(() => {
    const map = new Map<number, {juz: number; hizb: number}>();
    for (const block of pages) {
      const first = block.verses[0];
      if (first) map.set(block.page, {juz: first.j, hizb: first.h});
    }
    return map;
  }, [pages]);

  // السور التي تبدأ داخل كل صفحة (لأشرطة أسماء السور والبسملة).
  const surahStarts = useMemo(() => {
    const map = new Map<number, Set<number>>();
    let lastSurah = 0;
    for (const verse of asset.verses) {
      if (verse.s !== lastSurah) {
        lastSurah = verse.s;
        const set = map.get(verse.p);
        if (set) set.add(verse.s); else map.set(verse.p, new Set([verse.s]));
      }
    }
    return map;
  }, [asset]);

  const sajdaKeys = useMemo(() => new Set(asset.sajdas ?? []), [asset]);
  const basmala = useMemo(() => basmalaText(asset), [asset]);

  const savedPage = state.readingPosition?.page;
  const [page, setPage] = useState<number>(() =>
    savedPage && savedPage >= 1 && savedPage <= pages.length ? savedPage : 1);
  const [jumpKind, setJumpKind] = useState<'surah' | 'juz' | 'hizb' | 'page'>('surah');
  const [jumpValue, setJumpValue] = useState<string>('1');
  const [fontSize, setFontSize] = useState<number>(() => state.settings?.fontSize ?? 22);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<QuranVerse | null>(null);
  const [sheetTab, setSheetTab] = useState<'actions' | 'tafsir' | 'translation'>('tafsir');
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const ayahRef = useRef<QuranVerse | null>(null);
  const [tafsirId, setTafsirId] = useState<number>(TAFSIRS[0].id);
  const [translationId, setTranslationId] = useState<number>(TRANSLATIONS[0].id);
  const [content, setContent] = useState<FetchState<string>>({status: 'idle', data: null});
  const [noteText, setNoteText] = useState('');
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoSpeed, setAutoSpeed] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-autoscroll-speed')); return Number.isFinite(v) && v > 0 ? v : 240; } catch { return 240; }
  });
  const audioState = useBackgroundAudio();
  const [ayahLoading, setAyahLoading] = useState(false);
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [reciterId, setReciterId] = useState<number>(() => getSelectedReciterPref()?.reciterId ?? DEFAULT_MP3QURAN_RECITER_ID);
  const [moshafId, setMoshafId] = useState<number>(() => getSelectedReciterPref()?.moshafId ?? 0);
  const [recitersModalOpen, setRecitersModalOpen] = useState(false);
  const [playScope, setPlayScope] = useState<'surah' | 'fromHere' | 'all'>(() => {
    try { const v = localStorage.getItem('quran-play-scope'); return (v === 'surah' || v === 'fromHere' || v === 'all') ? v : 'surah'; } catch { return 'surah'; }
  });

  const handledAutoPlayRef = useRef(0);

  useEffect(() => {
    let active = true;
    loadReciters({
      onNetworkUpdate: updated => {
        if (active) setReciters(updated);
      },
    })
      .then(list => {
        if (!active || list.length === 0) return;
        setReciters(list);
        const pref = getSelectedReciterPref();
        const picked = (pref ? list.find(r => r.id === pref.reciterId) : undefined)
          ?? list.find(r => r.id === DEFAULT_MP3QURAN_RECITER_ID)
          ?? list[0];
        if (picked) {
          setReciterId(picked.id);
          const matchedMoshaf = (pref?.moshafId ? picked.moshaf.find(m => m.id === pref.moshafId) : undefined)
            ?? defaultMoshaf(picked);
          if (matchedMoshaf) setMoshafId(matchedMoshaf.id);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const currentReciter = useMemo(
    () => reciters.find(r => r.id === reciterId) ?? reciters[0],
    [reciters, reciterId],
  );
  const currentMoshaf = useMemo(
    () => currentReciter?.moshaf.find(m => m.id === moshafId) ?? (currentReciter ? defaultMoshaf(currentReciter) : undefined),
    [currentReciter, moshafId],
  );
  const selectOptionsReciters = useMemo(() => {
    const famous = reciters.filter(r => r.famous);
    const list = famous.length > 0 ? [...famous] : reciters.slice(0, 45);
    if (currentReciter && !list.some(r => r.id === currentReciter.id)) {
      list.unshift(currentReciter);
    }
    return list;
  }, [reciters, currentReciter]);
  const activeQuranContinuous =
    audioState.category === 'quran' &&
    audioState.status !== 'idle' &&
    audioState.currentTrack?.meta?.mode === 'continuous';
  const playState: 'idle' | 'playing' | 'paused' = activeQuranContinuous
    ? (audioState.status === 'paused' ? 'paused' : audioState.status === 'error' ? 'idle' : 'playing')
    : 'idle';
  const currentKey = activeQuranContinuous ? String(audioState.currentTrack?.meta?.key ?? '') : '';
  const playingKey =
    audioState.category === 'quran' && (audioState.status === 'playing' || audioState.status === 'loading')
      && audioState.currentTrack?.meta?.mode==='ayah' ? String(audioState.currentTrack?.meta?.key ?? '')
      : '';
  const audioLoading = ayahLoading || (audioState.category === 'quran' && audioState.status === 'loading');

  const playStateRef = useRef<'idle' | 'playing' | 'paused'>('idle');
  playStateRef.current = playState;
  const currentIndexRef = useRef<number>(0);
  const currentStopSurahRef = useRef<number | undefined>(undefined);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [khatmahOpen, setKhatmahOpen] = useState(false);
  const [confirmKhatmahReset, setConfirmKhatmahReset] = useState(false);
  const [khatmahPace, setKhatmahPace] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-khatmah-pace')); return Number.isFinite(v) && v > 0 ? v : 10; } catch { return 10; }
  });
  const [maxPage, setMaxPage] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('quran-khatmah-maxpage')); return Number.isFinite(v) && v >= 1 ? v : 1; } catch { return 1; }
  });

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const autoScrollingRef = useRef<boolean>(false);
  const speedRef = useRef(autoSpeed);
  const stateRef = useRef(state);
  const onStateRef = useRef(onState);
  stateRef.current = state;
  onStateRef.current = onState;

  useEffect(() => { speedRef.current = autoSpeed; }, [autoSpeed]);
  useEffect(() => {
    try { localStorage.setItem('quran-autoscroll-speed', String(autoSpeed)); } catch { /* تجاهل */ }
  }, [autoSpeed]);

  const patch = useCallback((partial: Partial<QuranLearningState>) => {
    // دمج على أحدث حالة معروفة حتى لا تفقد إجراءات متتابعة (علامة ثم ملاحظة) بعضها.
    const next = {...stateRef.current, ...partial, updatedAt: new Date().toISOString()};
    stateRef.current = next;
    onStateRef.current(next);
  }, []);

  const registerPage = useCallback((index: number, el: HTMLDivElement | null) => {
    pageRefs.current[index] = el;
  }, []);

  const scrollToPage = useCallback((target: number) => {
    const el = pageRefs.current[target - 1];
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - TOOLBAR_OFFSET;
    window.scrollTo({top: Math.max(0, top), behavior: 'auto'});
    setPage(target);
  }, []);

  // استعادة موضع القراءة المحفوظ بعد أول رسم.
  useEffect(() => {
    const target = savedPage && savedPage >= 1 && savedPage <= pages.length ? savedPage : 1;
    if (target <= 1) return;
    const timer = window.setTimeout(() => scrollToPage(target), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تتبّع الصفحة الظاهرة أثناء التمرير (بحث ثنائي: الصفحات مرتبة رأسيًا).
  useEffect(() => {
    let last = 0;
    const onScroll = () => {
      if (autoScrollingRef.current) return;
      const now = performance.now();
      if (now - last < 200) return;
      last = now;
      const els = pageRefs.current;
      let low = 0;
      let high = els.length - 1;
      let found = 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const el = els[mid];
        if (!el) { low = mid + 1; continue; }
        const rect = el.getBoundingClientRect();
        if (rect.bottom > TOOLBAR_OFFSET + 8) { found = mid + 1; high = mid - 1; } else { low = mid + 1; }
      }
      setPage(current => current === found ? current : found);
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // حفظ موضع القراءة على الجهاز بعد استقرار التمرير.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const first = pages[page - 1]?.verses[0];
      if (!first) return;
      const current = stateRef.current.readingPosition;
      if (current && current.page === page) return;
      patch({readingPosition: {surah: first.s, ayah: first.a, juz: first.j, page, updatedAt: new Date().toISOString()}});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [page, pages, patch]);

  // حفظ حجم الخط في حالة القرآن (ولا يُكتب عند أول رسم).
  const fontReady = useRef(false);
  useEffect(() => {
    if (!fontReady.current) { fontReady.current = true; return; }
    patch({settings: {...(stateRef.current.settings ?? {fontSize, theme: 'light'}), fontSize}});
  }, [fontSize, patch]);

  const bookmarks = state.bookmarks ?? [];
  const isBookmarked = (verse: QuranVerse) => bookmarks.some(item => item.surah === verse.s && item.ayah === verse.a);

  const toggleBookmark = (verse: QuranVerse) => {
    const list = stateRef.current.bookmarks ?? [];
    if (list.some(item => item.surah === verse.s && item.ayah === verse.a)) {
      patch({bookmarks: list.filter(item => !(item.surah === verse.s && item.ayah === verse.a))});
      notify('أُزيلت العلامة.');
      return;
    }
    const name = surahInfo(asset, verse.s)?.name ?? `سورة ${verse.s}`;
    patch({bookmarks: [{id: `bm-${verse.s}-${verse.a}`, surah: verse.s, ayah: verse.a, label: `${name}: ${toArabicNumber(verse.a)}`, name: `${name} · ${toArabicNumber(verse.a)}`, page: verse.p, createdAt: new Date().toISOString()}, ...list]});
    notify('حُفظت علامة الآية على هذا الجهاز.');
  };

  const addNote = () => {
    if (!active || noteText.trim().length < 2) { notify('اكتب ملاحظة أطول قليلًا.'); return; }
    const stamp = new Date().toISOString();
    patch({notes: [{id: `nt-${active.s}-${active.a}-${Date.now()}`, surah: active.s, ayahStart: active.a, ayahEnd: active.a, body: noteText.trim().slice(0, 4000), createdAt: stamp, updatedAt: stamp}, ...(stateRef.current.notes ?? [])]});
    setNoteText('');
    notify('حُفظت الملاحظة على هذا الجهاز.');
  };

  const stopAudio = useCallback(() => {
    void backgroundAudio.stop();
  }, []);

  const closePopover = useCallback(() => {
    setActive(null);
  }, []);

  // الرجوع يغلق الطبقة المفتوحة في المصحف: بطاقة الآية، ثم قائمة القراء، ثم الختمة، ثم العلامات، ثم البحث.
  useBackHandler(() => {
    if (active) { closePopover(); return; }
    if (recitersModalOpen) { setRecitersModalOpen(false); return; }
    if (khatmahOpen) { setKhatmahOpen(false); setConfirmKhatmahReset(false); return; }
    if (bookmarksOpen) { setBookmarksOpen(false); return; }
    if (searchOpen) { setSearchOpen(false); }
  }, Boolean(active || recitersModalOpen || khatmahOpen || bookmarksOpen || searchOpen));

  const pauseContinuous = useCallback(() => {
    void backgroundAudio.pause();
  }, []);

  const resumeContinuous = useCallback(() => {
    void backgroundAudio.resume();
  }, []);

  const playContinuousFrom = useCallback(async (
    startIndex: number,
    stopSurah?: number,
    override?: {reciter: Reciter; moshaf: ReciterMoshaf},
  ) => {
    const verses = asset.verses;
    const startVerse = verses[Math.max(0, Math.min(startIndex, verses.length - 1))];
    const startSurah = stopSurah !== undefined ? stopSurah : (startVerse?.s ?? 1);
    const lastSurah = stopSurah !== undefined ? stopSurah : (playScope === 'surah' ? startSurah : 114);
    currentStopSurahRef.current = stopSurah;
    currentIndexRef.current = Math.max(0, verses.findIndex(v => v.s === startSurah && v.a === 1));

    const firstVerse = asset.verses.find(v => v.s === startSurah && v.a === 1);
    if (firstVerse) {
      const el = pageRefs.current[firstVerse.p - 1];
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - TOOLBAR_OFFSET;
        window.scrollTo({top: Math.max(0, top), behavior: 'auto'});
      }
    }

    const activeReciter = override?.reciter ?? currentReciter;
    const activeMoshaf = override?.moshaf ?? currentMoshaf;
    if (!activeReciter || !activeMoshaf) {
      notify('جارٍ تجهيز قائمة القراء… أعد المحاولة بعد لحظة.');
      return;
    }

    if(moshafCategory(activeMoshaf.name)!=='hafs'){notify('هذه الرواية للاستماع فقط من مكتبة القراء، ولا تُربط بنص حفص المعروض.');return;}
    const firstOfflineReady = isSurahOfflineDownloaded(activeMoshaf.id, startSurah);
    if (!online && !firstOfflineReady) {
      notify('هذه السورة غير منزَّلة لهذا القارئ؛ يمكنك تنزيلها عند توفر الإنترنت أو اختيار قارئ منزَّل.');
      return;
    }

    const tracks: AudioTrack[] = [];
    for (let s = startSurah; s <= lastSurah; s += 1) {
      if (!activeMoshaf.surahList.includes(s)||(!online&&!isSurahOfflineDownloaded(activeMoshaf.id,s))){notify(`الصوت غير متاح للسورة ${s}؛ لن تُتجاوز في التلاوة المتتابعة.`);break;}
      const url = audioUrl(activeMoshaf, s);
      tracks.push({
        id: offlineTrackId(activeMoshaf.id, s),
        title: surahInfo(asset, s)?.name ?? `سورة ${s}`,
        subtitle: activeReciter.name,
        url,
        category: 'quran',
        meta: {mode: 'continuous', key: `${s}:1`, surah: s, reciterId: activeReciter.id, moshafId: activeMoshaf.id},
      });
    }

    if (!tracks.length) {
      notify('هذه السورة غير متوفرة لدى هذا القارئ أو الرواية.');
      return;
    }

    await backgroundAudio.playQueue(tracks, 0, 'quran');
  }, [asset, currentMoshaf, currentReciter, notify, online, playScope]);

  // reciterIdRef sync
  const reciterIdRef = useRef<number>(reciterId);
  useEffect(() => { reciterIdRef.current = reciterId; }, [reciterId]);

  useEffect(() => {
    if (!autoPlayToken || handledAutoPlayRef.current === autoPlayToken) return;
    if (!currentReciter || !currentMoshaf) return;
    handledAutoPlayRef.current = autoPlayToken;
    const curSurah = pages[page - 1]?.verses[0]?.s ?? 1;
    const startIdx = Math.max(0, asset.verses.findIndex(v => v.s === curSurah && v.a === 1));
    const stopS = playScope === 'surah' ? curSurah : undefined;
    void playContinuousFrom(startIdx, stopS, {reciter: currentReciter, moshaf: currentMoshaf});
  }, [autoPlayToken, asset.verses, currentMoshaf, currentReciter, page, pages, playContinuousFrom, playScope]);

  const playAyah = async (verse: QuranVerse) => {
    const targetKey = `${verse.s}:${verse.a}`;
    if (playingKey === targetKey) { stopAudio(); return; }
    if (!online) { notify('تلاوة الآية الواحدة تحتاج اتصالًا بالإنترنت؛ أو شغّل السورة الكاملة إن كانت منزَّلة.'); return; }
    if(!currentMoshaf||moshafCategory(currentMoshaf.name)!=='hafs'){notify('هذه الرواية للاستماع فقط في المكتبة، وليست متوافقة مع النص المعروض.');return;}
    setAyahLoading(true);
    const requestedReciter=reciterId;
    const url = await resolveSingleAyahUrl(reciterId, currentMoshaf?.name, verse.s, verse.a);
    setAyahLoading(false);
    if(requestedReciter!==reciterIdRef.current)return;
    if (!url) {
      notify('التلاوة آية بآية غير متوفرة لهذا القارئ؛ استخدم زر «تشغيل» للاستماع للسورة كاملة بصوته.');
      return;
    }
    const surahName = surahInfo(asset, verse.s)?.name ?? `سورة ${verse.s}`;
    const reciterName = currentReciter?.name ?? 'القرآن الكريم';
    await backgroundAudio.playSingle({
      id: `quran:ayah:${reciterId}:${targetKey}`,
      title: `${surahName} · آية ${toArabicNumber(verse.a)}`,
      subtitle: reciterName,
      url,
      category: 'quran',
      meta: {mode: 'ayah', key: targetKey, surah: verse.s, ayah: verse.a, reciterId},
    });
  };

  // جلب التفسير أو الترجمة عند اختيار الآية (يُخزَّن محليًا بعد أول فتح).
  useEffect(() => {
    if (!active || sheetTab === 'actions') { setContent({status: 'idle', data: null}); return; }
    const controller = new AbortController();
    setContent({status: 'loading', data: null});
    const key = `${active.s}:${active.a}`;
    const request = sheetTab === 'tafsir'
      ? fetchTafsir(key, tafsirId, controller.signal)
      : fetchTranslation(key, translationId, controller.signal);
    request.then(text => {
      if (controller.signal.aborted) return;
      setContent(text ? {status: 'success', data: text} : {status: 'empty', data: null});
    }).catch(() => {
      if (!controller.signal.aborted) setContent({status: 'error', data: null, error: 'تعذّر جلب المحتوى.'});
    });
    return () => controller.abort();
  }, [active, sheetTab, tafsirId, translationId]);

  // التمرير التلقائي: سلس، قابل للإيقاف، ويُبقي الشاشة مستيقظة إن أمكن.
  useEffect(() => {
    if (!autoScroll) {
      autoScrollingRef.current = false;
      // update page state once when stopping
      const els = pageRefs.current;
      let low = 0, high = els.length - 1, found = 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const el = els[mid];
        if (!el) { low = mid + 1; continue; }
        const rect = el.getBoundingClientRect();
        if (rect.bottom > TOOLBAR_OFFSET + 8) { found = mid + 1; high = mid - 1; } else { low = mid + 1; }
      }
      setPage(found);
      return;
    }
    autoScrollingRef.current = true;
    const root = document.documentElement;
    const prevBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    let wakeLock: {release: () => Promise<void>} | null = null;
    const acquire = async () => {
      try {
        const api = (navigator as unknown as {wakeLock?: {request: (kind: string) => Promise<{release: () => Promise<void>}>}}).wakeLock;
        if (api) wakeLock = await api.request('screen');
      } catch { /* غير مدعوم */ }
    };
    void acquire();
    let frame = 0;
    let last = performance.now();
    let acc = root.scrollTop;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const speed = speedRef.current;
      acc += speed * dt;
      const maxScroll = root.scrollHeight - window.innerHeight;
      if (acc >= maxScroll - 2) {
        acc = maxScroll;
        root.scrollTop = acc;
        setAutoScroll(false);
        return;
      }
      root.scrollTop = acc;
      frame = requestAnimationFrame(tick);
    };
    const pause = () => setAutoScroll(false);
    window.addEventListener('wheel', pause, {passive: true});
    window.addEventListener('touchstart', pause, {passive: true});
    window.addEventListener('rabbani:scroll-top', pause);
    frame = requestAnimationFrame(tick);
    return () => {
      autoScrollingRef.current = false;
      cancelAnimationFrame(frame);
      window.removeEventListener('wheel', pause);
      window.removeEventListener('touchstart', pause);
      window.removeEventListener('rabbani:scroll-top', pause);
      root.style.scrollBehavior = prevBehavior;
      if (wakeLock) void wakeLock.release().catch(() => undefined);
    };
  }, [autoScroll]);

  // تتبّع أقصى صفحة وصل إليها القارئ (لتقدم الختمة).
  useEffect(() => {
    setMaxPage(current => {
      if (page <= current) return current;
      try { localStorage.setItem('quran-khatmah-maxpage', String(page)); } catch { /* تجاهل */ }
      return page;
    });
  }, [page]);

  useEffect(() => {
    try { localStorage.setItem('quran-khatmah-pace', String(khatmahPace)); } catch { /* تجاهل */ }
  }, [khatmahPace]);

  useEffect(() => {
    if (!currentReciter || !currentMoshaf) return;
    saveSelectedReciterPref({
      reciterId: currentReciter.id,
      moshafId: currentMoshaf.id,
      reciterName: currentReciter.name,
      moshafName: currentMoshaf.name,
    });
  }, [currentReciter, currentMoshaf]);

  useEffect(() => {
    try { localStorage.setItem('quran-play-scope', playScope); } catch { /* تجاهل */ }
  }, [playScope]);

  // أثناء فتح لوحة: منع تمرير الصفحة (لتوسيط صحيح وتجنب شريط التمرير).
  useEffect(() => {
    const open = Boolean(active) || bookmarksOpen || khatmahOpen || recitersModalOpen;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    if (open) { document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'; }
    return () => { document.body.style.overflow = prevBody; document.documentElement.style.overflow = prevHtml; };
  }, [active, bookmarksOpen, khatmahOpen, recitersModalOpen]);

  const jump = () => {
    if (jumpKind === 'surah') {
      const target = surahFirstPage.get(Number(jumpValue));
      if (target) scrollToPage(target);
      return;
    }
    if (jumpKind === 'page') {
      const target = Number(jumpValue);
      if (target >= 1 && target <= pages.length) scrollToPage(target);
      return;
    }
    const value = Number(jumpValue);
    const verse = asset.verses.find(item => jumpKind === 'juz' ? item.j === value : item.h === value);
    if (verse) scrollToPage(verse.p);
  };

  const jumpOptions = useMemo(() => {
    if (jumpKind === 'surah') return asset.surahs.map(surah => ({value: String(surah.n), label: `${toArabicNumber(surah.n)} · ${surah.name}`}));
    if (jumpKind === 'page') return Array.from({length: pages.length}, (_, index) => ({value: String(index + 1), label: `صفحة ${toArabicNumber(index + 1)}`}));
    const total = jumpKind === 'juz' ? 30 : 60;
    return Array.from({length: total}, (_, index) => ({value: String(index + 1), label: `${jumpKind === 'juz' ? 'الجزء' : 'الحزب'} ${toArabicNumber(index + 1)}`}));
  }, [asset, jumpKind, pages.length]);

  useEffect(() => { setJumpValue('1'); }, [jumpKind]);

  // تغيير القارئ/الرواية/النطاق أثناء التشغيل: تحديث المصدر في المكان (إعادة تشغيل من الموضع الحالي).
  const prevReciterRef = useRef(`${reciterId}:${moshafId}`);
  useEffect(() => {
    const key = `${reciterId}:${moshafId}`;
    if (prevReciterRef.current === key) return;
    prevReciterRef.current = key;
    if (playStateRef.current === 'idle') return;
    const playingSurah = Number(currentKey.split(':')[0]) || (pages[page - 1]?.verses[0]?.s ?? 1);
    const idx = Math.max(0, asset.verses.findIndex(v => v.s === playingSurah && v.a === 1));
    const ss = currentStopSurahRef.current;
    const t = setTimeout(() => { void playContinuousFrom(idx, ss); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciterId, moshafId]);

  const prevScopeRef = useRef(playScope);
  useEffect(() => {
    if (prevScopeRef.current === playScope) return;
    prevScopeRef.current = playScope;
    if (playStateRef.current === 'idle') return;
    let startIndex = 0;
    const startSurah = pages[page - 1]?.verses[0]?.s ?? 1;
    if (playScope === 'surah') {
      const idx = asset.verses.findIndex(v => v.s === startSurah && v.a === 1);
      if (idx >= 0) startIndex = idx;
    } else if (playScope === 'fromHere') {
      const first = pages[page - 1]?.verses[0];
      const idx = first ? asset.verses.findIndex(v => v.s === first.s && v.a === first.a) : 0;
      if (idx >= 0) startIndex = idx;
    } else {
      startIndex = 0;
    }
    const stopSurah = playScope === 'surah' ? startSurah : undefined;
    currentStopSurahRef.current = stopSurah;
    const t = setTimeout(() => { void playContinuousFrom(startIndex, stopSurah); }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playScope]);

  // Handler for the single Play/Pause button (shared by desktop & mobile).
  const togglePlay = () => {
    if (playState === 'idle') {
      let startIndex = 0;
      const startSurah = pages[page - 1]?.verses[0]?.s ?? 1;
      if (playScope === 'surah') {
        const idx = asset.verses.findIndex(v => v.s === startSurah && v.a === 1);
        if (idx >= 0) startIndex = idx;
      } else if (playScope === 'fromHere') {
        const first = pages[page - 1]?.verses[0];
        const idx = first ? asset.verses.findIndex(v => v.s === first.s && v.a === first.a) : 0;
        if (idx >= 0) startIndex = idx;
      } else {
        startIndex = 0;
      }
      const stopSurah = playScope === 'surah' ? startSurah : undefined;
      setActive(null);
      void playContinuousFrom(startIndex, stopSurah);
    } else if (playState === 'playing') {
      pauseContinuous();
    } else {
      resumeContinuous();
    }
  };

  // Always render mobile sheet inside 480px shell and scroll selected ayah into view.
  useEffect(() => {
    if (!active) return;
    ayahRef.current = active;
    const ayahEl = document.querySelector(`[data-ayah="${active.s}:${active.a}"]`) as HTMLElement | null;
    if (ayahEl) {
      const rect = ayahEl.getBoundingClientRect();
      const target = window.scrollY + rect.top - window.innerHeight / 3;
      window.scrollTo({top: Math.max(0, target), behavior: 'smooth'});
    }
  }, [active]);

  const results = useMemo(() => (search.trim().length >= 2 ? searchVerses(asset, search, 30) : []), [asset, search]);

  // Esc / initial focus / swipe down for mobile ayah sheet.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePopover(); }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const pop = popoverRef.current;
      if (pop) {
        const focusable = pop.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
      }
    }, 50);
    let startY = 0;
    const handle = popoverRef.current?.querySelector('.mf-drag-handle');
    const onTouchStart = (e: Event) => { startY = (e as TouchEvent).touches[0].clientY; };
    const onTouchEnd = (e: Event) => {
      const endY = (e as TouchEvent).changedTouches[0].clientY;
      if (endY - startY > 60) { closePopover(); }
    };
    if (handle) {
      handle.addEventListener('touchstart', onTouchStart, {passive: true});
      handle.addEventListener('touchend', onTouchEnd, {passive: true});
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      if (handle) {
        handle.removeEventListener('touchstart', onTouchStart);
        handle.removeEventListener('touchend', onTouchEnd);
      }
    };
  }, [active, closePopover]);

  const meta = pageMeta.get(page);
  const progress = Math.round((page / pages.length) * 100);

  const selectVerse = useCallback((verse: QuranVerse) => {
    if (active && active.s === verse.s && active.a === verse.a) {
      setActive(null);
      stopAudio();
      return;
    }
    setActive(verse);
    setSheetTab('tafsir');
    setNoteText('');
  }, [active]);

  return <div className="mf-shell">
    <div className="mf-toolbar" role="toolbar" aria-label="أدوات المصحف">
      <div className="mf-toolbar-head">
        <h1 className="mf-toolbar-title">المصحف الشريف</h1>
        <p className="mf-toolbar-desc">تمرير رأسي متصل — قراءة على هدي الكتاب والسنة.</p>
      </div>
      <div className="mf-grid mf-grid-3">
        <section className="mf-section mf-sec-nav">
          <h3 className="mf-sec-title"><Search size={17}/> التنقل والبحث</h3>
          <div className="mf-row mf-row-nav">
            <div className="mf-field">
              <label className="mf-field-label">النوع</label>
              <div className="mf-select-wrap">
                <select value={jumpKind} onChange={event => setJumpKind(event.target.value as typeof jumpKind)} aria-label="نوع الانتقال">
                  <option value="surah">سورة</option><option value="juz">جزء</option><option value="hizb">حزب</option><option value="page">صفحة</option>
                </select>
              </div>
            </div>
            <div className="mf-field mf-field-grow">
              <label className="mf-field-label">الانتقال إلى</label>
              <div className="mf-select-wrap">
                <select value={jumpValue} onChange={event => setJumpValue(event.target.value)} aria-label="الانتقال إلى">
                  {jumpOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <button type="button" className="mf-btn primary" onClick={jump} aria-label="انتقال"><ChevronLeft size={17}/>انتقال</button>
            <button type="button" className={`mf-btn ${searchOpen ? 'primary' : 'soft'}`} onClick={() => setSearchOpen(value => !value)} aria-pressed={searchOpen} aria-label="بحث"><Search size={17}/>بحث</button>
          </div>
        </section>
        <section className="mf-section mf-sec-audio">
          <h3 className="mf-sec-title"><Play size={17}/> الاستماع</h3>
          <div className="mf-row mf-row-audio">
            <div className="mf-field mf-field-grow">
              <label className="mf-field-label">القارئ</label>
              <div className="mf-select-wrap">
                <select
                  value={reciterId}
                  onChange={event => {
                    const id = Number(event.target.value);
                    setReciterId(id);
                    const picked = reciters.find(r => r.id === id);
                    const m = picked ? defaultMoshaf(picked) : undefined;
                    if (m) setMoshafId(m.id);
                  }}
                  aria-label="القارئ"
                >
                  {selectOptionsReciters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </div>
            {currentReciter && currentReciter.moshaf.length > 1 && (
              <div className="mf-field mf-field-grow">
                <label className="mf-field-label">الرواية</label>
                <div className="mf-select-wrap">
                  <select value={currentMoshaf?.id ?? moshafId} onChange={event => setMoshafId(Number(event.target.value))} aria-label="الرواية">
                    {currentReciter.moshaf.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div className="mf-field mf-field-grow">
              <label className="mf-field-label">النطاق</label>
              <div className="mf-select-wrap">
                <select value={playScope} onChange={event => setPlayScope(event.target.value as 'surah' | 'fromHere' | 'all')} aria-label="نطاق التشغيل">
                  <option value="surah">هذه السورة</option><option value="fromHere">من هنا</option><option value="all">المصحف كاملًا</option>
                </select>
              </div>
            </div>
            <button type="button" className="mf-btn primary" onClick={togglePlay} aria-pressed={playState === 'playing'}>
              {playState === 'idle' ? <><Play size={17}/>تشغيل</> : playState === 'playing' ? <><Pause size={17}/>إيقاف مؤقت</> : <><Play size={17}/>تشغيل</>}
            </button>
          </div>
          <div className="mf-audio-extra">
            <button
              type="button"
              className="mf-btn sm soft"
              onClick={() => setRecitersModalOpen(true)}
            >
              <Users size={15}/> القراء والتحميل ({toArabicNumber(reciters.length || 244)}+)
            </button>
            {currentMoshaf && isSurahOfflineDownloaded(currentMoshaf.id, pages[page - 1]?.verses[0]?.s ?? 1) && (
              <span className="mf-offline-pill"><CheckCircle2 size={13}/> السورة متاحة دون إنترنت</span>
            )}
          </div>
          {(playState !== 'idle' || currentKey) && <div className="mf-nowplaying">
            <Play size={13}/> الآن يُشغَّل: {currentKey ? `${surahInfo(asset, Number(currentKey.split(':')[0]))?.name ?? ''} — ${currentReciter?.name ?? ''}` : '—'}
          </div>}
        </section>
        <section className="mf-section mf-sec-reading">
          <h3 className="mf-sec-title"><BookOpen size={17}/> القراءة</h3>
          <div className="mf-reading-grid">
            <div className="mf-group">
              <span className="mf-group-label">تمرير تلقائي</span>
              <button type="button" className={autoScroll ? 'mf-btn soft selected' : 'mf-btn soft'} aria-pressed={autoScroll} onClick={() => setAutoScroll(value => !value)}>{autoScroll ? <Pause size={16}/> : <Play size={16}/>}{autoScroll ? 'إيقاف التمرير' : 'تمرير تلقائي'}</button>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">سرعة التمرير</span>
              <div className="mf-speed">
                <div className="mf-speed-head">
                  <span className="mf-speed-val">{AUTO_SCROLL_SPEEDS.find(s => s.value === autoSpeed)?.label ?? 'متوسط'}</span>
                </div>
                <input type="range" min={40} max={1400} step={20} value={autoSpeed} onChange={event => setAutoSpeed(Number(event.target.value))} aria-label="سرعة التمرير التلقائي" className="mf-slider"/>
              </div>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">حجم الخط</span>
              <div className="mf-font">
                <button type="button" className="mf-btn sm" aria-label="تصغير الخط" onClick={() => setFontSize(value => Math.max(18, value - 1))}>−</button>
                <span className="mf-font-val">{toArabicNumber(fontSize)}</span>
                <button type="button" className="mf-btn sm" aria-label="تكبير الخط" onClick={() => setFontSize(value => Math.min(42, value + 1))}>+</button>
              </div>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">علاماتي</span>
              <button type="button" className="mf-btn soft" onClick={() => setBookmarksOpen(true)}><Bookmark size={16}/>علاماتي <span className="mf-badge">{toArabicNumber(bookmarks.length)}</span></button>
            </div>
            <div className="mf-group">
              <span className="mf-group-label">تقدم الختمة</span>
              <button type="button" className="mf-btn soft" onClick={() => setKhatmahOpen(true)}><TrendingUp size={16}/>تقدم الختمة</button>
            </div>
          </div>
        </section>
      </div>
      {searchOpen && <div className="mf-search">
        <label><Search size={15}/><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث بالكلمة (بحث إملائي منفصل عن نص المصحف)"/></label>
        {search.trim().length >= 2 && <p className="muted small">{toArabicNumber(results.length)} نتيجة{results.length >= 30 ? ' (أول ٣٠)' : ''}</p>}
        <ul>{results.map(result => (
          <li key={`${result.verse.s}:${result.verse.a}`}>
            <button type="button" onClick={() => { setSearchOpen(false); setSearch(''); scrollToPage(result.verse.p); selectVerse(result.verse); }}>
              <strong>{result.surahName} · آية {toArabicNumber(result.verse.a)} · صفحة {toArabicNumber(result.verse.p)}</strong>
              <span>{result.body.length > 140 ? `${result.body.slice(0, 140)}…` : result.body}</span>
            </button>
          </li>
        ))}</ul>
        {search.trim().length >= 2 && results.length === 0 && <p className="muted small">لا توجد نتائج مطابقة.</p>}
      </div>}
      <div className="mf-statusbar">
        <span className="mf-status-text">{meta ? `صفحة ${toArabicNumber(page)} من ${toArabicNumber(pages.length)} · الجزء ${toArabicNumber(meta.juz)} · الحزب ${toArabicNumber(meta.hizb)}` : `صفحة ${toArabicNumber(page)}`}</span>
        <div className="mf-progress" aria-hidden="true"><span style={{width: `${progress}%`}}/></div>
      </div>
    </div>
    {/* Mobile quick bottom bar */}
    <div className="mf-bottom-bar">
      <button type="button" className="mf-btn sm primary" onClick={togglePlay} aria-pressed={playState === 'playing'} aria-label="تشغيل أو إيقاف القراءة">
        {playState === 'playing' ? <Pause size={17}/> : <Play size={17}/>} {playState === 'playing' ? 'إيقاف مؤقت' : 'تشغيل'}
      </button>
      <button type="button" className={autoScroll ? 'mf-btn sm soft selected' : 'mf-btn sm soft'} onClick={() => setAutoScroll(value => !value)} aria-pressed={autoScroll} aria-label="تمرير تلقائي">
        {autoScroll ? <Pause size={15}/> : <Play size={15}/>} {autoScroll ? 'إيقاف التمرير' : 'تمرير تلقائي'}
      </button>
      <button type="button" className={`mf-btn sm ${searchOpen ? 'primary' : 'soft'}`} onClick={() => setSearchOpen(value => !value)} aria-pressed={searchOpen} aria-label="بحث">
        <Search size={16}/> بحث
      </button>
      <button type="button" className="mf-btn sm soft" onClick={() => setBookmarksOpen(true)} aria-label="علاماتي">
        <Bookmark size={16}/> علاماتي
      </button>
    </div>

    <MushafPageList
      asset={asset}
      pages={pages}
      surahStarts={surahStarts}
      sajdaKeys={sajdaKeys}
      basmala={basmala}
      fontSize={fontSize}
      activeKey={active ? `${active.s}:${active.a}` : ''}
      playingKey={playingKey}
      onSelect={selectVerse}
      registerPage={registerPage}
    />

    {active && <div
      className="mf-sheet-backdrop mf-scrim-light"
      onClick={e => { if (e.target === e.currentTarget) { closePopover(); } }}
    >
      <div
        ref={popoverRef}
        className="mf-sheet mf-sheet-mobile"
        role="dialog"
        aria-modal="true"
        aria-label={`${surahInfo(asset, active.s)?.name ?? `سورة ${active.s}`}: ${toArabicNumber(active.a)}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="mf-drag-handle" aria-hidden="true"/>
        <div className="mf-sheet-head">
          <div>
            <strong>{surahInfo(asset, active.s)?.name ?? `سورة ${active.s}`}: {toArabicNumber(active.a)}</strong>
            <small className="muted">صفحة {toArabicNumber(active.p)} · الجزء {toArabicNumber(active.j)}</small>
          </div>
          <button type="button" className="mf-icon-btn" onClick={() => { closePopover(); }} aria-label="إغلاق"><X size={18}/></button>
        </div>

        <div className="mf-sheet-actions">
          <button type="button" className={sheetTab === 'tafsir' ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => setSheetTab('tafsir')}>تفسير</button>
          <button type="button" className={sheetTab === 'translation' ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => setSheetTab('translation')}>ترجمة</button>
          <button type="button" className={playingKey === `${active.s}:${active.a}` ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => void playAyah(active)}>
            {audioLoading ? <Loader2 size={18} className="spin"/> : playingKey === `${active.s}:${active.a}` ? <Square size={18}/> : <Play size={18}/>} تشغيل
          </button>
          <button type="button" className="mf-btn soft" onClick={() => { if (active) { const idx = asset.verses.findIndex(v => v.s === active.s && v.a === active.a); if (idx >= 0) { setActive(null); void playContinuousFrom(idx, undefined); } } }}><Play size={18}/> متواصل من هنا</button>
          <button type="button" className="mf-btn soft" onClick={async () => { await copyText(`${verseBody(active.t)} (${surahInfo(asset, active.s)?.name ?? active.s}: ${toArabicNumber(active.a)})`); notify('نُسخت الآية مع مرجعها.'); }}><Copy size={18}/> نسخ</button>
          <button type="button" className="mf-btn soft" onClick={async () => { const result = await shareText(`${verseBody(active.t)} (${surahInfo(asset, active.s)?.name ?? active.s}: ${toArabicNumber(active.a)})`); notify(result === 'shared' ? 'فُتحت المشاركة.' : 'نُسخت الآية للمشاركة.'); }}><Share2 size={18}/> مشاركة</button>
          <button type="button" className={isBookmarked(active) ? 'mf-btn selected' : 'mf-btn soft'} onClick={() => toggleBookmark(active)}>
            {isBookmarked(active) ? <BookmarkCheck size={18}/> : <Bookmark size={18}/>} علامة
          </button>
        </div>

        {sheetTab !== 'actions' && <div className="mf-sheet-content">
          <label className="mf-content-select">{sheetTab === 'tafsir' ? 'التفسير' : 'الترجمة'}
            <select value={sheetTab === 'tafsir' ? tafsirId : translationId} onChange={event => sheetTab === 'tafsir' ? setTafsirId(Number(event.target.value)) : setTranslationId(Number(event.target.value))}>
              {(sheetTab === 'tafsir' ? TAFSIRS : TRANSLATIONS).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {!online && <p className="mf-content-note"><WifiOff size={13}/> لا يوجد اتصال: ما فُتح سابقًا من تفسير وترجمة محفوظ على الجهاز، وغيره يحتاج إنترنت.</p>}
          {content.status === 'loading' && <p className="muted small">جارٍ التحميل…</p>}
          {content.status === 'error' && <p className="muted small" role="alert">{online ? content.error : 'غير متاح دون اتصال.'}</p>}
          {content.status === 'empty' && <p className="muted small">{sheetTab === 'tafsir' ? 'لا يوجد تفسير لهذه الآية في هذا المصدر.' : 'لا توجد ترجمة لهذه الآية في هذا المصدر.'}</p>}
          {content.status === 'success' && <small>{attributionLabel((sheetTab==='tafsir'?TAFSIRS.find(t=>t.id===tafsirId):TRANSLATIONS.find(t=>t.id===translationId))?.name??'مصدر غير محدد', sheetTab==='tafsir'?tafsirProviderLabel(tafsirId):undefined)}</small>}
          {content.status === 'success' && <p className="mf-content-text">{content.data}</p>}
        </div>}

        <div className="mf-sheet-note">
          <label>ملاحظة شخصية على هذه الآية
            <textarea value={noteText} onChange={event => setNoteText(event.target.value)} maxLength={4000} placeholder="تأمل أو فائدة خاصة بك… تبقى على هذا الجهاز."/>
          </label>
          <button type="button" className="mf-btn primary mf-btn-full" onClick={addNote}><StickyNote size={18}/> حفظ الملاحظة</button>
        </div>
        <p className="mf-sheet-foot"><InternetBadge compact/> التلاوة: {currentReciter?.name ?? 'مشاري العفاسي'} — تعمل مباشرة عبر الإنترنت أو دون اتصال للسور المنزَّلة؛ النص والتفسير المحفوظ لا يحتاجان.</p>
      </div>
    </div>}

    {bookmarksOpen && <div className="mf-sheet-backdrop" onClick={() => setBookmarksOpen(false)}>
      <div className="mf-sheet" role="dialog" aria-label="علاماتي" onClick={event => event.stopPropagation()}>
        <div className="mf-sheet-head">
          <div><strong>علاماتي</strong><small className="muted"> {toArabicNumber(bookmarks.length)} علامة — محفوظة على هذا الجهاز</small></div>
          <button type="button" className="icon-btn" onClick={() => setBookmarksOpen(false)} aria-label="إغلاق"><X size={18}/></button>
        </div>
        {bookmarks.length === 0 ? <p className="muted">لا توجد علامات بعد. افتح آية ثم اضغط «علامة».</p> : <ul className="mf-bookmark-list">
          {bookmarks.map(bm => (
            <li key={bm.id}>
              <div className="mf-bm-row">
                <input className="mf-bm-name" value={bm.name ?? bm.label} onChange={event => {
                  const value = event.target.value;
                  patch({bookmarks: (stateRef.current.bookmarks ?? []).map(item => item.id === bm.id ? {...item, name: value} : item)});
                }} aria-label="اسم العلامة"/>
                <small className="muted">{surahInfo(asset, bm.surah)?.name ?? `سورة ${bm.surah}`} · آية {toArabicNumber(bm.ayah)} · صفحة {toArabicNumber(bm.page ?? (asset.verses.find(v => v.s === bm.surah && v.a === bm.ayah)?.p ?? 1))}</small>
              </div>
              <div className="mf-bm-actions">
                <button type="button" className="soft-btn" onClick={() => { const target = bm.page ?? (asset.verses.find(v => v.s === bm.surah && v.a === bm.ayah)?.p ?? 1); setBookmarksOpen(false); scrollToPage(target); const v = asset.verses.find(x => x.s === bm.surah && x.a === bm.ayah); if (v) { setActive(v); setSheetTab('actions'); } }}>انتقال</button>
                <button type="button" className="icon-btn" aria-label="حذف العلامة" onClick={() => { patch({bookmarks: (stateRef.current.bookmarks ?? []).filter(item => item.id !== bm.id)}); notify('أُزيلت العلامة.'); }}><Trash2 size={15}/></button>
              </div>
            </li>
          ))}
        </ul>}
      </div>
    </div>}

    {khatmahOpen && <div className="mf-sheet-backdrop" onClick={() => { setKhatmahOpen(false); setConfirmKhatmahReset(false); }}>
      <div className="mf-sheet" role="dialog" aria-label="تقدم الختمة" onClick={event => event.stopPropagation()}>
        <div className="mf-sheet-head">
          <div><strong>تقدم الختمة</strong><small className="muted"> تتبّع تقدمك في المصحف (٦٠٤ صفحة)</small></div>
          <button type="button" className="icon-btn" onClick={() => { setKhatmahOpen(false); setConfirmKhatmahReset(false); }} aria-label="إغلاق"><X size={18}/></button>
        </div>
        <div className="mf-khatmah">
          <div className="mf-khatmah-bar" role="progressbar" aria-valuenow={Math.round(maxPage / 604 * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{width: `${Math.max(2, Math.round(maxPage / 604 * 100))}%`}}/>
          </div>
          <p className="mf-khatmah-stat">أقصى صفحة وصلت إليها: <strong>{toArabicNumber(maxPage)}</strong> من {toArabicNumber(604)} ({toArabicNumber(Math.round(maxPage / 604 * 100))}٪)</p>
          <p className="muted small">الصفحة الحالية: {toArabicNumber(page)} · الجزء {toArabicNumber(pageMeta.get(page)?.juz ?? 1)} · الحزب {toArabicNumber(pageMeta.get(page)?.hizb ?? 1)}</p>
          <label className="mf-khatmah-pace">وتيرة القراءة (صفحات/يوم)
            <select value={khatmahPace} onChange={event => setKhatmahPace(Number(event.target.value))}>
              {[3, 5, 10, 15, 20].map(value => <option key={value} value={value}>{toArabicNumber(value)}</option>)}
            </select>
          </label>
          {maxPage < 604 && <p className="muted small">المتبقي {toArabicNumber(604 - maxPage)} صفحة ≈ {toArabicNumber(Math.ceil((604 - maxPage) / khatmahPace))} يومًا بوتيرتك.</p>}
          {maxPage >= 604 && <p className="mf-khatmah-done">أتممت ختمة — تهانينا. أعد الضبط لبدء ختمة جديدة.</p>}
          {confirmKhatmahReset ? (
            <div className="notif-confirm">
              <p>هل تريد إعادة ضبط تقدم الختمة إلى صفحة ١؟</p>
              <div style={{display: 'flex', gap: 8}}>
                <button type="button" className="primary" onClick={() => { setMaxPage(1); try { localStorage.setItem('quran-khatmah-maxpage', '1'); } catch { /* تجاهل */ } setConfirmKhatmahReset(false); notify('أُعيد ضبط التقدم.'); }}>تأكيد إعادة الضبط</button>
                <button type="button" className="soft-btn" onClick={() => setConfirmKhatmahReset(false)}>إلغاء</button>
              </div>
            </div>
          ) : (
            <button type="button" className="soft-btn" onClick={() => setConfirmKhatmahReset(true)}>إعادة ضبط</button>
          )}
        </div>
      </div>
    </div>}

    {recitersModalOpen && <div className="mf-sheet-backdrop mf-sheet-backdrop-reciters" onClick={() => setRecitersModalOpen(false)}>
      <div className="mf-sheet mf-sheet-reciters" role="dialog" aria-modal="true" aria-label="مكتبة القراء والتحميل للموبايل" onClick={event => event.stopPropagation()}>
        <div className="mf-sheet-reciters-head">
          <div className="mf-drag-handle" aria-hidden="true"/>
          <div className="mf-sheet-head">
            <div>
              <strong>مكتبة القراء والتلاوات</strong>
              <small className="muted"> استمع مباشرة أو حمّل السور للاستماع دون إنترنت</small>
            </div>
            <button type="button" className="mf-icon-btn" onClick={() => setRecitersModalOpen(false)} aria-label="إغلاق"><X size={18}/></button>
          </div>
        </div>
        <div className="mf-sheet-reciters-body">
          <RecitersAudioLibrary
            asset={asset}
            notify={notify}
            selectedReciterId={reciterId}
            selectedMoshafId={currentMoshaf?.id}
            currentSurah={pages[page - 1]?.verses[0]?.s ?? 1}
            compact
            onSelectReciter={(picked, pickedMoshaf, autoPlay) => {
              setReciterId(picked.id);
              setMoshafId(pickedMoshaf.id);
              setRecitersModalOpen(false);
              if (autoPlay) {
                const curSurah = pages[page - 1]?.verses[0]?.s ?? 1;
                const startIdx = Math.max(0, asset.verses.findIndex(v => v.s === curSurah && v.a === 1));
                const stopS = playScope === 'surah' ? curSurah : undefined;
                void playContinuousFrom(startIdx, stopS, {reciter: picked, moshaf: pickedMoshaf});
              }
            }}
          />
        </div>
      </div>
    </div>}

  </div>;
}

type ListProps = {
  asset: QuranAsset;
  pages: PageBlock[];
  surahStarts: Map<number, Set<number>>;
  sajdaKeys: Set<string>;
  basmala: string;
  fontSize: number;
  activeKey: string;
  playingKey: string;
  onSelect: (verse: QuranVerse) => void;
  registerPage: (index: number, el: HTMLDivElement | null) => void;
};

// قائمة الصفحات معزولة عن تحديثات التمرير: لا تُعاد إلا عند تغيّر محتوى فعلي،
// وكل صفحة خارج الشاشة تُستبعد من التخطيط والرسم عبر content-visibility.
const MushafPageList = function MushafPageList({asset, pages, surahStarts, sajdaKeys, basmala, fontSize, activeKey, playingKey, onSelect, registerPage}: ListProps) {
  return <div className="mf-pages" style={{fontSize: `${fontSize}px`}} dir="rtl">
    {pages.map(block => {
      const starts = surahStarts.get(block.page);
      return <div key={block.page} className="mf-page" data-page={block.page} ref={el => registerPage(block.page - 1, el)}>
        <div className="mf-page-head">
          <span>الجزء {toArabicNumber(block.verses[0]?.j ?? 1)}</span>
          <span className="mf-page-juz">صفحة {toArabicNumber(block.page)}</span>
          <span>الحزب {toArabicNumber(block.verses[0]?.h ?? 1)}</span>
        </div>
        <p className="mf-page-text">
          {block.verses.map(verse => {
            const key = `${verse.s}:${verse.a}`;
            const startsSurah = Boolean(starts?.has(verse.s) && verse.a === 1);
            return <span key={key}>
              {startsSurah && <span className="mf-surah-band"><span className="mf-surah-band-inner">سُورَةُ {surahInfo(asset, verse.s)?.name ?? ''}</span></span>}
              {startsSurah && showsBasmala(verse.s) && <span className="mf-basmala">{basmala}</span>}
              <span
                role="button"
                tabIndex={0}
                className={`mf-ayah ${activeKey === key ? 'active' : ''} ${playingKey === key ? 'playing' : ''}`}
                data-ayah={key}
                onClick={() => onSelect(verse)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(verse); } }}
                aria-label={`الآية ${toArabicNumber(verse.a)} من سورة ${surahInfo(asset, verse.s)?.name ?? verse.s}`}
              >
                {verseBody(verse.t)}
                <span className="mf-marker">{verseMarker(verse.t) || `﴿${toArabicNumber(verse.a)}﴾`}</span>
                {sajdaKeys.has(key) && <span className="mf-sajda" title="موضع سجدة">۩</span>}
              </span>
            </span>;
          })}
        </p>
        <div className="mf-page-foot">{toArabicNumber(block.page)}</div>
      </div>;
    })}
    <p className="mf-source">النص العثماني من {asset.source} · رواية {asset.narration}. حدود الصفحات والأجزاء والأحزاب كما في مصدر المجمع. التلاوات المنزَّلة على الجهاز تعمل دون إنترنت، بينما البث المباشر والتلاوات غير المنزَّلة تحتاج اتصالًا.</p>
  </div>;
            }
