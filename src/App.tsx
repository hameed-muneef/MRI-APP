import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import HomeView from './views/HomeView';
import {replacePeriodTasks,updateDayRecords} from './weekly-planning';
import {slotClockTime} from './day-timing';
import {load,today,type State,type View} from './app-state';
import {sectionOfView} from './section-theme';
import {displayName,fetchProfile,saveProfile,type Profile} from './user-profile';
import {uid} from './id';
import {CalendarDays,Heart,Settings2,Home,ChevronLeft,ArrowRight,Check,ShieldCheck,UserRound,CreditCard,BookMarked,MonitorPlay,Compass,MapPin,WifiOff} from 'lucide-react';
import AuthScreen from './AuthScreen';
import {AppearanceToggle} from './AppearanceToggle';
import {InstallAppButton} from './InstallApp';
import NotificationCenter from './views/NotificationCenter';
import {requestNotificationSection} from './views/notifications/NotificationSettings';
import LiveNotifications from './notifications/LiveNotifications';
import PaymentCheckout from './views/PaymentCheckout';
import PaymentHistory from './views/PaymentHistory';
import ErrorBoundary from './ErrorBoundary';
import MiniAudioPlayer from './components/MiniAudioPlayer';
import ScrollToTopFab from './components/ScrollToTopFab';
import type {AudioCategory} from './audio/types';
import type {QuranSection} from './views/QuranSunnahView';
import {authClient} from './auth';
import {LOCAL_ONLY} from './config';
import {InternetBadge,useOnline} from './online';
import {requestPersistentStorage} from './local-backup';
import {checkAdminAccess,type AdminAccess} from './admin-access';
import {useAppBackButton} from './navigation/useAppBackButton';
import {fetchCloudState,saveCloudState} from './cloud-state';
import {mergeQuranState,logRoutineCompletion,syncRoutineTasks} from './quran/learning';
import {fetchQuranLearningState,saveQuranLearningState} from './quran/sync';
import type {User} from '@supabase/supabase-js';
import {changeWirdCount, normalizeWirds} from './wird-periods';
import {getCentralLocationState, subscribeCentralLocation} from './lib/location-store';

const AdminDashboard=lazy(()=>import('./AdminDashboard'));
const DayPlanner=lazy(()=>import('./DayPlanner'));
const StrongGoals=lazy(()=>import('./StrongGoals'));
const WeeklyPlanner=lazy(()=>import('./views/WeeklyPlanner'));
const MonthlyPlanner=lazy(()=>import('./views/MonthlyPlanner'));
const ReflectionView=lazy(()=>import('./views/ReflectionView'));
const WirdsView=lazy(()=>import('./views/WirdsView'));
const SettingsView=lazy(()=>import('./views/SettingsView'));
const TodayTasksView=lazy(()=>import('./views/TodayTasksView'));
const ProfileView=lazy(()=>import('./views/ProfileView'));
const QuranSunnahView=lazy(()=>import('./views/QuranSunnahView'));
const HaramainLive=lazy(()=>import('./views/HaramainLive'));
const QiblaScreen=lazy(()=>import('./features/qibla/QiblaScreen'));
const MosquesScreen=lazy(()=>import('./features/mosques/MosquesScreen'));

const loadingView=<div className="auth-loading" dir="rtl" role="status">جارٍ تحميل الصفحة…</div>;
const newReflection=(text:string)=>({id:uid(),date:today(),text});
const featureByView:Partial<Record<View,string>>={day:'daily_planning',tasks:'daily_planning',week:'weekly_planning',month:'monthly_planning',goals:'goal_tracking',reflect:'self_reflection',wird:'adhkar'};
// Sections removed from the product. Old links or saved navigation targets are
// redirected to the home screen instead of rendering an empty page.
const retiredViews=new Set<string>(['circles','courses','study','shares','teacher']);
type FeatureAccess={view:View;status:'checking'|'allowed'|'denied'|'error';title?:string;enabled?:boolean;price_amount:number|null;currency_code:string|null;billing_interval:string|null};

const crumbs:Record<View,string>={home:'الرئيسية',day:'يومي مع الله',tasks:'مركز المهام',week:'أسبوعي مع الله',month:'شهري مع الله',goals:'المؤمن القوي',quran:'القرآن والسنة',haramain:'من الحرمين الشريفين',reflect:'محاسبة النفس',wird:'زكِّ نفسك',profile:'حسابي',settings:'الإعدادات',payment:'دفع الاشتراك',paymentHistory:'سجل الدفع',qibla:'اتجاه القبلة',mosques:'المساجد القريبة'};
const dailySuiteViews:Array<{id:View;label:string}>=[
  {id:'tasks',label:'مهام اليوم'},
  {id:'day',label:'يومي'},
  {id:'week',label:'أسبوعي'},
  {id:'month',label:'شهري'},
  {id:'goals',label:'المؤمن القوي'},
];
const inDailySuite=(v:View)=>dailySuiteViews.some(item=>item.id===v);

export default function App(){
  const [user,setUser]=useState<User|null>(null);
  const [authReady,setAuthReady]=useState(!authClient||LOCAL_ONLY);
  const [adminCheck,setAdminCheck]=useState<{userId:string;status:AdminAccess}>({userId:'',status:'checking'});
  const [adminRetry,setAdminRetry]=useState(0);
  const adminAccess=adminCheck.userId===user?.id?adminCheck.status:'checking';
  useEffect(()=>{
    const privatePath=Boolean(user)||/^\/(admin|invite|reset-password)(\/|$)/.test(window.location.pathname);
    const robots=document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if(robots) robots.content=privatePath?'noindex,nofollow,noarchive':'index,follow,max-image-preview:large';
    if(privatePath) document.title=window.location.pathname.startsWith('/admin')?'لوحة إدارة الربانيون':'الربانيون';
  },[user]);
  useEffect(()=>{
    if(LOCAL_ONLY||!authClient)return;
    const client=authClient;
    client.auth.getUser().then(({data})=>{setUser(data.user);setAuthReady(true)}).catch(()=>setAuthReady(true));
    const {data}=client.auth.onAuthStateChange((_event,session)=>{setUser(session?.user??null);setAuthReady(true)});
    return()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!user||!authClient)return;
    let active=true;
    const client=authClient;
    setAdminCheck({userId:user.id,status:'checking'});
    checkAdminAccess(()=>client.rpc('is_admin')).then(status=>{if(active)setAdminCheck({userId:user.id,status})});
    return()=>{active=false};
  },[user?.id,adminRetry]);
  if(!authReady)return <div className="auth-loading" dir="rtl">جارٍ التحقق من حسابك…</div>;
  if(/^\/reset-password\/?$/.test(window.location.pathname))return <AuthScreen reset/>;
  const adminPath=/^\/admin\/?$/.test(window.location.pathname);
  if(!LOCAL_ONLY&&!user)return <AuthScreen admin={adminPath}/>;
  if(adminPath&&adminAccess==='checking')return <div className="auth-loading" dir="rtl" role="status">جارٍ التحقق من صلاحية الإدارة…</div>;
  if(adminPath&&adminAccess!=='allowed')return <main className="auth-loading" dir="rtl"><section className="admin-access-card" aria-labelledby="admin-access-title"><h1 id="admin-access-title">{adminAccess==='error'?'تعذّر التحقق من صلاحية الإدارة':'هذا الحساب لا يملك صلاحية الإدارة'}</h1><p>الحساب الحالي: <bdi>{user?.email}</bdi></p>{adminAccess==='error'?<p role="alert">لم نتمكن من الحصول على نتيجة من خدمة الصلاحيات. تحقق من الاتصال ثم أعد المحاولة؛ لا يعني هذا أن حسابك غير معتمد.</p>:<p>تسجيل الدخول وحده لا يمنح صلاحية الإدارة. يجب اعتماد هذا البريد في قائمة المشرفين وربطه بحساب الإدارة في قاعدة البيانات. تأكيد البريد وحده لا يكفي.</p>}<div className="admin-access-actions"><button className="primary" onClick={()=>setAdminRetry(value=>value+1)}>إعادة التحقق</button><a className="soft-btn" href="/">العودة إلى المنصة</a><button className="soft-btn" onClick={()=>authClient?.auth.signOut()}>تسجيل الخروج</button></div></section></main>;
  if(adminPath&&user)return <Suspense fallback={loadingView}><AdminDashboard user={user}/></Suspense>;
  return <Workspace key={LOCAL_ONLY?'local':user!.id} user={user} admin={adminAccess==='allowed'}/>;
}

function Workspace({user,admin}:{user:User|null;admin:boolean}){
  const storageKey=user?`rabbani-v1-user-${user.id}`:'rabbani-v1';
  const [state,setState]=useState<State>(()=>load(storageKey));
  const [currentDate,setCurrentDate]=useState(today);
  const [view,setView]=useState<View>('home');
  const [quranSection,setQuranSection]=useState<QuranSection|undefined>(undefined);
  const [featureAccess,setFeatureAccess]=useState<FeatureAccess>({view:'home',status:'allowed',price_amount:null,currency_code:null,billing_interval:null});
  const [paymentFeature,setPaymentFeature]=useState<string|null>(null);
  const [retryFeatureAccess,setRetryFeatureAccess]=useState(0);
  const [toast,setToast]=useState('');
  const [profile,setProfile]=useState<Profile|null>(null);
  const [viewRecovery,setViewRecovery]=useState(0);
  const isOnline=useOnline();

  useEffect(()=>{void requestPersistentStorage()},[]);
  useEffect(()=>{
    const refreshPeriods=()=>{setCurrentDate(today());setState(current=>{
      const wirds=normalizeWirds(current.wirds);
      return wirds===current.wirds?current:{...current,wirds};
    })};
    refreshPeriods();
    const timer=window.setInterval(refreshPeriods,30000);
    window.addEventListener('focus',refreshPeriods);
    const onVisible=()=>{if(document.visibilityState==='visible')refreshPeriods()};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refreshPeriods);document.removeEventListener('visibilitychange',onVisible)};
  },[]);

  const [cloudReady,setCloudReady]=useState(!user);
  const [cloudWritable,setCloudWritable]=useState(false);
  const [syncStatus,setSyncStatus]=useState<'saved'|'saving'|'offline'>('saved');
  const [retrySync,setRetrySync]=useState(0);
  const pendingKey=`${storageKey}-pending`;
  const saveQueue=useRef<Promise<void>>(Promise.resolve());
  const saveRevision=useRef(0);
  // المدينة المركزية اليدوية هي المرجع: إذا تغيّرت (من المساجد/القبلة) أو أُلغيت (العودة إلى GPS)
  // لا يبقى prayerLocation قديمًا يعارضها. التغيير من منتقي المواقيت نفسه يطابق الإحداثيات فلا يُمسح.
  useEffect(()=>{
    let prev=getCentralLocationState().manual;
    return subscribeCentralLocation(next=>{
      const m=next.manual,old=prev;prev=m;
      if(JSON.stringify(m)===JSON.stringify(old))return;
      setState(cur=>{
        const pl=cur.prayerLocation;
        if(!pl)return cur;
        const same=m&&Math.abs(pl.latitude-m.latitude)<0.005&&Math.abs(pl.longitude-m.longitude)<0.005;
        return same?cur:{...cur,prayerLocation:undefined};
      });
    });
  },[]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(state))}catch{setToast('تعذر حفظ البيانات على هذا الجهاز. صدّر بياناتك قبل إغلاق الصفحة.')}},[state,storageKey]);
  // Preload custom alarm & library sounds (if any) so notifications can use them.
  useEffect(()=>{void (async()=>{try{const {listAllCustomSounds,customSoundUrl}=await import('./sounds/custom-store');const {setCustomAlarmUrl,setCustomSoundUrl}=await import('./notifications/sound-selection');const all=await listAllCustomSounds();for(const rec of all){const url=customSoundUrl(rec);if(rec.slot==='alarm')setCustomAlarmUrl(url);setCustomSoundUrl(rec.slot,url);}}catch{/* ignore */}})()},[]);
  useEffect(()=>{
    if(!user)return;
    let active=true;
    fetchCloudState(user.id).then(remote=>{if(active){if(remote&&!localStorage.getItem(pendingKey))setState(remote);setCloudWritable(true)}}).catch(()=>{if(active){setCloudWritable(false);setSyncStatus('offline')}}).finally(()=>{if(active)setCloudReady(true)});
    return()=>{active=false};
  },[user,storageKey,pendingKey,retrySync]);
  useEffect(()=>{
    if(!user||!cloudReady)return;
    localStorage.setItem(pendingKey,'1');
    const revision=++saveRevision.current;
    if(!cloudWritable)return;
    const timer=window.setTimeout(()=>{
      setSyncStatus('saving');
      saveQueue.current=saveQueue.current.catch(()=>{}).then(()=>saveCloudState(user.id,state));
      saveQueue.current.then(()=>{if(saveRevision.current===revision){localStorage.removeItem(pendingKey);setSyncStatus('saved')}}).catch(()=>setSyncStatus('offline'));
    },650);
    return()=>window.clearTimeout(timer);
  },[state,user,cloudReady,cloudWritable,pendingKey]);
  const update=(fn:(s:State)=>State)=>setState(fn);
  // Quran learning sync: merge server rows on load, then save debounced. Local
  // storage remains the offline source of truth; failures never delete data.
  const [quranSynced,setQuranSynced]=useState(!user);
  useEffect(()=>{
    if(!user||!authClient)return;
    let active=true;
    fetchQuranLearningState().then(remote=>{if(active&&remote)setState(current=>({...current,quran:mergeQuranState(current.quran,remote)}))}).catch(()=>{}).finally(()=>{if(active)setQuranSynced(true)});
    return()=>{active=false};
  },[user?.id,retrySync]);
  useEffect(()=>{
    if(!user||!cloudReady||!quranSynced)return;
    const timer=window.setTimeout(()=>{saveQuranLearningState(state.quran).catch(()=>{})},1500);
    return()=>window.clearTimeout(timer);
  },[state.quran,user?.id,cloudReady,quranSynced]);
  // Keep the daily routine inside the existing task list without a second engine.
  useEffect(()=>{
    const date=currentDate;
    setState(current=>{
      const next=syncRoutineTasks(current.tasks,current.quran.routine,date,current.quran.plans);
      return JSON.stringify(next.map(task=>[task.id,task.title,task.sourceLabel,task.period]))===JSON.stringify(current.tasks.map(task=>[task.id,task.title,task.sourceLabel,task.period]))?current:{...current,tasks:next};
    });
  },[state.quran.routine,state.quran.plans,currentDate]);
  const completeQuranTask=(taskId:string)=>{
    update(current=>{
      const activity=current.quran.routine.find(item=>`quran:${item.id}`===taskId);
      return activity?{...current,quran:logRoutineCompletion(current.quran,activity,today())}:current;
    });
  };
  // سجل الشاشات: زر الرجوع يعيد إلى الشاشة التي جاء منها المستخدم فعلًا، وليس إلى القرآن أو الرئيسية دائمًا.
  const viewHistory=useRef<View[]>([]);
  const viewNow=useRef<View>(view);
  viewNow.current=view;
  const goTo=(v:View,record:boolean)=>{const target=retiredViews.has(v)?'home':v;if(target==='home')viewHistory.current=[];else if(record&&target!==viewNow.current){viewHistory.current.push(viewNow.current);if(viewHistory.current.length>30)viewHistory.current.shift()}if(v!=='quran')setQuranSection(undefined);setView(target);window.scrollTo({top:0,behavior:'smooth'})};
  const navigate=(v:View)=>goTo(v,true);
  const navigateBack=()=>{const prev=viewHistory.current.pop();goTo(prev&&prev!==viewNow.current?prev:'home',false)};
  const openAudioCategory=(category:AudioCategory)=>{if(category==='haramain'){navigate('haramain');return}setQuranSection(category==='azkar'?'azkar':'mushaf');navigate('quran')};
  const onLeave=()=>{void authClient?.auth.signOut()};
  const requiredFeature=featureByView[view];
  useEffect(()=>{
    if(!requiredFeature||!user||admin||!authClient){setFeatureAccess({view,status:'allowed',price_amount:null,currency_code:null,billing_interval:null});return}
    let active=true;
    const client=authClient;
    setFeatureAccess({view,status:'checking',price_amount:null,currency_code:null,billing_interval:null});
    Promise.all([
      client.rpc('has_feature_access',{p_feature_key:requiredFeature}),
      client.from('platform_features').select('title,enabled,price_amount,currency_code,billing_interval').eq('key',requiredFeature).maybeSingle(),
    ]).then(([accessResult,featureResult])=>{
      if(!active)return;
      if(accessResult.error||featureResult.error){setFeatureAccess({view,status:'error',price_amount:null,currency_code:null,billing_interval:null});return}
      const feature=featureResult.data as {title:string;enabled:boolean;price_amount:number|null;currency_code:string|null;billing_interval:string|null}|null;
      setFeatureAccess({view,status:accessResult.data===true?'allowed':'denied',title:feature?.title,enabled:feature?.enabled??true,price_amount:feature?.price_amount??null,currency_code:feature?.currency_code??null,billing_interval:feature?.billing_interval??null});
    }).catch(()=>{if(active)setFeatureAccess({view,status:'error',price_amount:null,currency_code:null,billing_interval:null})});
    return()=>{active=false};
  },[view,requiredFeature,user?.id,admin,retryFeatureAccess]);

  const notify=(t:string)=>{setToast(t);setTimeout(()=>setToast(''),2600)};
  // زر/إيماءة الرجوع: إغلاق الطبقات ثم العودة للرئيسية ثم تأكيد الخروج بضغطتين.
  useAppBackButton({
    view,
    onNavigateHome:()=>navigateBack(),
    onExitHint:()=>notify('اضغط زر الرجوع مرة أخرى للخروج'),
  });
  useEffect(()=>{
    if(!user){setProfile(null);return}
    let active=true;
    fetchProfile(user.id).then(loaded=>{
      if(!active)return;
      setProfile(loaded);
      let draft='';
      try{draft=sessionStorage.getItem('rabbani-profile-draft')??''}catch{}
      // The confirmation link usually opens in a new tab, where the session draft is gone.
      const meta=user.user_metadata as {first_name?:string;last_name?:string;country?:string}|undefined;
      if(!draft&&!loaded?.first_name&&meta?.first_name&&meta.last_name&&meta.country)draft=JSON.stringify({firstName:meta.first_name,lastName:meta.last_name,country:meta.country});
      if(!draft)return;
      try{
        const parsed=JSON.parse(draft) as {firstName:string;lastName:string;country:string};
        if(!parsed.firstName||!parsed.lastName||!parsed.country)return;
        sessionStorage.removeItem('rabbani-profile-draft');
        saveProfile({firstName:parsed.firstName,lastName:parsed.lastName,country:parsed.country,gender:''})
          .then(()=>fetchProfile(user.id)).then(fresh=>{if(active)setProfile(fresh)})
          .catch(()=>{});
      }catch{}
    }).catch(()=>{});
    return()=>{active=false};
  },[user?.id]);

  const latestPrayerLocationRef = useRef(state.prayerLocation);
  latestPrayerLocationRef.current = state.prayerLocation;
  const latestPassagesRef = useRef(state.quran?.passages ?? []);
  latestPassagesRef.current = state.quran?.passages ?? [];
  const latestTaskContextRef = useRef({
    tasks: state.tasks,
    goals: state.goals,
    taskSchedules: state.taskSchedules ?? {},
    dayPlan: state.dayPlan,
    prayers: state.prayers,
  });
  latestTaskContextRef.current = {
    tasks: state.tasks,
    goals: state.goals,
    taskSchedules: state.taskSchedules ?? {},
    dayPlan: state.dayPlan,
    prayers: state.prayers,
  };
  const lastSyncContextRef = useRef<{ signature: string; atMs: number } | null>(null);

  useEffect(() => {
    if (!LOCAL_ONLY && !user) return;
    let disposed = false;
    let cleanupResume: (() => void) | undefined;

    const currentSignature = () => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
      const d = new Date();
      const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const loc = latestPrayerLocationRef.current;
      return `${dayKey}|${tz}|${loc ? `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)},${loc.method},${loc.school}` : 'none'}`;
    };

    const runNativeSync = async (always = false) => {
      if (disposed) return;
      try {
        const [scheduler, store] = await Promise.all([
          import('./notifications/native-prayer-scheduler'),
          import('./notifications/prefs-store'),
        ]);
        if (disposed || !scheduler.isNativePlatform()) return;

        const perms = await scheduler.checkPermissions();
        const sig = `${currentSignature()}|${perms.display}|${perms.exact}`;
        const prev = lastSyncContextRef.current;
        const stale = !prev || prev.signature !== sig || (Date.now() - prev.atMs) > 30 * 60000;
        if (!always && !stale) return;

        const [{ prefs }, { reminders }] = await Promise.all([
          store.loadPrefs(),
          store.loadReminders(),
        ]);
        if (disposed) return;

        await scheduler.syncAllNativeNotifications({
          location: latestPrayerLocationRef.current,
          prefs,
          reminders,
          taskContext: latestTaskContextRef.current,
          passages: latestPassagesRef.current,
        });
        lastSyncContextRef.current = { signature: sig, atMs: Date.now() };
      } catch { /* ignore */ }
    };

    void runNativeSync(true);

    const onChanged = () => { void runNativeSync(true); };
    window.addEventListener('rabbani:notifications-changed', onChanged);

    void import('./lib/settings-opener').then(({ addAppResumeListener }) => {
      if (disposed) return;
      cleanupResume = addAppResumeListener(() => { void runNativeSync(false); });
    });

    const rolloverCheck = window.setInterval(() => {
      void runNativeSync(false);
    }, 60000);

    return () => {
      disposed = true;
      window.removeEventListener('rabbani:notifications-changed', onChanged);
      window.clearInterval(rolloverCheck);
      cleanupResume?.();
    };
  }, [state.prayerLocation, state.taskSchedules, state.tasks, state.goals, state.dayPlan, state.quran?.passages, user?.id]);

  // الأذونات المركزية عند الإقلاع: على الهاتف طلب واحد لإذن الإشعارات حتى تصل
  // المنبهات والتطبيق مغلق، وعلى الهاتف والويب معًا طلب واحد للموقع تشترك فيه
  // المواقيت والقبلة والمساجد. كلاهما يُسأل مرة واحدة فقط؛ الرفض يُحترم ولا
  // يُعاد السؤال تلقائيًا.
  useEffect(() => {
    if (!LOCAL_ONLY && !user) return;
    let cancelled = false;
    void (async () => {
      const [{ isNativePlatform: isNative }, locationStore, delivery] = await Promise.all([
        import('./lib/device-location'),
        import('./lib/location-store'),
        import('./notifications/delivery'),
      ]);
      if (cancelled) return;
      if (isNative()) {
        const display = await delivery.ensureSystemNotificationPermission();
        if (cancelled) return;
        if (display === 'granted') {
          // أعد مزامنة الجدولة الأصلية فورًا بعد منح الإذن بدل انتظار نبضة الدقيقة.
          const scheduler = await import('./notifications/native-prayer-scheduler');
          scheduler.notifyNativePrefsChanged();
        }
      }
      // الموقع يُطلب مركزيًا عند الإقلاع على الهاتف والويب معًا.
      if (!locationStore.getCentralLocationState().manual) {
        await locationStore.ensureCentralLocation({ timeout: 15000 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);


  const accessMatchesView=featureAccess.view===view;
  const canRenderView=!requiredFeature||!user||admin||(accessMatchesView&&featureAccess.status==='allowed');
  const checkingFeature=Boolean(user&&requiredFeature&&!admin&&(!accessMatchesView||featureAccess.status==='checking'));
  const deniedFeature=Boolean(user&&requiredFeature&&!admin&&accessMatchesView&&featureAccess.status==='denied');
  const featureCheckFailed=Boolean(user&&requiredFeature&&!admin&&accessMatchesView&&featureAccess.status==='error');
  if(!cloudReady)return <div className="auth-loading" dir="rtl">جارٍ تحميل بيانات حسابك…</div>;
  return <div className="app"><aside className="sidebar"><button className="brand" onClick={()=>navigate('home')}><span className="brand-mark"><img src="/brand/book-mark.svg" alt=""/></span><span><strong>الرَّبَّانِيُّون</strong><small>على هدي الكتاب والسنة</small></span></button><div className="side-label">مسيرتك</div><nav><button className={view==='home'?'active':''} onClick={()=>navigate('home')}><Home size={19}/>الرئيسية</button><button data-section="daily" className={inDailySuite(view)?'active':''} onClick={()=>navigate('day')}><CalendarDays size={19}/>حياتي مع الله</button><button data-section="quran" className={view==='quran'?'active':''} onClick={()=>navigate('quran')}><BookMarked size={19}/>القرآن والسنة</button><button data-section="haramain" className={view==='haramain'?'active':''} onClick={()=>navigate('haramain')}><MonitorPlay size={19}/>من الحرمين الشريفين<InternetBadge compact/></button>
<button data-section="qibla" className={view==='qibla'?'active':''} onClick={()=>navigate('qibla')}><Compass size={19}/>اتجاه القبلة</button><button data-section="daily" className={view==='mosques'?'active':''} onClick={()=>navigate('mosques')}><MapPin size={19}/>المساجد القريبة</button><button data-section="accountability" className={['reflect','wird'].includes(view)?'active':''} onClick={()=>navigate('reflect')}><Heart size={19}/>حاسب نفسك</button></nav><div className="side-bottom">{!LOCAL_ONLY&&<button onClick={()=>navigate('profile')}><UserRound size={18}/> {user?'حسابي':'الملف الشخصي'}</button>}
{!LOCAL_ONLY&&<button onClick={()=>navigate('paymentHistory')}><CreditCard size={18}/> سجل الدفع</button>}<button onClick={()=>navigate('settings')}><Settings2 size={18}/> الإعدادات</button>{!LOCAL_ONLY&&<button className="session-button" onClick={async()=>{if(user)await authClient?.auth.signOut();else onLeave()}}>{user?'تسجيل الخروج':'العودة إلى صفحة الدخول'}</button>}<p>﴿وَلَٰكِنْ كُونُوا رَبَّانِيِّينَ﴾<br/><span>آل عمران: 79</span></p></div></aside><main data-section={sectionOfView(view)} className="main"><header className="topbar"><div className="crumb"><button type="button" className="crumb-home" onClick={()=>navigate('home')} aria-label="العودة إلى الرئيسية">الربانيون</button><ChevronLeft size={15}/><strong>{crumbs[view]}</strong></div><div className="top-actions">{admin&&<a className="admin-entry" href="/admin"><ShieldCheck size={15}/> لوحة الإدارة</a>}{(user||LOCAL_ONLY)&&<InstallAppButton/>}{(user||LOCAL_ONLY)&&<AppearanceToggle/>}{user&&<button className="user-chip" onClick={()=>navigate('profile')} aria-label={`حسابي: ${displayName(profile,user.email)}`}><span className="user-chip-avatar" aria-hidden="true">{displayName(profile,user.email).trim().charAt(0)}</span><span className="user-chip-name">{displayName(profile,user.email)}</span></button>}<LiveNotifications prayers={{...((profile?.prayer_settings?.times as Record<string,string>|undefined)??{}),...state.prayers}} prayerLocation={state.prayerLocation} passages={state.quran?.passages ?? []} tasks={state.tasks} goals={state.goals} taskSchedules={state.taskSchedules??{}} dayPlan={state.dayPlan} onToast={notify}/>{user&&<div className="top-date">{syncStatus==='offline'?<button className="cloud-status offline" onClick={()=>setRetrySync(x=>x+1)}>تعذر الاتصال · إعادة المحاولة</button>:<span className={'cloud-status '+syncStatus}>{syncStatus==='saved'?'محفوظ في السحابة':'جارٍ الحفظ…'}</span>}</div>}<NotificationCenter user={user} profile={profile} onNavigate={navigate}/><button type="button" className={`icon-btn topbar-settings${view==='settings'?' active':''}`} aria-label="الإعدادات" title="الإعدادات" aria-current={view==='settings'?'page':undefined} onClick={()=>navigate('settings')}><Settings2 size={18} aria-hidden="true"/></button></div></header><div className="content">{view!=='home'&&<div className="page-top-nav"><button className="back" onClick={()=>navigate('home')}><ArrowRight size={16}/>العودة للرئيسية</button>{inDailySuite(view)&&<nav className="section-subnav" aria-label="أقسام حياتي مع الله">{dailySuiteViews.map(item=><button key={item.id} type="button" className={view===item.id?'active':''} aria-current={view===item.id?'page':undefined} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav>}</div>}
    {checkingFeature&&<div className="auth-loading" dir="rtl" role="status">جارٍ التحقق من استحقاق الميزة…</div>}
    {deniedFeature&&<section className="panel feature-access-required" dir="rtl"><h1>{featureAccess.title||'هذه الميزة مدفوعة'}</h1>{featureAccess.enabled===false?<p>هذه الميزة معطلة حاليًا من الإدارة. لا يمكن الاشتراك فيها حتى تُفعّل. تواصل مع إدارة المنصة.</p>:<><p>هذه الميزة غير مشمولة باستحقاق حسابك. {featureAccess.price_amount&&featureAccess.currency_code?`السعر: ${new Intl.NumberFormat('ar-EG',{style:'currency',currency:featureAccess.currency_code,maximumFractionDigits:3}).format(featureAccess.price_amount)} ${featureAccess.billing_interval==='monthly'?'شهريًا':featureAccess.billing_interval==='yearly'?'سنويًا':''}.`:''}</p><p>للوصول، اشترك عبر الدفع (الدفع (sandbox) حتى اعتماد المزود). تفعيل الوصول يتم بعد تحقق المزود (webhook)، وليس بمجرد إعادة التوجيه.</p></>}<div className="feature-access-actions"><button className="soft-btn" onClick={()=>navigate('home')}>العودة إلى الرئيسية</button>{featureAccess.enabled!==false&&requiredFeature&&<button className="primary" onClick={()=>{setPaymentFeature(requiredFeature);navigate('payment')}}>اشترك الآن</button>}{user&&<button className="soft-btn" onClick={()=>navigate('paymentHistory')}>سجل الدفع</button>}</div></section>}
    {featureCheckFailed&&<section className="panel feature-access-required" dir="rtl" role="alert"><h2>تعذّر التحقق من صلاحية الميزة</h2><p>لم نفتح القسم لأن خدمة الصلاحيات لم تُرجع نتيجة موثوقة. تحقق من الاتصال ثم أعد المحاولة.</p><button className="soft-btn" onClick={()=>setRetryFeatureAccess(value=>value+1)}>إعادة التحقق</button></section>}
    {canRenderView&&<ErrorBoundary key={`${view}:${viewRecovery}`} fallback={<section className="panel feature-access-required" dir="rtl" role="alert"><h2>{typeof navigator!=='undefined'&&!navigator.onLine?'هذا القسم غير متاح دون اتصال بالإنترنت':'تعذر فتح هذا القسم'}</h2><p>{typeof navigator!=='undefined'&&!navigator.onLine?'تحقق من اتصالك بالإنترنت ثم أعد المحاولة؛ بيانات حسابك محفوظة وبقية الأقسام المحلية تعمل بلا اتصال.':'حدث خلل أثناء عرض الصفحة. بيانات حسابك محفوظة؛ جرّب إعادة فتح القسم.'}</p><button className="soft-btn" onClick={()=>setViewRecovery(value=>value+1)}>إعادة المحاولة</button></section>}><Suspense fallback={loadingView}>
    {view==='home'&&<HomeView navigate={navigate} admin={admin} prayers={{...((profile?.prayer_settings?.times as Record<string,string>|undefined)??{}),...state.prayers}} prayerLocation={state.prayerLocation} currentDate={currentDate} tasks={state.tasks} taskSchedules={state.taskSchedules??{}}/>}
    {view==='tasks'&&<TodayTasksView onOpenHifzTask={h=>{try{localStorage.setItem('rabbani-hifz-pending-task-v1',JSON.stringify(h))}catch{/* ignore */}setQuranSection('hifz');navigate('quran');setQuranSection('hifz')}} tasks={state.tasks} goals={state.goals} taskSchedules={state.taskSchedules??{}} onTaskSchedules={taskSchedules=>update(s=>({...s,taskSchedules}))} onTasks={tasks=>update(s=>({...s,tasks}))} onGoals={goals=>update(s=>({...s,goals}))} onQuranTaskComplete={completeQuranTask} onBack={()=>navigate('day')} notify={notify} onOpenNotificationSettings={()=>{requestNotificationSection('tasks');navigate('settings')}}/>}
    {view==='day'&&<DayPlanner scheduledTasks={state.tasks.filter(task=>task.period==='weekly'||task.period==='monthly')} confirmedTasks={Object.entries(state.taskSchedules??{}).flatMap(([id,schedule])=>{const date=schedule.confirmedDate??schedule.initialDate;const time=schedule.confirmedTime??schedule.initialTime??slotClockTime(schedule.confirmedSlot??schedule.initialSlot,{...((profile?.prayer_settings?.times as Record<string,string>|undefined)??{}),...state.prayers});if(!date||!time)return [];return [{id,title:schedule.title,date,time,confirmed:Boolean(schedule.confirmedDate)}]})} onWeek={()=>navigate('week')} onMonth={()=>navigate('month')} records={state.dayRecords} dailyTasks={state.tasks.filter(task=>task.period==='daily')} onRecords={dayRecords=>update(s=>updateDayRecords(s,dayRecords))} plan={state.dayPlan} prayers={{...((profile?.prayer_settings?.times as Record<string,string>|undefined)??{}),...state.prayers}} onPlan={dayPlan=>update(s=>({...s,dayPlan}))} onPrayer={(name,time)=>update(s=>({...s,prayers:{...s.prayers,[name]:time}}))} prayerLocation={state.prayerLocation} onPrayerLocation={prayerLocation=>update(s=>({...s,prayerLocation}))} onReflect={()=>navigate('reflect')}/>}
    {view==='week'&&<WeeklyPlanner tasks={state.tasks.filter(t=>t.period==='weekly')} onTasks={tasks=>update(s=>replacePeriodTasks(s,'weekly',tasks))}/>}
    {view==='month'&&<MonthlyPlanner tasks={state.tasks.filter(t=>t.period==='monthly')} onTasks={tasks=>update(s=>replacePeriodTasks(s,'monthly',tasks))}/>}
    {view==='goals'&&<StrongGoals goals={state.goals} onGoals={goals=>update(s=>({...s,goals}))}/>}
    {view==='quran'&&<QuranSunnahView state={state.quran} onState={quran=>update(s=>({...s,quran}))} tasks={state.tasks} onTasks={tasks=>update(s=>({...s,tasks}))} taskSchedules={state.taskSchedules??{}} onTaskSchedules={taskSchedules=>update(s=>({...s,taskSchedules}))} notify={notify} onOpenTasks={()=>navigate('tasks')} initialSection={quranSection} onBackToPrevious={navigateBack}/>}
    {view==='haramain'&&<HaramainLive/>}
{view==='qibla'&&<QiblaScreen notify={notify}/>}
    {view==='mosques'&&<MosquesScreen notify={notify}/>}
    {view==='reflect'&&<ReflectionView reflections={state.reflections} onAdd={text=>{update(s=>({...s,reflections:[newReflection(text),...s.reflections]}));notify('حُفظت المراجعة')}} onDelete={id=>update(s=>({...s,reflections:s.reflections.filter(x=>x.id!==id)}))} navigate={navigate}/>}

    {view==='wird'&&<WirdsView wirds={state.wirds} onCountChange={(id,delta)=>update(s=>({...s,wirds:changeWirdCount(s.wirds,id,delta)}))} onWirds={wirds=>update(s=>({...s,wirds:normalizeWirds(wirds)}))} notify={notify} navigate={navigate}/>}
    {!LOCAL_ONLY&&view==='profile'&&<ProfileView user={user!} notify={notify} onProfileSaved={()=>{}}/>}
    {view==='settings'&&<SettingsView state={state} onReplace={setState} notify={notify} onOpenProfile={()=>navigate('profile')}/>}
    {!LOCAL_ONLY&&view==='payment'&&<PaymentCheckout user={user!} featureKey={paymentFeature} onBack={()=>navigate('home')}/>}
    {!LOCAL_ONLY&&view==='paymentHistory'&&<PaymentHistory user={user!} onBack={()=>navigate('home')} onNotify={notify}/>}
    </Suspense></ErrorBoundary>}
  </div><ScrollToTopFab enabled={canRenderView}/><footer>© 2026 الربانيون — جميع الحقوق محفوظة </footer></main>{!isOnline&&<div className="offline-pill" role="status" aria-live="polite"><WifiOff size={14} aria-hidden="true"/><span>وضع عدم الاتصال · التخزين المحلي نشط</span></div>}{toast&&<div className="toast"><Check size={16}/>{toast}</div>}<MiniAudioPlayer onOpenCategory={openAudioCategory}/><nav className="mobile-nav" aria-label="التنقل السفلي"><button className={view==='home'?'active':''} aria-current={view==='home'?'page':undefined} onClick={()=>navigate('home')}><Home size={20} aria-hidden="true"/><span>الرئيسية</span></button><button data-section="daily" className={inDailySuite(view)?'active':''} aria-current={inDailySuite(view)?'page':undefined} onClick={()=>navigate('day')}><CalendarDays size={20} aria-hidden="true"/><span>حياتي</span></button><button data-section="quran" className={view==='quran'?'active':''} aria-current={view==='quran'?'page':undefined} onClick={()=>navigate('quran')}><BookMarked size={20} aria-hidden="true"/><span>القرآن</span></button><button data-section="qibla" className={view==='qibla'?'active':''} aria-current={view==='qibla'?'page':undefined} onClick={()=>navigate('qibla')}><Compass size={20} aria-hidden="true"/><span>القبلة</span></button><button data-section="daily" className={view==='mosques'?'active':''} aria-label="المساجد القريبة" aria-current={view==='mosques'?'page':undefined} onClick={()=>navigate('mosques')}><MapPin size={20} aria-hidden="true"/><span>المساجد</span></button><button data-section="haramain" className={view==='haramain'?'active':''} aria-current={view==='haramain'?'page':undefined} onClick={()=>navigate('haramain')}><MonitorPlay size={20} aria-hidden="true"/><span>الحرمين</span></button><button data-section="accountability" className={['reflect','wird'].includes(view)?'active':''} aria-current={['reflect','wird'].includes(view)?'page':undefined} onClick={()=>navigate('reflect')}><Heart size={20} aria-hidden="true"/><span>المحاسبة</span></button></nav></div>;
}
