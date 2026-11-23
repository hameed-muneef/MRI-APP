import { useEffect, useRef, useState } from 'react';
import {createPortal} from 'react-dom';
import { X } from 'lucide-react';
import { fetchTafsir, fetchTranslation, fetchAsbabNuzul, TAFSIRS, TRANSLATIONS, ASBAB_ATTRIBUTION } from '../../quran/content-api';
import { getVerseNote, saveVerseNote, deleteVerseNote } from '../../quran/verse-notes';

/** نص نسبة المصدر المعروض بجوار كل نص ديني. */
export function attributionLabel(sourceName: string): string {
  return `المصدر: ${sourceName}، عبر Quran.com API v4، إصدار النص غير محدد من المزود`;
}

type Props = {
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  verseText: (surah: number, ayah: number) => string | null;
  onClose: () => void;
};

/**
 * لوحة فهم الآية داخل الجلسة: تفسير وترجمة بنسبة المصدر، أسباب النزول ومعاني
 * الكلمات خلف بوابة مصدر موثوق، وملاحظات خاصة محلية قابلة للحذف.
 * لا تلمس حالة الجلسة؛ الإغلاق يعيد للنطاق كما كان.
 */
export default function UnderstandingSheet({ surah, ayahStart, ayahEnd, verseText, onClose }: Props) {
  const [topic,setTopic]=useState<'tafsir'|'translation'|'context'>('tafsir');
  const [ayah, setAyah] = useState(ayahStart);
  const [tafsirId, setTafsirId] = useState(TAFSIRS[0].id);
  const [translationId, setTranslationId] = useState(TRANSLATIONS[0].id);
  const [tafsir, setTafsir] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [asbab, setAsbab] = useState<string | null>(null);
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
    const key = `${surah}:${ayah}`;
    const controller=new AbortController();
    if(topic==='context'){setAsbab(null);void fetchAsbabNuzul(key).then(value=>{if(my!==seq.current)return;setAsbab(value);setLoading(false);}).catch(()=>{if(!controller.signal.aborted&&my===seq.current)setLoading(false);});return()=>controller.abort();}
    void (topic==='tafsir'?fetchTafsir(key,tafsirId,controller.signal):fetchTranslation(key,translationId,controller.signal)).then(value=>{
      if(my!==seq.current)return;
      if(topic==='tafsir')setTafsir(value);else setTranslation(value);
      setLoading(false);
    }).catch(()=>{if(!controller.signal.aborted&&my===seq.current)setLoading(false);});
    return()=>{controller.abort();seq.current++;};
  }, [surah, ayah, tafsirId, translationId,retry,topic]);

  const tafsirName = TAFSIRS.find((t) => t.id === tafsirId)?.name ?? 'تفسير';
  const translationName = TRANSLATIONS.find((t) => t.id === translationId)?.name ?? 'ترجمة';
  const text = verseText(surah, ayah);

  return createPortal(
    <div className="qm-sheet-backdrop"><div ref={dialog} tabIndex={-1} className="qm-sheet" dir="rtl" role="dialog" aria-modal="true" aria-label="لوحة فهم الآية">
      <div className="qm-sheet-head">
        <h3>فهم الآية {ayah} من سورة {surah}</h3>
        <button className="icon-btn" aria-label="إغلاق لوحة الفهم" onClick={close}><X size={16} /></button>
      </div>
      {ayahEnd > ayahStart && (
        <div className="qm-chips" role="group" aria-label="اختيار آية من نطاق الجلسة">
          {Array.from({ length: ayahEnd - ayahStart + 1 }, (_, i) => ayahStart + i).map((a) => (
            <button key={a} aria-pressed={a === ayah} onClick={() => {if(!noteDirty()||window.confirm('تجاهل الملاحظة غير المحفوظة؟'))setAyah(a);}}>{a}</button>
          ))}
        </div>
      )}
      {text && <p className="qm-sheet-verse">{text}</p>}
      <nav className="qm-chips" aria-label="نوع الفهم">
        <button aria-pressed={topic==='tafsir'} onClick={()=>setTopic('tafsir')}>تفسير</button>
        <button aria-pressed={topic==='translation'} onClick={()=>setTopic('translation')}>ترجمة</button>
        <button aria-pressed={topic==='context'} onClick={()=>setTopic('context')}>أسباب النزول</button>
      </nav>
      {topic==='tafsir'&&<><label className="qm-field">التفسير
        <select aria-label="التفسير" value={tafsirId} onChange={e=>setTafsirId(Number(e.target.value))}>{TAFSIRS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label><p className="qm-attribution">{attributionLabel(tafsirName)}</p>
      {loading?<p role="status">جارٍ التحميل…</p>:<p className="qm-sheet-body">{tafsir??'تعذر جلب التفسير. تحقق من الاتصال.'}</p>}</>}
      {topic==='translation'&&<><label className="qm-field">الترجمة
        <select aria-label="الترجمة" value={translationId} onChange={e=>setTranslationId(Number(e.target.value))}>{TRANSLATIONS.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label><p className="qm-attribution">{attributionLabel(translationName)}</p>
      {loading?<p role="status">جارٍ التحميل…</p>:<p className="qm-sheet-body">{translation??'تعذر جلب الترجمة. تحقق من الاتصال.'}</p>}</>}
      {topic==='context'&&<><p className="qm-attribution">{attributionLabel(ASBAB_ATTRIBUTION)}</p>
      {loading?<p role="status">جارٍ التحميل…</p>:<p className="qm-sheet-body">{asbab??'لا يوجد سبب نزول لهذه الآية في هذا المصدر.'}</p>}</>}
      {topic!=='context'&&!loading&&!(topic==='tafsir'?tafsir:translation)&&<button onClick={()=>setRetry(v=>v+1)}>إعادة تحميل المصدر</button>}
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
