import {z} from 'zod';
import {verseRangeSchema} from './storage';
import {isVerseReciter,resolveVerseAudioUrl} from '../quran/verse-reciters';
import type {VerseRange} from './types';
export const AYAH_RESOLUTION_CACHE='rabbani-quran-ayah-resolve-v1';
export const SESSION_PACK_KEY='rabbani-mastery-audio-packs-v1';
const AUDIO='rabbani-quran-audio-v1';
export type SessionPack={key:string;reciterId:number;range:VerseRange;urls:string[];completed:number;total:number;bytes:number;status:'partial'|'ready'|'error';error?:string;updatedAt:string};
const packSchema=z.object({key:z.string().min(1),reciterId:z.number().int(),range:verseRangeSchema,urls:z.array(z.string().url()),completed:z.number().int().min(0),total:z.number().int().min(1),bytes:z.number().nonnegative(),status:z.enum(['partial','ready','error']),error:z.string().optional(),updatedAt:z.string()}).refine(p=>p.completed<=p.total&&p.urls.length===p.completed&&p.total===p.range.ayahEnd-p.range.ayahStart+1);
export function sessionPacks():SessionPack[]{try{const x=JSON.parse(localStorage.getItem(SESSION_PACK_KEY)??'[]');if(!Array.isArray(x))return [];return x.flatMap(p=>{const result=packSchema.safeParse(p);return result.success?[result.data]:[];});}catch{return [];}}
function save(pack:SessionPack){localStorage.setItem(SESSION_PACK_KEY,JSON.stringify([...sessionPacks().filter(p=>p.key!==pack.key),pack]));}
export async function downloadSessionPack(reciterId:number,range:VerseRange,signal:AbortSignal,onProgress:(p:SessionPack)=>void):Promise<SessionPack>{
 if(!isVerseReciter(reciterId)||!Number.isInteger(range.surah)||range.surah<1||range.surah>114||!Number.isInteger(range.ayahEnd)||!Number.isInteger(range.ayahStart)||range.ayahStart<1||range.ayahEnd<range.ayahStart||range.ayahEnd-range.ayahStart>286)throw new Error('نطاق أو قارئ غير معتمد.');
 const key=`${reciterId}:${range.surah}:${range.ayahStart}-${range.ayahEnd}`;
 const pack:SessionPack={key,reciterId,range,urls:[],completed:0,total:range.ayahEnd-range.ayahStart+1,bytes:0,status:'partial',updatedAt:new Date().toISOString()};
 const cache=await caches.open(AUDIO);save(pack);
 try{for(let a=range.ayahStart;a<=range.ayahEnd;a++){if(signal.aborted)throw new DOMException('أوقف التنزيل','AbortError');const url=await resolveVerseAudioUrl(reciterId,range.surah,a,signal);if(!url)throw new Error('صوت آية غير متاح؛ لم نتجاوزها.');let response=await cache.match(url);if(!response||!response.ok){response=await fetch(url,{signal});if(!response.ok)throw new Error('تعذر تنزيل الصوت.');const blob=await response.blob();if(blob.size<129)throw new Error('ملف الصوت غير مكتمل.');response=new Response(blob,{headers:{'Content-Type':blob.type||'audio/mpeg'}});await cache.put(url,response.clone());}const bytes=(await response.blob()).size;pack.urls.push(url);pack.completed++;pack.bytes+=bytes;save(pack);onProgress({...pack});}
 pack.status='ready';save(pack);onProgress({...pack});return pack;
 }catch(e){pack.status=signal.aborted?'partial':'error';pack.error=signal.aborted?'تنزيل جزئي؛ اضغط لاستئنافه.':e instanceof Error?e.message:'تعذر التخزين أو التنزيل.';save(pack);onProgress({...pack});return pack;}
}
export async function inspectSessionPack(pack:SessionPack):Promise<boolean>{try{if(!packSchema.safeParse(pack).success||pack.urls.length!==pack.total)return false;const cache=await caches.open(AUDIO);for(const url of pack.urls){const r=await cache.match(url);if(!r?.ok)return false;}return pack.completed===pack.total;}catch{return false;}}
export async function deleteSessionPack(key:string):Promise<void>{
 const packs=sessionPacks(),pack=packs.find(p=>p.key===key);if(!pack)return;const others=packs.filter(p=>p.key!==key),shared=new Set(others.flatMap(p=>p.urls));const cache=await caches.open(AUDIO);for(const url of pack.urls)if(!shared.has(url))await cache.delete(url);localStorage.setItem(SESSION_PACK_KEY,JSON.stringify(others));
}
