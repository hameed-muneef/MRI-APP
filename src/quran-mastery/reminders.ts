import type {MasteryStateRoot} from './types';
import {revisionQueue} from './planning';
import {upcomingOccurrences} from '../notifications/scheduler';
import type {Reminder} from '../notifications/types';
/** Existing reminder only delivers while there is actually due work. No private notes/text. */
export function filterMasteryReminders(reminders:Reminder[],root:MasteryStateRoot,now=new Date()):Reminder[]{
 const due=revisionQueue(root,now).length;
 return reminders.filter(r=>r.id!=='quran-mastery-daily-review'||due>0).map(r=>r.id==='quran-mastery-daily-review'?{...r,description:`لديك ${due} مقاطع مستحقة. افتح مصحف الحفظ والإتقان للمراجعة ضمن وقتك المتاح.`}:r);
}
/** Bounded native horizon, reconciled whenever learning data or preferences change.
 * Scheduled local notifications work while closed; OS delivery is not guaranteed.
 */
export function nativeMasteryReminders(reminders:readonly Reminder[],root:MasteryStateRoot,now=new Date()):Reminder[]{
 const result=reminders.filter(r=>r.id!=='quran-mastery-daily-review');
 const source=reminders.find(r=>r.id==='quran-mastery-daily-review'&&r.enabled);if(!source)return [...result];
 const horizon=new Date(now);horizon.setDate(horizon.getDate()+30);
 const snooze=source.snooze_until?new Date(source.snooze_until):null;
 const candidates=upcomingOccurrences(source,now,31).filter(at=>!snooze||at>snooze);
 if(snooze&&snooze>now)candidates.unshift(snooze);
 for(const at of candidates){if(at<=now||at>=horizon)continue;const due=revisionQueue(root,at);if(!due.length)continue;result.push({...source,id:`quran-mastery-due-${at.toISOString()}`,recurrence:'none',snooze_until:undefined,scheduled_at:at.toISOString(),description:'لديك مراجعات مجدولة بحسب آخر بيانات هذا الجهاز. افتح قائمة المراجعة للاطلاع على الحالة الحالية.'});}
 return result;
}
