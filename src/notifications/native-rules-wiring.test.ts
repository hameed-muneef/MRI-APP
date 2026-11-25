import {expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({display:'granted',calls:[] as string[],rules:[] as unknown[][],schedule:vi.fn(async(x:{notifications:unknown[]})=>({notifications:x.notifications}))}));
vi.mock('@capacitor/local-notifications',()=>({LocalNotifications:{checkPermissions:async()=>({display:mock.display}),checkExactNotificationSetting:async()=>({exact_alarm:'granted'}),listChannels:async()=>({channels:[{id:'al-rabbani-general'}]}),getPending:async()=>({notifications:[]}),cancel:async()=>{},schedule:mock.schedule}}));
vi.mock('../lib/settings-opener',()=>({getAndroidEnvironmentStatus:async()=>({hasAdhanRawSound:true}),ensureNativeAdhanChannel:async()=>null,
  setNativeReminderQueue:async(kind:string)=>{mock.calls.push('queue:'+kind);return true},
  setNativeReminderRules:async(r:unknown[])=>{mock.calls.push('rules:'+r.length);mock.rules.push(r);return true},
  rebalanceNativeReminderQueue:async()=>true}));
import {scheduleNativePersonalReminders} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE,type Reminder} from './types';

it('publishes the daily/weekly rules before the queue, and removes them on permission loss, master switch off or when nothing is left',async()=>{
  const data=new Map<string,string>();const store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)};
  vi.stubGlobal('window',{localStorage:store,Capacitor:{isNativePlatform:()=>true},dispatchEvent:()=>{}});vi.stubGlobal('CustomEvent',class{});
  const now=new Date(2026,10,23,7);
  const mk=(id:string,recurrence:Reminder['recurrence'])=>({id,user_id:'',title:id,scheduled_at:new Date(2026,10,1,9).toISOString(),recurrence,category:'worship',enabled:true,created_at:'',updated_at:''}) as Reminder;
  const prefs=structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);prefs.global_enabled=true;prefs.dnd_enabled=false;
  const rs=[mk('d','daily'),mk('w','weekly'),mk('m','monthly')];

  await scheduleNativePersonalReminders(rs,prefs,now);
  expect(mock.calls.slice(-2)).toEqual(['rules:2','queue:reminder']);
  expect((mock.rules[mock.rules.length-1] as {rid:string}[]).map((r)=>r.rid)).toEqual(['d','w']);

  mock.calls.length=0;mock.display='denied';
  await scheduleNativePersonalReminders(rs,prefs,now);
  expect(mock.calls).toEqual(['rules:0','queue:reminder']);

  mock.calls.length=0;mock.display='granted';
  await scheduleNativePersonalReminders(rs,{...prefs,global_enabled:false},now);
  expect(mock.calls.filter((c)=>c.startsWith('rules'))).toEqual(['rules:0']);

  mock.calls.length=0;
  await scheduleNativePersonalReminders([{...mk('d','daily'),enabled:false}],prefs,now);
  expect(mock.calls.filter((c)=>c.startsWith('rules'))).toEqual(['rules:0']);
});
