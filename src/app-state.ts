import {parseStoredState} from './state-schema';
import {type DayPlan} from './DayPlanner';
import {type DayRecords} from './day-tracking';
import {type Goal} from './goal-plan';
import {type AchievementEntry} from './achievement/log';
import {type PrayerLocation} from './prayer-location';
import {createQuranState} from './quran/learning';
import type {QuranLearningState} from './quran/types';
import {periodKey, normalizeWirds} from './wird-periods';
export {periodKey} from './wird-periods';

// أنواع الحالة المشتركة ومساعداتها، لاستخدامها في App والواجهات المستخرجة
export type View='home'|'day'|'tasks'|'week'|'month'|'goals'|'quran'|'haramain'|'reflect'|'wird'|'profile'|'settings'|'payment'|'paymentHistory'|'qibla'|'mosques'|'achievement';
export type Period='daily'|'weekly'|'monthly';
// doneKey: مفتاح الفترة التي تأشر فيها المهمة («يومي مع الله» جديد يوميًا، والأسبوعي والشهري مرتبطان بفترتهما)؛ راجع task-periods.ts
export type Task={id:string;title:string;period:Period;done:boolean;optional:boolean;weekStart?:string;monthKey?:string;scheduledDate?:string;doneKey?:string;sourceLabel?:string;source?:{groupId:string;revision:number;position:number};hifz?:{passageId:string;sessionId:string;surah:number;from:number;to:number;tail?:{surah:number;from:number;to:number}[]};plan?:{planId:string;kind:'day'|'week'|'month';step?:number}};
export type TaskSchedule={initialDate?:string;initialSlot?:string;initialTime?:string;confirmedDate?:string;confirmedSlot?:string;confirmedTime?:string;title:string;sourceLabel:string;notifyEnabled?:boolean;remindBeforeMinutes?:number};
export type Wird={id:string;title:string;target:number;count:number;period:Period;periodKey:string};
export type State={dayPlan?:DayPlan;dayRecords?:DayRecords;taskSchedules?:Record<string,TaskSchedule>;tasks:Task[];goals:Goal[];wirds:Wird[];reflections:{id:string;date:string;text:string}[];lessonStep:number;prayers:Record<string,string>;prayerLocation?:PrayerLocation;quran:QuranLearningState;achievementLog?:AchievementEntry[]};

export const today=()=>new Date().toLocaleDateString('en-CA');

export function createSeed():State{
  return {tasks:[
    {id:'d1',title:'قراءة ما تيسر من القرآن',period:'daily',done:false,optional:true},
    {id:'d2',title:'أذكار الصباح',period:'daily',done:false,optional:true},
    {id:'d3',title:'وقت للأسرة',period:'daily',done:false,optional:true},
    {id:'w1',title:'صلة رحم أو زيارة قريب',period:'weekly',done:false,optional:true},
    {id:'m1',title:'مراجعة أهداف الشهر',period:'monthly',done:false,optional:true},
  ],goals:[],wirds:[
    {id:'z1',title:'الاستغفار',target:100,count:0,period:'daily',periodKey:periodKey('daily')},
    {id:'z2',title:'الصلاة على النبي ﷺ',target:100,count:0,period:'weekly',periodKey:periodKey('weekly')},
  ],reflections:[],lessonStep:0,prayers:{},quran:createQuranState()};
}

export function load(storageKey='rabbani-v1'):State{
  try{return loadFromRaw(localStorage.getItem(storageKey))}catch{return createSeed()}
}

export function loadFromRaw(raw:string|null):State{
  try{
    if(raw){
      const x=parseStoredState(raw);
      return {...createSeed(),...x,quran:{...createQuranState(),...(x.quran??{})},wirds:normalizeWirds(x.wirds||[])};
    }
  }catch{/* تجاهل: بيانات تالفة تعني البدء من الصفر */}
  return createSeed();
}
