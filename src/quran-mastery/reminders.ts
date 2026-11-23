import type {MasteryStateRoot} from './types';
import {revisionQueue} from './planning';
import type {Reminder} from '../notifications/types';
/** Existing reminder only delivers while there is actually due work. No private notes/text. */
export function filterMasteryReminders(reminders:Reminder[],root:MasteryStateRoot,now=new Date()):Reminder[]{
 const due=revisionQueue(root,now).length;
 return reminders.filter(r=>r.id!=='quran-mastery-daily-review'||due>0).map(r=>r.id==='quran-mastery-daily-review'?{...r,description:`لديك ${due} مقاطع مستحقة. افتح مصحف الحفظ والإتقان للمراجعة ضمن وقتك المتاح.`}:r);
}
