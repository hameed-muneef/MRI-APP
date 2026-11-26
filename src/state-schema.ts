import {z} from 'zod';

// Validate every persisted branch before React consumes it. Missing fields from
// older exports are allowed; present fields must still have the right shape.
const str=z.string(), num=z.number().finite(), bool=z.boolean();
const rec=<T extends z.ZodType>(schema:T)=>z.record(z.string(),schema);
const obj=z.object;
const period=z.enum(['daily','weekly','monthly']);
const goalPeriod=z.enum(['daily','weekly','monthly','yearly','custom']);
const content=z.enum(['quran','hadith']);
const kind=z.enum(['quran_reading','quran_memorization','quran_revision','hadith_reading','hadith_memorization','reflection']);
const days=z.array(z.number().int().min(0).max(6));
const stamps={createdAt:str,updatedAt:str};
const reference={surah:num.optional(),ayahStart:num.optional(),ayahEnd:num.optional(),collectionKey:str.optional(),hadithNumber:num.optional()};
const timing=obj({anchor:str,offset:num});
const activity=obj({id:str,title:str,timing:timing.optional(),duration:num.optional(),scheduleStatus:z.enum(['initial','confirmed']).optional()});
const task=obj({id:str,title:str,period,done:bool,optional:bool,weekStart:str.optional(),monthKey:str.optional(),scheduledDate:str.optional(),doneKey:str.optional(),sourceLabel:str.optional(),source:obj({groupId:str,revision:num,position:num}).optional(),hifz:obj({passageId:str,sessionId:str,surah:num,from:num,to:num,tail:z.array(obj({surah:num,from:num,to:num})).optional()}).optional(),plan:obj({planId:str,kind:z.enum(['day','week','month']),step:num.optional()}).optional()});
const step=obj({id:str,title:str,period:goalPeriod,done:rec(bool),customDate:str.optional()});
const goal=obj({id:str,title:str,benefit:str,targetDate:str.optional(),createdAt:str.optional(),steps:z.array(step).optional(),action:str.optional(),period:goalPeriod.optional()});
const schedule=obj({initialDate:str.optional(),initialSlot:str.optional(),initialTime:str.optional(),confirmedDate:str.optional(),confirmedSlot:str.optional(),confirmedTime:str.optional(),title:str,sourceLabel:str,notifyEnabled:bool.optional(),remindBeforeMinutes:num.optional()});
const dayPlan=obj({activities:rec(z.array(activity)),completed:rec(str),workStart:str,sleep:str,defaultsVersion:num.optional()});
const tracked=obj({id:str,title:str,period:str,start:str,end:str,startDay:str,endDay:str,duration:num,status:z.enum(['pending','done','deferred'])});
const dayRecord=obj({date:str,savedAt:str,items:z.array(tracked),openingMessage:str.optional(),resolveMessage:str.optional(),review:obj({gratitude:str,improvement:str,savedAt:str}).optional(),prayers:rec(z.enum(['ontime','late','excused','missed'])).optional()});
const quran=obj({
 settings:obj({fontSize:num,theme:z.enum(['light','dark'])}).optional(),
 readingPosition:obj({surah:num,ayah:num,juz:num.optional(),page:num.optional(),updatedAt:str}).optional(),
 bookmarks:z.array(obj({id:str,surah:num,ayah:num,label:str,name:str.optional(),page:num.optional(),createdAt:str})).optional(),
 notes:z.array(obj({id:str,surah:num,ayahStart:num,ayahEnd:num,body:str,...stamps})).optional(),
 history:z.array(obj({id:str,surah:num,ayahStart:num,ayahEnd:num,readAt:str})).optional(),
 plans:z.array(obj({id:str,contentType:content,title:str,startSurah:num.optional(),startAyah:num.optional(),endSurah:num.optional(),endAyah:num.optional(),collectionKey:str.optional(),hadithStart:num.optional(),hadithEnd:num.optional(),dailyTarget:num.positive(),targetUnit:z.enum(['verses','hadith','pages','half_pages']),schedule:obj({days,targetDate:str.optional()}),status:z.enum(['active','paused','completed']),...stamps})).optional(),
 passages:z.array(obj({id:str,planId:str.optional(),contentType:content,...reference,state:z.enum(['new','learning','needs_revision','good','mastered']),ease:num,intervalDays:num,dueDate:str.optional(),lastReviewedAt:str.optional(),reviewCount:num,lapses:num,...stamps})).optional(),
 revisionEvents:z.array(obj({id:str,passageId:str,reviewedAt:str,quality:num,outcome:z.enum(['failed','passed']),nextDueDate:str.optional(),intervalDays:num})).optional(),
 reflections:z.array(obj({id:str,sourceType:content,...reference,learned:str,meaning:str,action:str,trait:str,intention:str,isPrivate:bool,...stamps})).optional(),
 routine:z.array(obj({id:str,kind,slot:z.enum(['fajr','duha','dhuhr','asr','maghrib','isha','any']),days,enabled:bool,config:obj({surah:num.optional(),ayahFrom:num.optional(),ayahTo:num.optional(),planId:str.optional(),collectionKey:str.optional()}),linkedTaskId:str.optional(),...stamps})).optional(),
 hadithBookmarks:z.array(obj({id:str,collectionKey:str,hadithNumber:num,label:str,createdAt:str})).optional(),
 activityLog:z.array(obj({activityId:str,date:str,kind})).optional(),updatedAt:str.optional(),
});
export const storedStateSchema=obj({
 tasks:z.array(task).optional(),goals:z.array(goal).optional(),
 wirds:z.array(obj({id:str,title:str,target:num,count:num,period,periodKey:str})).optional(),
 reflections:z.array(obj({id:str,date:str,text:str})).optional(),lessonStep:num.optional(),prayers:rec(str).optional(),
 taskSchedules:rec(schedule).optional(),dayPlan:dayPlan.optional(),dayRecords:rec(dayRecord).optional(),
 prayerLocation:obj({name:str,country:str,latitude:num.min(-90).max(90),longitude:num.min(-180).max(180),timezone:str.refine(zone=>{try{new Intl.DateTimeFormat('en',{timeZone:zone});return true}catch{return false}}),method:num.optional(),school:z.union([z.literal(0),z.literal(1)]).optional()}).optional(),quran:quran.optional(),achievementLog:z.array(obj({id:str,kind:z.enum(['bilquran_step','adhkar_category','wird_complete']),date:str,refId:str,label:str.optional(),at:str})).optional(),
});
export function parseStoredState(raw:string){return storedStateSchema.parse(JSON.parse(raw))}
