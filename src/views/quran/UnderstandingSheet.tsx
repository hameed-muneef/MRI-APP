import { useEffect, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import { X } from 'lucide-react';
import { fetchTafsir, fetchTranslation, fetchWordMeanings, WORD_MEANINGS_ATTRIBUTION, WORD_MEANINGS_PROVIDER, TAFSIRS, TRANSLATIONS, type WordMeaning } from '../../quran/content-api';
import { getVerseNote, saveVerseNote, deleteVerseNote } from '../../quran/verse-notes';
import { toArabicNumber, verseBody, verseMarker } from '../../quran/content';

/** صيغة نسبة المصدر (تُعرض في مواضع المصادر العامة). */
export function attributionLabel(sourceName: string, provider?: string): string {
  if (provider) return `المصدر: ${sourceName}، ${provider}`;
  return `المصدر: ${sourceName}، عبر Quran.com API v4، إصدار النص غير محدد من المزود`;
}

type Props = {
  surah: number;
  surahName?: string;
  ayahStart: number;
  ayahEnd: number;
  verseText: (surah: number, ayah: number) => string | null;
  onClose: () => void;
  initialTopic?: 'tafsir'|'translation';
  initialTafsirId?: number;
  initialTranslationId?: number;
};

/**
 * لوحة فهم الآية داخل الجلسة: تفسير وترجمة ومعاني الكلمات،
 * وملاحظات خاصة محلية قابلة للحذف. لا تلمس حالة الجلسة؛ الإغلاق يعيد للنطاق كما كان.
 */
export default function UnderstandingSheet({ surah, surahName, ayahStart, ayahEnd, verseText, onClose, initialTopic, initialTafsirId, initialTranslationId }: Props) {
  const [topic,setTopic]=useState<'tafsir'|'translation'|'words'>(initialTopic ?? 'tafsir');
  const [ayah, setAyah] = useState(ayahStart);
  const [tafsirId, setTafsirId] = useState(initialTafsirId ?? TAFSIRS[0].id);
  const [translationId, setTranslationId] = useState(initialTranslationId ?? TRANSLATIONS[0].id);
  const [tafsir, setTafsir] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [words, setWords] = useState<WordMeaning[] | null>(null);
  const [contentError, setContentError] = useState(false);
  const [wordsError, setWordsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [noteSavedAt, setNoteSavedAt] = useState<string | null>(null);
  const seq = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const [saveError,setSaveError] = useState('');
  const [retry,setRetry] = useState(0);
  const noteDirty = () => note !== (getVerseNote(surah,ayah)?.text ?? '');
  const close = () => {if(!noteDirty() || window.confirm('تجاهل الملاحظة غير المحفوظة؟'))onClose();};
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();dialog.current?.querySelector<HTMLButtonElement>('[aria-label="إغلاق لوحة الفهم"]')?.click();}
      if(e.key==='Tab'){
        const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button,select,textarea,[tabindex="0"]')??[]).filter(el=>!el.hasAttribute('disabled'));
        const first=items[0],last=items[items.length-1];
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  useEffect(()=>{
    const existing=getVerseNote(surah,ayah);
    setNote(existing?.text??'');setNoteSavedAt(existing?.updatedAt??null);setSaveError('');
  },[surah,ayah]);

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    setTafsir(null);
    setTranslation(null);
    setContentError(false);
    const key = `${surah}:${ayah}`;
    const controller=new AbortController();
    if(topic==='words'){setWords(null);setWordsError(false);void fetchWordMeanings(key).then(value=>{if(my!==seq.current)return;setWords(value);setLoading(false);}).catch(()=>{if(!controller.signal.aborted&&my===seq.current){setWordsError(true);setLoading(false);}});return()=>controller.abort();}
    void (topic==='tafsir'?fetchTafsir(key,tafsirId,controller.signal):fetchTranslation(key,translationId,controller.signal)).then(value=>{
      if(my!==seq.current)return;
      if(topic==='tafsir')setTafsir(value);else setTranslation(value);
      setLoading(false);
    }).catch(()=>{if(!controller.signal.aborted&&my===seq.current){setContentError(true);setLoading(false);}});
    return()=>{controller.abort();seq.current++;};
  }, [surah, ayah, tafsirId, translationId,retry,topic]);

  const text = verseText(surah, ayah);

  return createPortal(
    <div className="qm-sheet-backdrop"><div ref={dialog} tabIndex={-1} className="qm-sheet" dir="rtl" role="dialog" aria-modal="true" aria-label="لوحة فهم الآية">
      <div className="qm-sheet-head">
        <h3>فهم الآية {toArabicNumber(ayah)} من سورة {surahName ?? toArabicNumber(surah)}</h3>
        <button className="icon-btn" aria-label="إغلاق لوحة الفهم" onClick={close}><X size={16} /></button>
      </div>
      {ayahEnd > ayahStart && (
        <div className="qm-chips" role="group" aria-label="اختيار آية من نطاق الجلسة">
          {Array.from({ length: ayahEnd - ayahStart + 1 }, (_, i) => ayahStart + i).map((a) => (
            <button key={a} aria-pressed={a === ayah} onClick={() => {if(!noteDirty()||window.confirm('تجاهل الملاحظة غير المحفوظة؟'))setAyah(a);}}>{toArabicNumber(a)}</button>
          ))}
        </div>
      )}
      {text && <p className="qm-sheet-verse" dir="rtl">{verseBody(text)}<span className="quran-verse-marker" aria-label={`رقم الآية ${ayah}`}>{verseMarker(text) || `۝${toArabicNumber(ayah)}`}</span></p>}
      <nav className="qm-chips" aria-label="نوع الفهم">
        <button aria-pressed={topic==='tafsir'} onClick={()=>setTopic('tafsir')}>تفسير</button>
        <button aria-pressed={topic==='translation'} onClick={()=>setTopic('translation')}>ترجمة</button>
        <button aria-pressed={topic==='words'} onClick={()=>setTopic('words')}>معاني الكلمات</button>
      </nav>
      {topic==='tafsir'&&<><label className="qm-field">التفسير
        <select aria-label="التفسير" value={tafsirId} onChange={e=>setTafsirId(Number(e.target.value))}>{TAFSIRS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label>
      {loading?<p role="status">جارٍ التحميل…</p>:contentError?<p className="qm-sheet-body">تعذر جلب التفسير. تحقق من الاتصال.</p>:<p className="qm-sheet-body">{tafsir??'لا يوجد تفسير لهذه الآية في هذا المصدر.'}</p>}
      {!loading&&!contentError&&<p className="qm-muted qm-attribution">{attributionLabel(TAFSIRS.find(t=>t.id===tafsirId)?.name??'التفسير')}</p>}</>}
      {topic==='translation'&&<><label className="qm-field">الترجمة
        <select aria-label="الترجمة" value={translationId} onChange={e=>setTranslationId(Number(e.target.value))}>{TRANSLATIONS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label>
      {loading?<p role="status">جارٍ التحميل…</p>:contentError?<p className="qm-sheet-body">تعذر جلب الترجمة. تحقق من الاتصال.</p>:<p className="qm-sheet-body">{translation??'لا توجد ترجمة لهذه الآية في هذا المصدر.'}</p>}
      {!loading&&!contentError&&<p className="qm-muted qm-attribution">{attributionLabel(TRANSLATIONS.find(t=>t.id===translationId)?.name??'الترجمة')}</p>}</>}
      {topic==='words'&&<>
      {loading?<p role="status">جارٍ التحميل…</p>:wordsError?<p className="qm-sheet-body">تعذر تحميل معاني الكلمات. تحقق من الاتصال وأعد المحاولة.</p>:(words&&words.length?<dl className="qm-words">{words.map((w,i)=><div key={i}><dt>{w.word}</dt><dd>{w.meaning}</dd></div>)}</dl>:<p className="qm-sheet-body">لا توجد شروح كلمات لهذه الآية في هذا المصدر.</p>)}
      {!loading&&!wordsError&&<p className="qm-muted qm-attribution">{attributionLabel(WORD_MEANINGS_ATTRIBUTION,WORD_MEANINGS_PROVIDER)}</p>}</>}
      {!loading&&(((topic==='tafsir'||topic==='translation')&&contentError)||(topic==='words'&&wordsError))&&<button onClick={()=>setRetry(v=>v+1)}>إعادة تحميل المصدر</button>}
      <details><summary>ملاحظاتي الخاصة</summary>
      <h4>ملاحظاتي الخاصة</h4>
      <p className="qm-muted">محلية على هذا الجهاز فقط، منفصلة عن سجلات الحفظ، ويمكن حذفها في أي وقت.</p>
      <textarea
        aria-label="ملاحظة خاصة عن الآية"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={4000}
      />
      <div className="qm-chips">
        <button className="qm-primary" onClick={() => {
          if (saveVerseNote(surah, ayah, note)){setNoteSavedAt(note.trim() ? new Date().toISOString() : null);setSaveError('');}else setSaveError('تعذر حفظ الملاحظة. لم تُفقد كتابتك؛ أفرغ مساحة وأعد المحاولة.');
        }}>حفظ الملاحظة محليًا</button>
        {noteSavedAt && <button onClick={() => { if (deleteVerseNote(surah, ayah)) { setNote(''); setNoteSavedAt(null);setSaveError(''); }else setSaveError('تعذر حذف الملاحظة. أعد المحاولة.'); }}>حذف الملاحظة</button>}
      </div>
      {saveError&&<p role="alert">{saveError}</p>}
      {noteSavedAt && <p className="qm-muted">محفوظة على الجهاز.</p>}</details>
    </div></div>,document.body
  );
}
