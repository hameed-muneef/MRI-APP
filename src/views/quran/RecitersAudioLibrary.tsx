// مكتبة القراء والتلاوات: تصفح ٢٤٠+ قارئًا مشهورًا بجميع الروايات،
// مع البحث السريع، والاستماع المباشر عند الفتح، وتنزيل السور على الموبايل
// للعمل دون إنترنت (في Android التخزين الخاص + Web Cache Storage).

import {useEffect, useMemo, useRef, useState} from 'react';
import {
  CheckCircle2, Download, HardDrive, Pause, Play, RefreshCw, Search, Trash2, Volume2, WifiOff, X,
} from 'lucide-react';
import type {QuranAsset} from '../../quran/types';
import {
  defaultMoshaf, loadReciters, moshafCategory, searchReciters,
  type Reciter, type ReciterMoshaf,
} from '../../quran/audio';
import {resolveAyahSourceForMp3QuranReciter} from '../../quran/ayah-audio';
import {
  deleteReciterAudioPack, downloadReciterAudioPack, listOfflineAudioPacks,
  saveSelectedReciterPref, totalOfflineAudioBytes,
  type AudioDownloadProgress, type OfflineAudioPack,
} from '../../quran/offline-audio';
import {toArabicNumber} from '../../quran/content';
import {useOnline} from '../../online';

type FilterTab = 'famous' | 'all' | 'downloaded' | 'narrations';
type ScopeKind = 'current' | 'juz_amma' | 'mufassal' | 'all' | 'single';

type Props = {
  asset: QuranAsset;
  notify: (text: string) => void;
  selectedReciterId?: number | null;
  selectedMoshafId?: number | null;
  currentSurah?: number;
  compact?: boolean;
  onSelectReciter?: (reciter: Reciter, moshaf: ReciterMoshaf, autoPlay: boolean) => void;
};

function formatBytes(bytes: number): string {
  if (!bytes) return '٠ بايت';
  if (bytes < 1024) return `${toArabicNumber(bytes)} بايت`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${toArabicNumber(mb.toFixed(1))} م.ب`;
  const kb = bytes / 1024;
  return `${toArabicNumber(Math.max(1, Math.round(kb)))} ك.ب`;
}

export default function RecitersAudioLibrary({
  asset,
  notify,
  selectedReciterId,
  selectedMoshafId,
  currentSurah,
  compact = false,
  onSelectReciter,
}: Props) {
  const online = useOnline();
  const [reciters, setReciters] = useState<Reciter[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshingList, setRefreshingList] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('famous');
  const [scope, setScope] = useState<ScopeKind>(() => (currentSurah ? 'current' : 'juz_amma'));
  const [singleSurah, setSingleSurah] = useState<number>(currentSurah ?? 1);
  const [chosenMoshafs, setChosenMoshafs] = useState<Record<number, number>>({});
  const [packs, setPacks] = useState<Record<number, OfflineAudioPack>>({});
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadingMoshafId, setDownloadingMoshafId] = useState<number | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<AudioDownloadProgress | null>(null);
  const [confirmDeleteMoshafId, setConfirmDeleteMoshafId] = useState<number | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(40);

  const abortRef = useRef<AbortController | null>(null);

  const reloadOfflinePacks = () => {
    const all = listOfflineAudioPacks();
    const next: Record<number, OfflineAudioPack> = {};
    for (const p of all) next[p.moshafId] = p;
    setPacks(next);
    setTotalBytes(totalOfflineAudioBytes());
  };

  useEffect(() => {
    let active = true;
    reloadOfflinePacks();
    loadReciters({
      onNetworkUpdate: updated => {
        if (active) setReciters(updated);
      },
    })
      .then(list => {
        if (!active) return;
        setReciters(list);
        setLoadingList(false);
      })
      .catch(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  useEffect(() => {
    if (currentSurah) {
      setSingleSurah(currentSurah);
    }
  }, [currentSurah]);

  const handleRefreshCatalog = async () => {
    if (!online) {
      notify('تحديث قائمة القراء يحتاج اتصالًا بالإنترنت.');
      return;
    }
    setRefreshingList(true);
    try {
      const updated = await loadReciters({forceRefresh: true});
      setReciters(updated);
      notify(`تم تحديث قائمة القراء (${toArabicNumber(updated.length)} قارئًا).`);
    } catch {
      notify('تعذر تحديث قائمة القراء الآن.');
    } finally {
      setRefreshingList(false);
    }
  };

  const resolveMoshaf = (reciter: Reciter): ReciterMoshaf => {
    const manualId = chosenMoshafs[reciter.id] ?? (selectedReciterId === reciter.id ? selectedMoshafId : undefined);
    if (manualId) {
      const found = reciter.moshaf.find(m => m.id === manualId);
      if (found) return found;
    }
    return defaultMoshaf(reciter) ?? reciter.moshaf[0];
  };

  const targetChapters = useMemo<number[]>(() => {
    if (scope === 'current' && currentSurah) return [currentSurah];
    if (scope === 'single') return [singleSurah];
    if (scope === 'juz_amma') return Array.from({length: 114 - 78 + 1}, (_, i) => 78 + i);
    if (scope === 'mufassal') return Array.from({length: 114 - 49 + 1}, (_, i) => 49 + i);
    return Array.from({length: 114}, (_, i) => i + 1);
  }, [scope, currentSurah, singleSurah]);

  const scopeLabel = useMemo(() => {
    if (scope === 'current' && currentSurah) {
      const s = asset.surahs.find(x => x.n === currentSurah);
      return s ? `سورة ${s.name}` : `سورة ${toArabicNumber(currentSurah)}`;
    }
    if (scope === 'single') {
      const s = asset.surahs.find(x => x.n === singleSurah);
      return s ? `سورة ${s.name}` : `سورة ${toArabicNumber(singleSurah)}`;
    }
    if (scope === 'juz_amma') return 'جزء عمّ';
    if (scope === 'mufassal') return 'المفصّل';
    return 'المصحف كاملًا';
  }, [asset, scope, currentSurah, singleSurah]);

  const currentSurahNameShort = useMemo(() => {
    if (!currentSurah) return '';
    return asset.surahs.find(x => x.n === currentSurah)?.name ?? `سورة ${toArabicNumber(currentSurah)}`;
  }, [asset, currentSurah]);

  const scopeOptions: {id: ScopeKind; label: string}[] = useMemo(() => [
    ...(currentSurah ? [{id: 'current' as const, label: `السورة الحالية (${currentSurahNameShort})`}] : []),
    {id: 'juz_amma', label: 'جزء عمّ (٣٧)'},
    {id: 'mufassal', label: 'المفصّل (٦٦)'},
    {id: 'all', label: 'المصحف كاملًا'},
    {id: 'single', label: 'سورة محددة'},
  ], [currentSurah, currentSurahNameShort]);

  const filteredReciters = useMemo(() => {
    let base = reciters;
    if (tab === 'famous') {
      base = reciters.filter(r => r.famous);
    } else if (tab === 'downloaded') {
      base = reciters.filter(r => r.moshaf.some(m => (packs[m.id]?.chapters.length ?? 0) > 0));
    } else if (tab === 'narrations') {
      base = reciters.filter(r => r.moshaf.some(m => moshafCategory(m.name) !== 'hafs'));
    }
    if (!query.trim()) return base;
    return searchReciters(base.length > 0 || tab === 'downloaded' ? base : reciters, query);
  }, [reciters, tab, query, packs]);

  const displayedReciters = useMemo(() => {
    if (query.trim() || tab === 'downloaded' || tab === 'famous') return filteredReciters;
    return filteredReciters.slice(0, visibleLimit);
  }, [filteredReciters, query, tab, visibleLimit]);

  const startDownload = async (reciter: Reciter, moshaf: ReciterMoshaf) => {
    if (!online) {
      notify('تنزيل التلاوات يحتاج اتصالًا بالإنترنت. السور المنزّلة مسبقًا تعمل بلا اتصال.');
      return;
    }
    if (downloadingMoshafId !== null) {
      notify('يوجد تنزيل جارٍ بالفعل. أوقفه أولًا.');
      return;
    }

    const available = targetChapters.filter(ch => moshaf.surahList.includes(ch));
    if (available.length === 0) {
      notify('السورة المختارة غير متوفرة لدى هذا القارئ في هذه الرواية.');
      return;
    }

    const existing = packs[moshaf.id];
    const remaining = available.filter(ch => !existing?.chapters.includes(ch));
    if (remaining.length === 0) {
      notify(`${reciter.name}: ${scopeLabel} منزَّلة بالكامل على الجهاز.`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setDownloadingMoshafId(moshaf.id);

    try {
      const donePack = await downloadReciterAudioPack({
        reciter,
        moshaf,
        chapters: available,
        signal: controller.signal,
        onProgress: progress => {
          setDownloadProgress(progress);
          setPacks(prev => ({...prev, [progress.pack.moshafId]: progress.pack}));
          setTotalBytes(totalOfflineAudioBytes());
        },
      });
      setPacks(prev => ({...prev, [donePack.moshafId]: donePack}));
      notify(`اكتمل تحميل ${reciter.name} (${scopeLabel}) على الجهاز.`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        notify('أُوقف التحميل مع حفظ السور التي اكتملت. يمكنك الاستئناف لاحقًا.');
      } else {
        notify('تعذر إكمال التحميل. تحقق من اتصال الإنترنت وأعد المحاولة.');
      }
    } finally {
      setDownloadingMoshafId(null);
      setDownloadProgress(null);
      abortRef.current = null;
      reloadOfflinePacks();
    }
  };

  const stopDownload = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleDeletePack = async (moshafId: number, reciterName: string) => {
    await deleteReciterAudioPack(moshafId);
    reloadOfflinePacks();
    setConfirmDeleteMoshafId(null);
    notify(`حُذفت تلاوات ${reciterName} المحفوظة.`);
  };

  const handleSelect = (reciter: Reciter, moshaf: ReciterMoshaf, autoPlay: boolean) => {
    saveSelectedReciterPref({
      reciterId: reciter.id,
      moshafId: moshaf.id,
      reciterName: reciter.name,
      moshafName: moshaf.name,
    });
    if (onSelectReciter) {
      onSelectReciter(reciter, moshaf, autoPlay);
    } else {
      notify(`تم اختيار القارئ: ${reciter.name} (${moshaf.name}). افتح المصحف للاستماع.`);
    }
  };

  return (
    <section className={`offline-library reciters-library ${compact ? 'reciters-compact' : 'panel'}`}>
      {!compact ? (
        <header className="ol-head">
          <div>
            <h3><Volume2 size={18}/> مكتبة القراء والتلاوات ({toArabicNumber(reciters.length)} قارئًا)</h3>
            <p className="muted">
              اختر قارئًا للاستماع المباشر عند الفتح، أو نزّل السور إلى جهازك للعمل دون إنترنت.
            </p>
          </div>
          <div className="reciters-head-meta">
            <span className="reciters-storage-text"><HardDrive size={14}/> المحفوظ: {formatBytes(totalBytes)}</span>
            <button type="button" className="soft-btn" onClick={() => void handleRefreshCatalog()} disabled={refreshingList}>
              <RefreshCw size={14} className={refreshingList ? 'spin' : ''}/> تحديث
            </button>
          </div>
        </header>
      ) : (
        <div className="reciters-compact-meta">
          <span className="reciters-storage-text">
            <HardDrive size={13}/> المحفوظ: {formatBytes(totalBytes)} · {toArabicNumber(reciters.length)} قارئًا
          </span>
          <button type="button" className="reciters-mini-refresh" onClick={() => void handleRefreshCatalog()} disabled={refreshingList}>
            <RefreshCw size={13} className={refreshingList ? 'spin' : ''}/> تحديث
          </button>
        </div>
      )}

      <div className="reciters-controls">
        <label className="reciters-search-box">
          <Search size={16}/>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث باسم القارئ أو الرواية (مثل: الدوسري، ورش…)"
            aria-label="ابحث عن قارئ"
          />
          {query && (
            <button
              type="button"
              className="reciters-search-clear"
              aria-label="مسح البحث"
              onClick={() => setQuery('')}
            >
              <X size={15}/>
            </button>
          )}
        </label>

        <div className="reciters-tabs" role="tablist" aria-label="تصنيف القراء">
          <button type="button" role="tab" aria-selected={tab === 'famous'} className={tab === 'famous' ? 'active' : ''} onClick={() => setTab('famous')}>
            الأشهر
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
            الكل ({toArabicNumber(reciters.length)})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'downloaded'} className={tab === 'downloaded' ? 'active' : ''} onClick={() => setTab('downloaded')}>
            المنزّلون ({toArabicNumber(Object.keys(packs).length)})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'narrations'} className={tab === 'narrations' ? 'active' : ''} onClick={() => setTab('narrations')}>
            ورش وغيرها
          </button>
        </div>

        <div className="reciters-scope-bar">
          <span className="reciters-scope-label">نطاق التحميل:</span>
          <div className="reciters-scope-chips" role="radiogroup" aria-label="نطاق تحميل التلاوات">
            {scopeOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={scope === opt.id}
                className={`reciters-scope-chip ${scope === opt.id ? 'active' : ''}`}
                disabled={downloadingMoshafId !== null}
                onClick={() => setScope(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {scope === 'single' && (
          <div className="reciters-single-surah">
            <label>
              <span>اختر السورة:</span>
              <select
                value={singleSurah}
                onChange={e => setSingleSurah(Number(e.target.value))}
                disabled={downloadingMoshafId !== null}
                aria-label="اختيار السورة للتحميل"
              >
                {asset.surahs.map(s => (
                  <option key={s.n} value={s.n}>{toArabicNumber(s.n)}. {s.name}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {!online && (
        <p className="reciters-offline-note muted small">
          <WifiOff size={14}/> غير متصل — القراء المنزَّلون متاحون للتشغيل فورًا دون إنترنت.
        </p>
      )}

      {loadingList ? (
        <p className="muted">جارٍ تجهيز قائمة القراء…</p>
      ) : displayedReciters.length === 0 ? (
        <p className="muted">
          {tab === 'downloaded'
            ? 'لا توجد تلاوات منزّلة بعد. اختر نطاق التحميل واضغط «تحميل» عند توفر الإنترنت.'
            : 'لا توجد نتائج مطابقة للبحث.'}
        </p>
      ) : (
        <ul className="ol-list reciters-list">
          {displayedReciters.map(reciter => {
            const moshaf = resolveMoshaf(reciter);
            const pack = packs[moshaf.id];
            const isDownloading = downloadingMoshafId === moshaf.id;
            const isSelected = selectedReciterId === reciter.id && (!selectedMoshafId || selectedMoshafId === moshaf.id);
            const hasAyahAudio = Boolean(resolveAyahSourceForMp3QuranReciter(reciter.id, moshaf.name));
            const downloadedCount = pack?.chapters.length ?? 0;
            const allTargetDone = targetChapters
              .filter(ch => moshaf.surahList.includes(ch))
              .every(ch => pack?.chapters.includes(ch));
            const pct = isDownloading && downloadProgress
              ? Math.min(100, Math.round((downloadProgress.completedCount / Math.max(1, downloadProgress.totalCount)) * 100))
              : 0;
            const dlSurahName = isDownloading && downloadProgress
              ? asset.surahs.find(s => s.n === downloadProgress.currentSurah)?.name ?? `سورة ${downloadProgress.currentSurah}`
              : '';

            return (
              <li key={reciter.id} className={`ol-row reciter-card ${isSelected ? 'reciter-selected' : ''}`}>
                <div className="reciter-card-top">
                  <div className="reciter-info">
                    <div className="reciter-title-row">
                      <strong>{reciter.name}</strong>
                      {downloadedCount > 0 && (
                        <span className="ol-done"><CheckCircle2 size={13}/> {toArabicNumber(downloadedCount)} سورة</span>
                      )}
                    </div>

                    <div className="reciter-sub-row">
                      {reciter.moshaf.length > 1 ? (
                        <select
                          className="reciter-inline-moshaf"
                          value={moshaf.id}
                          onChange={e => setChosenMoshafs(prev => ({...prev, [reciter.id]: Number(e.target.value)}))}
                          disabled={downloadingMoshafId !== null}
                          aria-label={`رواية ${reciter.name}`}
                        >
                          {reciter.moshaf.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({toArabicNumber(m.surahList.length)} سورة)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="reciter-meta-text">
                          {moshaf.name} · {toArabicNumber(moshaf.surahList.length)} سورة
                        </span>
                      )}
                      {hasAyahAudio && <span className="reciter-tag ayah-tag">آية بآية</span>}
                      {pack && pack.bytes > 0 && <span className="reciter-tag">{formatBytes(pack.bytes)}</span>}
                    </div>
                  </div>
                </div>

                {isDownloading && downloadProgress && (
                  <div className="reciter-dl-progress">
                    <div className="ol-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <span style={{width: `${Math.max(4, pct)}%`}}/>
                    </div>
                    <small className="muted">
                      {toArabicNumber(pct)}٪ ({toArabicNumber(downloadProgress.completedCount)}/{toArabicNumber(downloadProgress.totalCount)}) — سورة {dlSurahName}
                    </small>
                  </div>
                )}

                <div className="reciter-actions">
                  <button
                    type="button"
                    className={`reciter-btn-listen ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelect(reciter, moshaf, true)}
                    disabled={!online && downloadedCount === 0}
                  >
                    <Play size={15}/> {onSelectReciter ? (isSelected ? 'مُختار · تشغيل' : 'استماع الآن') : 'اختيار'}
                  </button>

                  {isDownloading ? (
                    <button type="button" className="reciter-btn-dl downloading" onClick={stopDownload}>
                      <Pause size={15}/> إيقاف
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`reciter-btn-dl ${allTargetDone ? 'done' : ''}`}
                      onClick={() => void startDownload(reciter, moshaf)}
                      disabled={downloadingMoshafId !== null || (!online && !allTargetDone)}
                    >
                      <Download size={15}/> {allTargetDone ? 'مكتمل' : downloadedCount > 0 ? 'استكمال' : 'تحميل'}
                    </button>
                  )}

                  {pack && pack.chapters.length > 0 && !isDownloading && (
                    confirmDeleteMoshafId === moshaf.id ? (
                      <div className="reciter-confirm-del">
                        <button type="button" className="soft-btn" onClick={() => void handleDeletePack(moshaf.id, reciter.name)}>تأكيد الحذف</button>
                        <button type="button" className="soft-btn" onClick={() => setConfirmDeleteMoshafId(null)}>إلغاء</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn reciter-btn-trash"
                        aria-label={`حذف تلاوات ${reciter.name}`}
                        onClick={() => setConfirmDeleteMoshafId(moshaf.id)}
                      >
                        <Trash2 size={15}/>
                      </button>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!query.trim() && tab !== 'famous' && tab !== 'downloaded' && displayedReciters.length < filteredReciters.length && (
        <div className="reciters-load-more">
          <button type="button" className="soft-btn" onClick={() => setVisibleLimit(v => v + 60)}>
            عرض المزيد ({toArabicNumber(filteredReciters.length - displayedReciters.length)})
          </button>
        </div>
      )}

      {!compact && (
        <p className="ol-foot muted small">
          التلاوات المنزَّلة تبقى محفوظة على جهازك وتعمل في الخلفية حتى دون اتصال بالإنترنت.
        </p>
      )}
    </section>
  );
}
