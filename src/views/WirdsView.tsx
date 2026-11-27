import {useState} from 'react';
import {wirdPaceText} from '../coach/CoachWird';
import {habitOn,wirdPace} from '../coach/habit';
import SuggestionLine from '../coach/SuggestionLine';
import {PenLine,Flower2,Trash2,Plus,Info} from 'lucide-react';
import {type View,type Period,type Wird,type Task,type TaskSchedule,periodKey,today} from '../app-state';
import {uid} from '../id';

import type {CoachSettings} from '../coach/types';

type Props={wirds:Wird[];coachSettings?:CoachSettings;onWirds:(wirds:Wird[])=>void;onCountChange:(id:string,delta:number)=>void;notify:(message:string)=>void;navigate:(view:View)=>void;onAddTask?:(task:Task,schedule?:TaskSchedule)=>void};

const wirdOptions=['الاستغفار','الصلاة على النبي ﷺ','سبحان الله','الحمد لله','الله أكبر','لا إله إلا الله','لا حول ولا قوة إلا بالله','سبحان الله وبحمده'];

// أوراد الشخصية: أهداف عددية يختارها المستخدم للذكر المطلق دون اعتقاد فضل للعدد.
export default function WirdsView({wirds,coachSettings,onWirds,onCountChange,notify,navigate,onAddTask}:Props) {
  const [wirdTitle,setWirdTitle]=useState('');
  const [wirdTarget,setWirdTarget]=useState(100);
  const [wirdPeriod,setWirdPeriod]=useState<Period>('daily');
  const [addToTasks,setAddToTasks]=useState(true);
  const [wirdTime,setWirdTime]=useState('');
  const [confirmDeleteId,setConfirmDeleteId]=useState<string|null>(null);
  const addWird=()=>{
    if(!wirdTitle.trim()||wirdTarget<1)return;
    const id=uid();
    const title=wirdTitle.trim();
    onWirds([...wirds,{id,title,target:wirdTarget,count:0,period:wirdPeriod,periodKey:periodKey(wirdPeriod)}]);
    // يظهر الورد أيضًا في مركز المهام (وبوقته إن حدّده فيصله تنبيه المهام).
    if(addToTasks&&onAddTask){
      const label=`ورد: ${title} (${wirdTarget.toLocaleString('ar-EG')})`;
      const task:Task={id:`wird-task-${id}`,title:label,period:wirdPeriod,done:false,optional:false,sourceLabel:'زكِّ نفسك'};
      const schedule:TaskSchedule|undefined=wirdTime?{confirmedDate:today(),confirmedTime:wirdTime,title:label,sourceLabel:'زكِّ نفسك',notifyEnabled:true}:undefined;
      onAddTask(task,schedule);
    }
    setWirdTitle('');
    notify(addToTasks&&onAddTask?(wirdTime?`أُضيف الورد إلى مركز المهام وسيصلك تنبيه عند ${wirdTime}`:'أُضيف الورد وظهر في مركز المهام'):'أُضيف الورد');
  };
  return <><div className="page-intro"><span className="eyebrow">حاسب نفسك</span><h1>زكِّ نفسك</h1><p>اختر ما تحب من الذكر المطلق، وحدد لنفسك هدفًا تنظيميًا دون اعتقاد فضل خاص للعدد الذي اخترته.</p></div><div className="switch-row" role="tablist" aria-label="أقسام المحاسبة والأوراد"><button type="button" role="tab" aria-selected={false} onClick={()=>navigate('reflect')}><PenLine size={17}/> محاسبة النفس</button><button type="button" role="tab" aria-selected={true} className="selected" onClick={()=>navigate('wird')}><Flower2 size={17}/> زكِّ نفسك</button></div><div className="wird-grid">{wirds.map(w=>{const done=w.count>=w.target;return <div className={`wird-card${done?' is-complete':''}`} key={w.id}><div className="wird-head"><span className="wird-flower"><Flower2 size={20}/></span><div className="wird-head-actions">{done&&<span className="wird-done-label">أتممت الهدف</span>}<button className="icon-btn danger" aria-label={`حذف ${w.title}`} aria-expanded={confirmDeleteId===w.id} onClick={()=>setConfirmDeleteId(confirmDeleteId===w.id?null:w.id)}><Trash2 size={16}/></button></div></div><h3>{w.title}</h3><p>{w.period==='daily'?'هدف يومي':w.period==='weekly'?'هدف أسبوعي':'هدف شهري'} · {w.target.toLocaleString('ar-EG')}</p>{habitOn(w,coachSettings)&&<SuggestionLine text={wirdPaceText(w,wirdPace(w))}/>}<div className="progress-track"><div style={{width:`${Math.min(100,w.count/w.target*100)}%`}}/></div>{confirmDeleteId===w.id&&<div className="notif-confirm" role="alertdialog" aria-label={`تأكيد حذف ${w.title}`}><p className="small">حذف «{w.title}» نهائيًا؟</p><div className="notif-confirm-actions"><button type="button" className="outline-danger" onClick={()=>{onWirds(wirds.filter(x=>x.id!==w.id));setConfirmDeleteId(null)}}>تأكيد الحذف</button><button type="button" className="soft-btn" onClick={()=>setConfirmDeleteId(null)}>إلغاء</button></div></div>}<div className="count-row"><strong>{w.count.toLocaleString('ar-EG')}</strong><span>من {w.target.toLocaleString('ar-EG')}</span></div><div className="counter-actions">{[1,10,100].map(n=><button key={n} onClick={()=>onCountChange(w.id,n)}>+{n}</button>)}<button aria-label="تصحيح العدد" onClick={()=>onCountChange(w.id,-1)}>−1</button></div></div>;})}</div><section className="panel"><h3>إضافة ورد شخصي</h3><form className="form-grid" onSubmit={e=>{e.preventDefault();addWird()}}><label>الذكر أو الورد<input list="wird-options" value={wirdTitle} onChange={e=>setWirdTitle(e.target.value)} placeholder="اختر أو اكتب ورد، مثل: قراءة سورة الكهف" required/><datalist id="wird-options">{wirdOptions.map(x=><option key={x} value={x}/>)}</datalist></label><label>الهدف العددي<input type="number" min="1" value={wirdTarget} onChange={e=>setWirdTarget(Number(e.target.value))}/></label><label>الفترة<select value={wirdPeriod} onChange={e=>setWirdPeriod(e.target.value as Period)}><option value="daily">يومي</option><option value="weekly">أسبوعي</option><option value="monthly">شهري</option></select></label><label>وقت التنبيه (اختياري)<input type="time" value={wirdTime} onChange={e=>setWirdTime(e.target.value)}/></label><label className="hf-follow"><input type="checkbox" checked={addToTasks} onChange={e=>setAddToTasks(e.target.checked)}/> أضفه إلى مركز المهام</label><button className="primary"><Plus size={17}/> إضافة الورد</button></form></section><div className="hint"><Info size={17}/> هذه أعداد تنظيمية يختارها المستخدم للذكر المطلق، ولا تعني أن لها فضيلة مخصوصة. الأذكار المقيدة بعدد أو وقت تحتاج عرضًا موثقًا منفصلًا.</div></>;
}
