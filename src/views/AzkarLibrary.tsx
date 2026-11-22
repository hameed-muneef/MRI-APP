import {useEffect, useMemo, useState} from 'react';
import {BookOpen, Search, Volume2, Square, RotateCcw, CheckCircle2} from 'lucide-react';
import {backgroundAudio} from '../audio/background-player';
import {useBackgroundAudio} from '../audio/useBackgroundAudio';
import type {AudioTrack} from '../audio/types';
import type {AzkarAsset, AzkarCategory} from '../azkar/types';
import {loadAzkar, azkarAudioUrl, azkarAudioFallbackUrls, resetAzkarCache} from '../azkar/content';

type Lang = 'ar' | 'en' | 'tr';

const STORAGE_KEY = 'azkar-counts-v1';

function readCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export default function AzkarLibrary() {
  const [asset, setAsset] = useState<AzkarAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>(readCounts);
  const audioState = useBackgroundAudio();

  const playingKey =
    audioState.category === 'azkar' &&
    (audioState.status === 'playing' || audioState.status === 'loading') &&
    audioState.currentTrack?.id.startsWith('azkar:')
      ? audioState.currentTrack.id.slice('azkar:'.length)
      : null;

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    loadAzkar()
      .then(data => { if (active) setAsset(data); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'تعذر تحميل الأذكار.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(counts)); } catch { /* ignore */ }
  }, [counts]);

  const categories: AzkarCategory[] = asset ? asset[lang] : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map(cat => ({
        ...cat,
        array: cat.array.filter(item =>
          cat.category.toLowerCase().includes(q) || item.text.toLowerCase().includes(q)
        )
      }))
      .filter(cat => cat.array.length > 0);
  }, [categories, query]);

  const toggle = (id: number) => setOpen(prev => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  const bump = (catId: number, itemId: number, count: number) => {
    const key = `${lang}:${catId}:${itemId}`;
    setCounts(prev => {
      const current = prev[key] ?? 0;
      const next = current + 1 > count ? 0 : current + 1;
      return {...prev, [key]: next};
    });
  };

  const reset = (catId: number, itemId: number) => {
    const key = `${lang}:${catId}:${itemId}`;
    setCounts(prev => ({...prev, [key]: 0}));
  };

  const stopAudio = () => {
    void backgroundAudio.stop();
  };

  const play = (cat: AzkarCategory, itemId: number) => {
    // تجهيز قائمة صوتية كاملة لأذكار هذه الفئة لكي ينتقل المشغّل تلقائيًا
    // حتى عند مغادرة الصفحة أو إغلاق شاشة الهاتف.
    const tracks: AudioTrack[] = [];
    let startIndex = 0;
    for (const item of cat.array) {
      const url = azkarAudioUrl(item.audio);
      if (!url) continue;
      if (item.id === itemId) startIndex = tracks.length;
      const snippet = item.text.length > 72 ? `${item.text.slice(0, 72)}…` : item.text;
      tracks.push({
        id: `azkar:${lang}:${cat.id}:${item.id}`,
        title: cat.category,
        subtitle: snippet,
        url,
        fallbackUrls: azkarAudioFallbackUrls(item.audio),
        category: 'azkar',
      });
    }
    if (!tracks.length) return;
    void backgroundAudio.playQueue(tracks, startIndex, 'azkar');
  };

  if (loading) return <section className="panel"><p>جارٍ تحميل الأذكار…</p></section>;
  if (error) return <section className="panel quran-error"><h3>تعذر التحميل</h3><p>{error}</p><button className="soft-btn" onClick={() => { resetAzkarCache(); window.location.reload(); }}>إعادة المحاولة</button></section>;

  return <div className="azkar-page">
    <section className="panel azkar-head">
      <div>
        <span className="eyebrow">حصن Muslim — Sheikh Sa'eed Al-Qahtani</span>
        <h2>أذكار</h2>
        <p className="muted">132 فئة، 185 ذكرًا ودعاءً. الصوت يعمل في الخلفية وينتقل تلقائيًا عبر أذكار الفئة.</p>
      </div>
      <div className="azkar-controls">
        <div className="azkar-lang">
          {(['ar', 'en', 'tr'] as Lang[]).map(code => (
            <button key={code} className={lang === code ? 'selected' : ''} onClick={() => setLang(code)}>
              {code === 'ar' ? 'العربية' : code === 'en' ? 'English' : 'Türkçe'}
            </button>
          ))}
        </div>
        <label className="azkar-search">
          <Search size={16} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث في الأذكار…" />
        </label>
      </div>
    </section>

    <div className="azkar-list">
      {filtered.map(cat => (
        <section className="panel azkar-category" key={cat.id}>
          <button className="azkar-category-head" onClick={() => toggle(cat.id)}>
            <BookOpen size={18} />
            <strong>{cat.category}</strong>
            <span className="azkar-count">{cat.array.length}</span>
          </button>
          {open.has(cat.id) && <ul className="azkar-items">
            {cat.array.map(item => {
              const key = `${lang}:${cat.id}:${item.id}`;
              const done = counts[key] ?? 0;
              const complete = item.count > 0 && done >= item.count;
              return <li key={item.id} className={complete ? 'done' : ''}>
                <p className="azkar-text">{item.text}</p>
                {item.transliteration && <p className="azkar-translit">{item.transliteration}</p>}
                <div className="azkar-item-row">
                  <span className="azkar-repeat">×{item.count}</span>
                  <div className="azkar-progress">
                    <span style={{width: `${Math.min(100, (done / Math.max(1, item.count)) * 100)}%`}} />
                  </div>
                  <span className="azkar-done">{done}/{item.count}</span>
                  {item.audio && <button className="icon-btn" title={playingKey === key ? 'إيقاف' : 'استماع'} aria-label={playingKey === key ? 'إيقاف' : 'استماع'} onClick={() => playingKey === key ? stopAudio() : play(cat, item.id)}>{playingKey === key ? <Square size={15}/> : <Volume2 size={15}/>}</button>}
                  <button className="soft-btn" onClick={() => bump(cat.id, item.id, item.count)}>+1</button>
                  <button className="icon-btn" title="إعادة" onClick={() => reset(cat.id, item.id)}><RotateCcw size={14} /></button>
                  {complete && <CheckCircle2 size={16} className="azkar-complete" />}
                </div>
              </li>;
            })}
          </ul>}
        </section>
      ))}
      {filtered.length === 0 && <p className="muted">لا توجد نتائج.</p>}
    </div>

    <footer className="azkar-footnote">
      <p>المصدر: حصن المسلم — Sheikh Sa'eed Al-Qahtani. الترخيص MIT (Yousef Asalya). الأذكار نصوص دعاء/ذكر، وليست فتوى. لا تُستبدل بقراءة القرآن أو صلاة.</p>
    </footer>
  </div>;
}
