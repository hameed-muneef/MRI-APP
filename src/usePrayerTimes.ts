import {useEffect, useState} from 'react';
import {prayerLocationKey, type PrayerLocation} from './prayer-location';

export function prayerDate(now = new Date()) {
  return `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
}

export function parsePrayerTimes(data: unknown): Record<string,string> {
  const names = {Fajr:'الفجر',Sunrise:'الشروق',Dhuhr:'الظهر',Asr:'العصر',Maghrib:'المغرب',Isha:'العشاء'};
  const timings = data as Record<string,unknown> | undefined;
  return Object.fromEntries(Object.entries(names).map(([key,name])=>{
    const value = timings?.[key];
    if(typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Invalid prayer times');
    return [name,value];
  }));
}

const CACHE_KEY='rabbani-prayer-times-v1';
type PrayerTimesCache={date:string;zone:string;times:Record<string,string>};
function loadPrayerTimesCache(context:{date:string;zone:string}):PrayerTimesCache|null{
  try{
    const raw=localStorage.getItem(CACHE_KEY);
    if(!raw)return null;
    const entry=JSON.parse(raw) as PrayerTimesCache;
    if(!entry||entry.date!==context.date||entry.zone!==context.zone||!entry.times||typeof entry.times!=='object')return null;
    return entry;
  }catch{return null}
}

// Prayer times are calculated on the device with the `adhan` library. No
// coordinates or device location are sent to any server.
export default function usePrayerTimes(enabled: boolean, saved?: PrayerLocation) {
  const [context,setContext] = useState(()=>({date:prayerDate(),zone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
  const [attempt,setAttempt] = useState(0);
  const [prayers,setPrayers] = useState<Record<string,string>>({});
  const [status,setStatus] = useState('');
  const [loading,setLoading] = useState(false);
  useEffect(()=>{
    const check = ()=>setContext(old=>{
      const date=prayerDate(), zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
      return old.date===date && old.zone===zone ? old : {date,zone};
    });
    const timer=window.setInterval(check,30000);
    window.addEventListener('focus',check);
    const onVis=()=>{if(document.visibilityState==='visible')check()};
    document.addEventListener('visibilitychange',onVis);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',onVis)};
  },[]);
  const savedKey=saved?prayerLocationKey(saved):'';
  useEffect(()=>{
    if(!enabled) return;
    let active=true;
    if(!attempt){
      const cached=loadPrayerTimesCache({date:context.date,zone:saved?savedKey:context.zone});
      if(cached){
        setPrayers(cached.times);
        setStatus(saved?`مواقيت ${saved.name} محفوظة محليًا · ${context.date}`:`مواقيت اليوم محفوظة محليًا · ${context.date} · توقيت الجهاز: ${context.zone}`);
        setLoading(false);
        return ()=>{active=false};
      }
    }
    setPrayers({});
    setLoading(true);
    const fail=(message:string)=>{if(active){setStatus(message);setLoading(false)}};
    const store=(times:Record<string,string>,cacheZone:string,label:string)=>{
      if(!active)return;
      setPrayers(times);
      try{localStorage.setItem(CACHE_KEY,JSON.stringify({date:context.date,zone:cacheZone,times}))}catch{}
      setStatus(label);
      setLoading(false);
    };
    const computeLocally=async(loc:PrayerLocation,cacheZone:string,label:string):Promise<boolean>=>{
      try{
        const {computeDayPrayerStrings,defaultMethodForCoordinates,mapAlAdhanMadhab,mapAlAdhanMethod}=await import('./lib/prayer-schedule');
        const method=loc.method===undefined?defaultMethodForCoordinates(loc.latitude,loc.longitude):mapAlAdhanMethod(loc.method);
        const times=computeDayPrayerStrings(
          {latitude:loc.latitude,longitude:loc.longitude},
          new Date(),
          method,
          mapAlAdhanMadhab(loc.school),
          loc.timezone,
        );
        if(Object.keys(times).length>=5){
          store(times,cacheZone,label);
          return true;
        }
      }catch{/* fall through to the message below */}
      return false;
    };
    if(saved){
      const label=`مواقيت ${saved.name}${saved.country?`، ${saved.country}`:''} · ${context.date} · محسوبة على جهازك`;
      void computeLocally(saved,savedKey,label).then(ok=>{
        if(!ok) fail('تعذر حساب المواقيت لهذا الموقع. اختر مدينة أخرى أو أدخل المواقيت يدويًا.');
      });
    } else {
      setStatus('جارٍ تحديد موقعك من الجهاز…');
      const advice='ابحث عن مدينتك أدناه أو أدخل المواقيت يدويًا.';
      if(!navigator.geolocation || !window.isSecureContext){
        fail(`تحديد الموقع غير متاح. ${advice}`);
      } else navigator.geolocation.getCurrentPosition(position=>{
        if(!active) return;
        const loc:PrayerLocation={name:'موقعي',country:'',latitude:position.coords.latitude,longitude:position.coords.longitude,timezone:context.zone};
        const label=`مواقيت اليوم حسب موقعك · ${context.date} · توقيت الجهاز: ${context.zone} · محسوبة على جهازك`;
        void computeLocally(loc,context.zone,label).then(ok=>{
          if(!ok) fail(`تعذر حساب المواقيت. ${advice}`);
        });
      },error=>fail(error.code===1?`لم يُسمح بالوصول للموقع. ${advice}`:`تعذر تحديد موقعك. ${advice}`),{timeout:10000,maximumAge:0,enableHighAccuracy:false});
    }
    return ()=>{active=false};
  },[enabled,context,attempt,savedKey]);
  return {prayers,status,loading,refresh:()=>setAttempt(value=>value+1)};
}
