import {useEffect,useState} from 'react';
import { Capacitor } from '@capacitor/core';
import {MapPin,Search,Settings2} from 'lucide-react';
import {parseGeocodingResults,prayerMethods,sanitizePrayerLocation,type PrayerLocation} from './prayer-location';
import {openAppSettings} from './lib/settings-opener';

type Props={location?:PrayerLocation;onChange:(location?:PrayerLocation)=>void};

export default function PrayerLocationPicker({location,onChange}:Props){
  const [query,setQuery]=useState('');
  const [results,setResults]=useState<PrayerLocation[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [denied,setDenied]=useState(false);
  useEffect(()=>{setResults([]);setMessage('');setDenied(false)},[location]);
  const search=async(event:React.FormEvent)=>{
    event.preventDefault();
    const name=query.trim();
    if(name.length<2){setMessage('اكتب حرفين على الأقل من اسم المدينة.');return}
    setBusy(true);setMessage('');setResults([]);
    try{
      const params=new URLSearchParams({name,count:'8',language:'ar',format:'json'});
      const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if(!response.ok)throw new Error('Request failed');
      const found=parseGeocodingResults(await response.json());
      setResults(found);
      if(!found.length)setMessage('لم نجد هذه المدينة. جرّب كتابتها بطريقة أخرى أو بالإنجليزية.');
    }catch{setMessage('تعذر البحث الآن. تحقق من الاتصال أو أدخل المواقيت يدويًا.')}
    finally{setBusy(false)}
  };
  const choose=(item:PrayerLocation)=>{
    const next=sanitizePrayerLocation({...item,method:location?.method,school:location?.school});
    if(next){onChange(next);setQuery('')}
  };
  const detect=async()=>{
    setBusy(true);setMessage('جارٍ تحديد موقعك…');setDenied(false);
    // المخزن المركزي: نفس طلب الإذن الواحد المشترك بين كل أجزاء التطبيق.
    const {ensureCentralLocation}=await import('./lib/location-store');
    const res=await ensureCentralLocation({timeout:10000,maximumAge:600000});
    setBusy(false);
    if(!res.ok){ setMessage(res.message); setDenied(res.reason==='denied'||res.reason==='permanently-denied'); return; }
    const next=sanitizePrayerLocation({name:'موقعي الحالي',country:'',latitude:res.coords.latitude,longitude:res.coords.longitude,
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,method:location?.method,school:location?.school});
    if(next){setMessage('');onChange(next)}else setMessage('تعذر تحديد موقعك. ابحث عن مدينتك.');
  };
  const handleOpenSettings=async()=>{
    const r=await openAppSettings();
    if(!r.opened) setMessage('افتح إعدادات الهاتف ← التطبيقات ← الربانيون ← الأذونات ← الموقع.');
  };
  return <div className="prayer-city-picker">
    <button type="button" className="soft-btn" onClick={detect} disabled={busy}><MapPin size={16}/> ضبط المواقيت تلقائيًا من موقعي</button>
    {denied && Capacitor.isNativePlatform() && <button type="button" className="soft-btn" onClick={handleOpenSettings}><Settings2 size={16}/> فتح إعدادات التطبيق</button>}
    <form onSubmit={search} role="search" aria-label="البحث عن مدينة لمواقيت الصلاة">
      <label>مدينتك<input type="search" value={query} maxLength={80} onChange={event=>setQuery(event.target.value)} placeholder="مثل: صنعاء، القاهرة، الرياض"/></label>
      <button type="submit" className="soft-btn" disabled={busy}><Search size={16}/> بحث</button>
    </form>
    {message&&<p role="status" className="muted small">{message}</p>}
    {results.length>0&&<ul className="prayer-city-results" aria-label="نتائج البحث">{results.map(item=><li key={`${item.latitude},${item.longitude}`}>
      <button type="button" onClick={()=>choose(item)}><MapPin size={15}/> {item.name}{item.country?`، ${item.country}`:''} <small>{item.timezone}</small></button>
    </li>)}</ul>}
    {location&&<div className="prayer-city-selected">
      <p><MapPin size={16}/> المدينة المحفوظة: <strong>{location.name}{location.country?`، ${location.country}`:''}</strong> · تُحفظ على هذا الجهاز.</p>
      <div className="form-grid">
        <label>طريقة الحساب<select value={location.method??''} onChange={event=>onChange({...location,method:event.target.value===''?undefined:Number(event.target.value)})}>
          <option value="">تلقائية حسب الموقع</option>{prayerMethods.map(method=><option key={method.value} value={method.value}>{method.label}</option>)}
        </select></label>
        <label>وقت العصر<select value={location.school??0} onChange={event=>onChange({...location,school:event.target.value==='1'?1:0})}>
          <option value="0">الجمهور (الشافعي والمالكي والحنبلي)</option><option value="1">الحنفي</option>
        </select></label>
      </div>
      <button type="button" className="soft-btn" onClick={()=>onChange(undefined)}>إلغاء الموقع المحفوظ</button>
    </div>}
  </div>;
      }
