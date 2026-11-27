import {Trophy,BookOpen,BookMarked,CalendarClock,CalendarDays,Heart,Target,ChevronLeft,ArrowRight,ArrowLeft,Flower2,Sparkles,ShieldCheck,MonitorPlay,Compass,MapPin} from 'lucide-react';
import {type Task, type TaskSchedule, type View, type Wird} from '../app-state';
import type {Goal} from '../goal-plan';
import type {CourseCoach} from '../coach/course';
import type {CoachSettings} from '../coach/types';
import {buildCoachHomeSummary} from '../coach/smart';
import {type PrayerLocation} from '../prayer-location';
import {hijriDate} from '../hijri';
import HomeDashboard from './HomeDashboard';
import {nearestTasks,planStepsToday} from '../home-tasks';
import type {DayPlan} from '../DayPlanner';
import {localDateKey,type DayRecords} from '../day-tracking';
import {type SectionId} from '../section-theme';

const timeFmt = new Intl.DateTimeFormat('ar-EG', {hour: 'numeric', minute: '2-digit'});
const dayFmt = new Intl.DateTimeFormat('ar-EG', {day: 'numeric', month: 'short'});

function homeTaskWhen(date: string, overdue: boolean, todayKey: string, tomorrowKey: string): string {
  const day = date === todayKey ? 'اليوم' : date === tomorrowKey ? 'غدًا' : dayFmt.format(new Date(`${date}T12:00:00`));
  return `${overdue ? 'متأخرة · ' : ''}${day}`;
}

const menu:Array<{id:'day'|'week'|'month'|'goals'|'qibla'|'mosques';title:string;icon:typeof CalendarDays;desc:string;section:SectionId}>= [
  {id:'day',title:'يومي مع الله',icon:CalendarDays,desc:'خطوات اليوم ومواعيده',section:'daily'},
  {id:'week',title:'أسبوعي مع الله',icon:CalendarDays,desc:'خطة الأسبوع',section:'planning'},
  {id:'month',title:'شهري مع الله',icon:CalendarDays,desc:'أهداف الشهر',section:'planning'},
  {id:'goals',title:'المؤمن القوي',icon:Target,desc:'أهداف نافعة وخطوات عملية',section:'strong'},
  {id:'qibla',title:'اتجاه القبلة',icon:Compass,desc:'بوصلة القبلة واتجاه الكعبة',section:'daily'},
  {id:'mosques',title:'المساجد القريبة',icon:MapPin,desc:'أقرب المساجد إليك مع الاتجاهات',section:'daily'},
];

export default function HomeView({navigate,admin=false,prayers={},prayerLocation,currentDate,tasks=[],taskSchedules={},dayPlan,dayRecords,goals=[],wirds=[],courseCoach,coachSettings}:{goals?:Goal[];wirds?:Wird[];courseCoach?:CourseCoach;coachSettings?:CoachSettings;dayPlan?:DayPlan;dayRecords?:DayRecords;navigate:(view:View)=>void;admin?:boolean;prayers?:Record<string,string>;prayerLocation?:PrayerLocation;currentDate?:string;tasks?:Task[];taskSchedules?:Record<string,TaskSchedule>}) {
  const dateObj = currentDate ? new Date(`${currentDate}T12:00:00`) : new Date();
  const hijri = hijriDate(dateObj);
  const gregorian = new Intl.DateTimeFormat('ar-EG', {weekday:'long', day:'numeric', month:'long'}).format(dateObj);
  const now = new Date();
  const todayKey = now.toLocaleDateString('en-CA');
  const tomorrowKey = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toLocaleDateString('en-CA');
  const doneStepIds=new Set((dayRecords?.[localDateKey(now)]?.items??[]).filter(item=>item.status==='done').map(item=>item.id));
  const upcomingTasks = nearestTasks(tasks, taskSchedules, prayers, now, 3, planStepsToday(dayPlan, prayers, now, doneStepIds));
  const coachSummary = buildCoachHomeSummary({
    goals,
    tasks,
    wirds,
    courseCoach,
    coachSettings,
    prayers,
    dayPlan,
    dayRecords,
    taskSchedules,
    masteryRoot: null,
    now,
  });
  return <>
    <div className="home-date-bar" aria-label="تاريخ اليوم">
      <CalendarDays size={16} aria-hidden="true"/>
      <div className="home-date-text">
        {hijri && <span className="home-hijri-date">{hijri}</span>}
        <span className="home-greg-date">{gregorian}</span>
      </div>
    </div>
    <section className="hero"><div className="hero-pattern"/><div className="hero-content"><span className="hero-tag"><Flower2 size={15}/> بسم الله الرحمن الرحيم</span><p className="hero-copy hero-ayah"><span className="hero-ayah-text">﴿يَٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُواْ ٱصۡبِرُواْ وَصَابِرُواْ وَرَابِطُواْ وَٱتَّقُواْ ٱللَّهَ لَعَلَّكُمۡ تُفۡلِحُونَ﴾</span><span className="hero-ayah-ref">آل عمران: ٢٠٠</span></p><button className="hero-btn" onClick={()=>navigate('day')}>ابدأ يومك <ArrowRight size={18}/></button></div><div className="hero-art"><div className="arch"><BookOpen size={64} strokeWidth={1.1}/><span>وَكُونُوا رَبَّانِيِّينَ</span></div></div></section>
    <HomeDashboard prayers={prayers} prayerLocation={prayerLocation} navigate={navigate}/>
    <button className="home-today-entry home-achievement-entry" data-section="journey" data-view="achievement" onClick={()=>navigate('achievement')}><span className="home-tasks-head"><span className="home-today-icon"><Trophy size={19} aria-hidden="true"/></span><span><strong>الإنجاز</strong><small>القرآن، السنة، الأهداف، الأذكار، الصلاة</small></span></span><ChevronLeft size={18} aria-hidden="true"/></button>
    <button className="home-today-entry home-coach-entry" data-section="goals" onClick={()=>navigate('tasks')}><span className="home-tasks-head"><span className="home-today-icon"><Sparkles size={19} aria-hidden="true"/></span><span><strong>اقتراحات اليوم</strong><small>{coachSummary.subtitle}</small>{coachSummary.detailLines.map(line=><small key={line} className="home-coach-detail">{line}</small>)}</span></span><ChevronLeft size={18} aria-hidden="true"/></button>
    <button className="home-today-entry home-today-list" onClick={()=>navigate('tasks')}><span className="home-tasks-head"><span className="home-today-icon"><CalendarClock size={19} aria-hidden="true"/></span><strong>مهام اليوم</strong></span>{upcomingTasks.length===0?<small className="home-tasks-empty">اليوم · غدًا · المهام المتأخرة</small>:<ul className="home-tasks-rows">{upcomingTasks.map(task=><li key={task.id} className={task.overdue?'home-tasks-row home-tasks-row-overdue':'home-tasks-row'}><span className="home-task-dot" aria-hidden="true"/><span className="home-task-name">{task.title}</span><span className={task.overdue?'home-task-meta home-task-overdue':'home-task-meta'}>{homeTaskWhen(task.date, task.overdue, todayKey, tomorrowKey)}{task.time?` ${timeFmt.format(new Date(`${task.date}T${task.time}:00`))}`:''}</span></li>)}</ul>}<span className="home-tasks-all">عرض كل المهام <ArrowLeft size={15} aria-hidden="true"/></span></button>
    {admin&&<a className="home-admin-entry" href="/admin"><span className="home-admin-icon"><ShieldCheck size={22}/></span><span><strong>لوحة الإدارة</strong><small>إدارة المنهج والموارد</small></span><ChevronLeft size={18}/></a>}
    <div className="section-title"><div><span className="eyebrow">تنظيم الحياة</span><h2>حياتي مع الله</h2><p>اجعل العبادة والعمل والأسرة والتعلم في خطة متوازنة.</p></div></div>
    <div className="feature-grid">{menu.map(m=><button key={m.id} data-section={m.section} data-view={m.id} className="feature-card" onClick={()=>navigate(m.id)}><span className="feature-icon"><m.icon size={22} aria-hidden="true"/></span><span className="feature-copy"><strong>{m.title}</strong><span>{m.desc}</span></span><ChevronLeft className="feature-arrow" size={18} aria-hidden="true"/></button>)}</div>
    <div className="section-title below"><div><span className="eyebrow">العلم والتزكية</span><h2>نمضي بعلم وعمل</h2></div></div>
    <div className="large-grid"><button data-section="quran" className="wide-card" onClick={()=>navigate('quran')}><div className="wide-icon"><BookMarked size={24} aria-hidden="true"/></div><div className="wide-body"><h3>القرآن والسنة</h3><p>المصحف الشريف، حفظ القرآن ومراجعته، ومكتبة الصحيحين عند اعتماد مصدرها.</p><span className="inline-link">فتح القسم <ChevronLeft size={17}/></span></div></button><button data-section="haramain" className="wide-card" onClick={()=>navigate('haramain')}><div className="wide-icon"><MonitorPlay size={24} aria-hidden="true"/></div><div className="wide-body"><h3>من الحرمين الشريفين</h3><p>البث المباشر لصلوات الحرمين عبر قناتي القرآن الكريم والسنة النبوية، من مصدره الرسمي.</p><span className="inline-link">مشاهدة البث <ChevronLeft size={17}/></span></div></button><button data-section="accountability" className="wide-card" onClick={()=>navigate('reflect')}><div className="wide-icon"><Heart size={24} aria-hidden="true"/></div><div className="wide-body"><h3>حاسب نفسك</h3><p>محاسبة خاصة وأوراد تختارها بنفسك دون مقارنة أو درجات.</p><span className="inline-link">الدخول إلى القسم <ChevronLeft size={17}/></span></div></button></div>
    <div className="quote">«احرص على ما ينفعك، واستعن بالله ولا تعجز» <span>— صحيح مسلم</span></div>
  </>;
}
