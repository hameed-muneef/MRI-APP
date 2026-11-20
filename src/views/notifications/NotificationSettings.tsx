// صفحة «الإشعارات والتنبيهات»: تجمع أوقات الصلاة والمنبهات الشخصية ومكتبة الأصوات وحالة الإذن.

import {useEffect, useRef, useState} from 'react';
import {Bell} from 'lucide-react';
import {getBrowserPermission, isBrowserNotificationSupported, requestBrowserPermission} from '../../notifications/delivery';
import type {TaskScheduleContext} from '../../notifications/task-planner';
import GeneralNotifications from './GeneralNotifications';
import PrayerNotifications from './PrayerNotifications';
import RemindersPanel from './RemindersPanel';
import SoundPanel from './SoundPanel';
import TaskNotificationsPanel from './TaskNotificationsPanel';
import type {PrayerLocation} from '../../prayer-location';

const PERMISSION_TEXT: Record<string, string> = {
  granted: 'مسموح: تصلك إشعارات الدفع ما دام المتصفح أو التطبيق يعمل.',
  denied: 'محظور: فعّل الإشعارات لهذا الموقع من إعدادات المتصفح (رمز القفل بجوار العنوان) ثم أعد تحميل الصفحة.',
  default: 'لم يُطلب الإذن بعد. اضغط الزر أدناه لتفعيل إشعارات الدفع.',
};

function PermissionStatus() {
  const [permission, setPermission] = useState<NotificationPermission | null>(() => getBrowserPermission());
  useEffect(() => {
    setPermission(getBrowserPermission());
  }, []);
  if (!isBrowserNotificationSupported()) return <p className="muted">هذا المتصفح لا يدعم إشعارات الدفع النظامية؛ ستظهر التنبيهات داخل المنصة فقط.</p>;
  return (
    <div>
      <p role="status">{PERMISSION_TEXT[permission ?? 'default']}</p>
      {permission !== 'granted' && permission !== 'denied' && (
        <button type="button" className="primary" onClick={() => void requestBrowserPermission().then(setPermission)}>تفعيل إشعارات الدفع</button>
      )}
      <p className="muted small">المتصفحات لا تضمن التنبيه في الخلفية أو والصفحة مغلقة؛ يصبح ذلك ممكنًا بدقة أعلى عند تثبيت التطبيق أو في تطبيق الجوال.</p>
    </div>
  );
}

type Props = {
  notify: (message: string) => void;
  goals?: {id: string; title: string}[];
  prayerLocation?: PrayerLocation;
  onPrayerLocation?: (location?: PrayerLocation) => void;
  taskContext?: TaskScheduleContext;
};

// وجهات داخلية: بطاقات لوحة اليوم أو مركز المهام تضع المفتاح قبل التنقل إلى الإعدادات.
export const OPEN_SECTION_KEY = 'rabbani-open-notif-section';
type OpenSection = 'prayer' | 'reminders' | 'tasks';
export function requestNotificationSection(section: OpenSection): void {
  try {sessionStorage.setItem(OPEN_SECTION_KEY, section)} catch {/* تجاهل */}
}
function consumeOpenSection(): OpenSection | null {
  try {
    const value = sessionStorage.getItem(OPEN_SECTION_KEY) as OpenSection | null;
    if (value) sessionStorage.removeItem(OPEN_SECTION_KEY);
    return value;
  } catch {return null}
}

export default function NotificationSettings({notify, goals, prayerLocation, onPrayerLocation, taskContext}: Props) {
  const target = useState(consumeOpenSection)[0];
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {if (target) ref.current?.scrollIntoView({behavior: 'smooth', block: 'start'})}, [target]);
  return (
    <section ref={ref} className="panel notif-settings" aria-labelledby="notif-settings-title">
      <h3 id="notif-settings-title"><Bell size={18}/> الإشعارات والتنبيهات</h3>
      <details open={target ? undefined : true}><summary>أذونات المتصفح وإشعارات الدفع</summary><PermissionStatus/></details>
      <details><summary>الإعدادات العامة وعدم الإزعاج</summary><GeneralNotifications notify={notify}/></details>
      <details open={target === 'tasks' || undefined}><summary>تنبيهات المهام اليومية المجدولة (Push)</summary><TaskNotificationsPanel notify={notify} taskContext={taskContext}/></details>
      <details open={target === 'prayer' || undefined}><summary>أوقات الصلاة والأذان</summary><PrayerNotifications notify={notify} prayerLocation={prayerLocation} onPrayerLocation={onPrayerLocation}/></details>
      <details open={target === 'reminders' || undefined}><summary>المنبهات الشخصية</summary><RemindersPanel notify={notify} goals={goals}/></details>
      <details><summary>مكتبة الأصوات</summary><SoundPanel notify={notify}/></details>
    </section>
  );
}
