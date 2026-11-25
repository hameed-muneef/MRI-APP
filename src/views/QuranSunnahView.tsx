import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useBackHandler} from '../navigation/useBackHandler';
import {
  BookOpen, Brain, Library, ScrollText, CalendarClock, TrendingUp,
  Flower2, BookType, Languages, Volume2
} from 'lucide-react';
import '../quran.css';
import '../quran-navigation.css';
import type {QuranAsset, QuranLearningState} from '../quran/types';
import type {Task, TaskSchedule} from '../app-state';
import {loadQuran} from '../quran/content';
import MushafPages from './quran/MushafPages';
import OfflineLibrary from './quran/OfflineLibrary';
import RecitersAudioLibrary from './quran/RecitersAudioLibrary';
import QuranMemorization from './quran/QuranMemorization';
import QuranRevision from './quran/QuranRevision';
import HadithLibrary from './quran/HadithLibrary';
import QuranRoutine from './quran/QuranRoutine';
import QuranProgress from './quran/QuranProgress';
import QuranJourney from './quran/QuranJourney';
import HifzHome from './quran/HifzHome';
import QuranPlansCard from './quran/QuranPlansCard';
import AzkarLibrary from './AzkarLibrary';
import {EmptyNote} from './quran/ui';

export type QuranSection = 'mushaf' | 'tafsir' | 'translations' | 'reciters' | 'hifz' | 'plans' | 'revision' | 'bukhari' | 'muslim' | 'sunnah' | 'routine' | 'progress' | 'azkar';

type Props = {
  /** يرجع إلى الشاشة السابقة في التطبيق عندما لا يوجد قسم سابق داخل القرآن. */
  onBackToPrevious?: () => void;
  state: QuranLearningState;
  onState: (next: QuranLearningState) => void;
  tasks: Task[];
  onTasks: (tasks: Task[]) => void;
  taskSchedules?: Record<string, TaskSchedule>;
  onTaskSchedules?: (next: Record<string, TaskSchedule>) => void;
  notify: (text: string) => void;
  onOpenTasks: () => void;
  initialSection?: QuranSection;
};

const SECTIONS: {id: QuranSection; title: string; description: string; icon: typeof BookOpen}[] = [
  {id: 'mushaf', title: 'المصحف الشريف', description: 'تمرير رأسي متصل على صفحات المصحف (٦٠٤)، مع انتقال بالسورة والجزء والحزب والصفحة والآية، وتفسير وترجمة وعلامات وملاحظات.', icon: BookOpen},
  {id: 'tafsir', title: 'مكتبة التفسير', description: 'نزّل التفاسير على جهازك مرة واحدة، ثم اقرأها كاملة دون إنترنت.', icon: BookType},
  {id: 'translations', title: 'مكتبة الترجمات', description: 'ترجمات معتمدة قابلة للتنزيل والقراءة دون اتصال، مع حفظ المصدر.', icon: Languages},
  {id: 'reciters', title: 'مكتبة القراء والتلاوات', description: 'تصفح ٢٤٠+ قارئًا مشهورًا بجميع الروايات، واستمع مباشرة عند الفتح أو نزّل السور للموبايل.', icon: Volume2},
  {id: 'hifz', title: 'مصحف الحفظ والإتقان', description: 'الحفظ والمراجعة والاسترجاع في رحلة واحدة، مع خطط وأدلة إتقان محفوظة على جهازك.', icon: Brain},
  {id: 'plans', title: 'خطط القرآن والإنجاز', description: 'خطتك المتفق عليها، تقدمك، وموضعك الحالي.', icon: TrendingUp},
  {id: 'bukhari', title: 'صحيح البخاري', description: '', icon: Library},
  {id: 'muslim', title: 'صحيح مسلم', description: '', icon: Library},
  {id: 'sunnah', title: 'حفظ السنة', description: '', icon: ScrollText},
  {id: 'routine', title: 'وردي اليومي', description: 'جدولة القرآن والسنة داخل مهام اليوم نفسها.', icon: CalendarClock},
  {id: 'progress', title: 'سجل الإنجاز', description: 'قراءة وحفظ وإتقان وانتظام وتأملات خاصة.', icon: TrendingUp},
  {id: 'azkar', title: 'أذكار', description: 'حصن المسلم — أذكار الصباح والمساء وسائر الأوقات، مع عداد تكرار وصوت.', icon: Flower2}
];

export default function QuranSunnahView({state, onState, tasks, onTasks, taskSchedules, onTaskSchedules, notify, onOpenTasks, initialSection, onBackToPrevious}: Props) {
  const [section, setSection] = useState<QuranSection>(initialSection === 'revision' ? 'hifz' : initialSection ?? 'mushaf');
  const [masteryPurpose, setMasteryPurpose] = useState<'new' | 'revision'>(initialSection === 'revision' ? 'revision' : 'new');
  const [autoPlayToken, setAutoPlayToken] = useState(0);
  const sectionHeaderRef = useRef<HTMLDivElement>(null);
  const [asset, setAsset] = useState<QuranAsset | null>(null);
  const [error, setError] = useState('');
  const firstRender = useRef(true);
  const [navToken, setNavToken] = useState(0);

  // الرجوع من أي قسم داخلي (تفسير، حفظ، أذكار...) يعود إلى المصحف.
  // الرجوع يعيد إلى القسم السابق فعلًا. إن لم يكن هناك قسم سابق داخل القرآن
  // (فُتح القسم من الرئيسية أو المهام مثلًا) يعود التطبيق إلى الشاشة السابقة.
  const sectionStack = useRef<QuranSection[]>([]);
  const goBackSection = () => {
    const prev = sectionStack.current.pop();
    if (prev) { setSection(prev); setNavToken(value => value + 1); return true; }
    return false;
  };
  useBackHandler(() => { goBackSection(); }, sectionStack.current.length > 0 && section !== 'mushaf');

  const handleSectionChange = (id: QuranSection) => {
    if (id === 'hifz' || id === 'revision') setMasteryPurpose(id === 'revision' ? 'revision' : 'new');
    const target = id === 'revision' ? 'hifz' : id;
    if (target !== section) sectionStack.current.push(section);
    setSection(target);
    setNavToken(value => value + 1);
  };

  useLayoutEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const frame = requestAnimationFrame(() => {
      if (sectionHeaderRef.current) {
        const top = sectionHeaderRef.current.offsetTop - 80;
        document.documentElement.scrollTo({top, behavior: 'auto'});
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [navToken]);

  useEffect(() => {
    if (initialSection) {
      if (initialSection === 'hifz' || initialSection === 'revision') setMasteryPurpose(initialSection === 'revision' ? 'revision' : 'new');
      setSection(initialSection === 'revision' ? 'hifz' : initialSection);
      setNavToken(value => value + 1);
    }
  }, [initialSection]);

  useEffect(() => {
    let active = true;
    loadQuran().then(value => { if (active) setAsset(value); }).catch(() => { if (active) setError('تعذر تحميل أصل المصحف المعتمد. تحقق من الاتصال ثم أعد المحاولة؛ لا يُعرض نص بديل.'); });
    return () => { active = false; };
  }, []);

  const current = SECTIONS.find(item => item.id === section) ?? SECTIONS[0];

  return <div className="quran-page">
    <div className="page-intro quran-intro">
      <span className="eyebrow">القرآن والسنة</span>
      <h1>القرآن والسنة</h1>
    </div>

    <nav className="quran-section-grid" aria-label="أقسام القرآن والسنة">
      {SECTIONS.map(item => {
        const Icon = item.icon;
        return <button key={item.id} data-quran-tab={item.id} aria-current={section === item.id ? 'page' : undefined} className={section === item.id ? 'active' : ''} onClick={() => handleSectionChange(item.id)}>
          <span className="quran-section-icon"><Icon size={22}/></span>
          <strong>{item.title}</strong>
          <small>{item.description}</small>
        </button>;
      })}
    </nav>

    <div className="quran-section-header" ref={sectionHeaderRef}>
      <h2>{current.title}</h2>
      {current.description && <p>{current.description}</p>}
    </div>

    {error ? <section className="panel quran-error" role="alert"><h3>تعذر فتح المصحف</h3><p>{error}</p><button className="soft-btn" onClick={() => { setError(''); loadQuran().then(setAsset).catch(() => setError('تعذر تحميل أصل المصحف المعتمد مرة أخرى.')); }}>إعادة المحاولة</button></section>
      : !asset ? <section className="panel"><EmptyNote>جارٍ تحميل النص العثماني والبيانات الوصفية…</EmptyNote></section>
      : <>
        {section === 'mushaf' && <MushafPages asset={asset} state={state} onState={onState} notify={notify} autoPlayToken={autoPlayToken}/>}
        {section === 'tafsir' && <OfflineLibrary kind="tafsir" asset={asset} notify={notify}/>}
        {section === 'translations' && <OfflineLibrary kind="translation" asset={asset} notify={notify}/>}
        {section === 'reciters' && (
          <RecitersAudioLibrary
            asset={asset}
            notify={notify}
            currentSurah={state.readingPosition?.surah ?? 1}
            onSelectReciter={(_reciter, _moshaf, autoPlay) => {
              if (autoPlay) setAutoPlayToken(t => t + 1);
              handleSectionChange('mushaf');
            }}
          />
        )}
        {section === 'hifz' && <><HifzHome asset={asset} purpose={masteryPurpose} notify={notify} onExit={() => { if (!goBackSection()) onBackToPrevious?.(); }} tasks={tasks} onTasks={onTasks} taskSchedules={taskSchedules ?? {}} onTaskSchedules={onTaskSchedules}/><details><summary>الخطط والسجلات السابقة (محفوظة دون تغيير)</summary><QuranJourney asset={asset} state={state} onOpen={handleSectionChange}/><QuranMemorization asset={asset} state={state} onState={onState} notify={notify}/><QuranRevision asset={asset} state={state} onState={onState} notify={notify}/></details></>}
        {section === 'plans' && <QuranPlansCard asset={asset} state={state} onState={onState} notify={notify} onOpen={handleSectionChange} onOpenHifz={() => handleSectionChange('hifz')}/>}
        {section === 'bukhari' && <HadithLibrary collectionKey="bukhari" mode="library" state={state} onState={onState} notify={notify}/>}
        {section === 'muslim' && <HadithLibrary collectionKey="muslim" mode="library" state={state} onState={onState} notify={notify}/>}
        {section === 'sunnah' && <HadithLibrary collectionKey="bukhari" mode="memorization" state={state} onState={onState} notify={notify}/>}
        {section === 'routine' && <QuranRoutine asset={asset} state={state} onState={onState} tasks={tasks} onTasks={onTasks} notify={notify} onOpenTasks={onOpenTasks}/>}
        {section === 'progress' && <QuranProgress asset={asset} state={state} onState={onState} notify={notify}/>}
        {section === 'azkar' && <AzkarLibrary/>}
      </>}

  </div>;
}
