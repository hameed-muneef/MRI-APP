import {useState} from 'react';
import CoachWird from '../coach/CoachWird';
import {PenLine,Flower2,Trash2,Plus,Info} from 'lucide-react';
import {type View,type Period,type Wird,periodKey} from '../app-state';
import {uid} from '../id';

type Props={wirds:Wird[];onWirds:(wirds:Wird[])=>void;onCountChange:(id:string,delta:number)=>void;notify:(message:string)=>void;navigate:(view:View)=>void};

const wirdOptions=['الاستغفار','الصلاة على النبي ﷺ','سبحان الله','الحمد لله','الله أكبر','لا إله إلا الله','لا حول ولا قوة إلا بالله','سبحان الله وبحمده'];

// أوراد الشخصية: أهداف عددية يختارها المستخدم للذكر المطلق دون اعتقاد فضل للعدد.
export default function WirdsView({wirds,onWirds,onCountChange,notify,navigate}:Props) {
  const [wirdTitle,setWirdTitle]=useState('');
  const [wirdTarget,setWirdTarget]=useState(100);
  const [wirdPeriod,setWirdPeriod]=useState<Period>('daily');
  const addWird=()=>{
    if(!wirdTitle.trim()||wirdTarget<1)return;
    onWirds([...wirds,{id:uid(),title:wirdTitle.trim(),target:wirdTarget,count:0,period:wirdPeriod,periodKey:periodKey(wirdPeriod)}]);
    setWirdTitle('');
    notify('أُضيف الورد');
  };
  return <><div className="page-intro"><span className="eyebrow">حاسب نفسك</span><h1>زكِّ نفسك</h1><p>اختر ما تحب من الذكر المطلق، وحدد لنفسك هدفًا تنظيميًا دون اعتقاد فضل خاص للعدد الذي اخترته.</p></div><div className="switch-row" role="tablist" aria-label="أقسام المحاسبة والأوراد"><button type="button" role="tab" aria-selected={false} onClick={()=>navigate('reflect')}><PenLine size={17}/> محاسبة النفس</button><button type="button" role="tab" aria-selected={true} className="selected" onClick={()=>navigate('wird')}><Flower2 size={17}/> زكِّ نفسك</button></div><div className="wird-grid">{wirds.map(w=>{const done=w.count>=w.target;return <div className={`wird-card${done?' is-complete':''}`} key={w.id}><div className="wird-head"><span className="wird-flower"><Flower2 size={20}/></span><div className="wird-head-actions">{done&&<span className="wird-done-label">أتممت الهدف</span>}<button className="icon-btn danger" aria-label={`حذف ${w.title}`} onClick={()=>onWirds(wirds.filter(x=>x.id!==w.id))}><Trash2 size={16}/></button></div></div><h3>{w.title}</h3><p>{w.period==='daily'?'هدف يومي':w.period==='weekly'?'هدف أسبوعي':'هدف شهري'} · {w.target.toLocaleString('ar-EG')}</p><div className="progress-track"><div style={{width:`${Math.min(100,w.count/w.target*100)}%`}}/></div><div className="count-row"><strong>{w.count.toLocaleString('ar-EG')}</strong><span>من {w.target.toLocaleString('ar-EG')}</span></div><CoachWird wird={w} onChange={next=>onWirds(wirds.map(x=>x.id===w.id?next:x))}/><div className="counter-actions">{[1,10,100].map(n=><button key={n} onClick={()=>onCountChange(w.id,n)}>+{n}</button>)}<button aria-label="تصحيح العدد" onClick={()=>onCountChange(w.id,-1)}>−1</button></div></div>;})}</div><section className="panel"><h3>إضافة ورد شخصي</h3><form className="form-grid" onSubmit={e=>{e.preventDefault();addWird()}}><label>الذكر<select value={wirdTitle} onChange={e=>setWirdTitle(e.target.value)} required><option value="">اختر ذكرًا</option>{wirdOptions.map(x=><option key={x}>{x}</option>)}</select></label><label>الهدف العددي<input type="number" min="1" value={wirdTarget} onChange={e=>setWirdTarget(Number(e.target.value))}/></label><label>الفترة<select value={wirdPeriod} onChange={e=>setWirdPeriod(e.target.value as Period)}><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></select></label><button className="primary"><Plus size={17}/> إضافة الورد</button></form></section><div className="hint"><Info size={17}/> هذه أعداد تنظيمية يختارها المستخدم للذكر المطلق، ولا تعني أن لها فضيلة مخصوصة. الأذكار المقيدة بعدد أو وقت تحتاج عرضًا موثقًا منفصلًا.</div></>;
}
