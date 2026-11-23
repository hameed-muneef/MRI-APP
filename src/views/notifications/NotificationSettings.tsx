// بوابة أقسام التنبيهات: تصدير موجّهات التنقل الداخلي وعرض حالة الإذن وأقسام التنبيهات.

import {useEffect, useRef, useState} from 'react';
import {AlarmClock, Bell, BellRing, CheckCircle2, Clock3, MoonStar, Volume2} from 'lucide-react';
import {ensureSystemNotificationPermission, getBrowserPermission, isBrowserNotificationSupported, requestBrowserPermission} from '../../notifications/delivery';
import {checkPermissions as checkNativePermissions} from '../../notifications/native-prayer-scheduler';
import {openAppSettings} from '../../lib/settings-opener';
import type {TaskScheduleContext} from '../../notifications/task-planner';
import GeneralNotifications from './GeneralNotifications';
import PrayerNotifications from './PrayerNotifications';
import RemindersPanel from './RemindersPanel';
import SoundPanel from './SoundPanel';
import TaskNotificationsPanel from './TaskNotificationsPanel';
import type {PrayerLocation} from '../../prayer-location';
import {isNativePlatform} from '../../notifications/native-prayer-scheduler';

const PERMISSION_TEXT: Record<string, string> = {
  granted: 'مسموح: ستصلك تنبيهات الجهاز ما دام التطبيق أو المتصفح يعمل.',
  denied: 'محظور من المتصفح: لتصلك الإشعارات خارج التطبيق، فعّل الإذن من إعدادات الموقع ثم أعد التحميل.',
  default: 'لم يُمنح إذن الإشعارات بعد. اضغط الزر أدناه لتفعيل تنبيهات الجهاز.',
};

export function PermissionStatus() {
  const nativeApp = isNativePlatform();
  const [permission, setPermission] = useState<NotificationPermission | null>(() => getBrowserPermission());
  const [nativeDisplay, setNativeDisplay] = useState<string>('prompt');
  useEffect(() => {
    setPermission(getBrowserPermission());
  }, []);
  useEffect(() => {
    if (!nativeApp) return;
    let active = true;
    void checkNativePermissions().then((p) => {
      if (active) setNativeDisplay(p.display);
    });
    return () => {
      active = false;
    };
  }, [nativeApp]);

  if (nativeApp) {
    if (nativeDisplay === 'granted') {
      return (
        <div className="task-push-permission-bar perm-granted">
          <div>
            <strong>تنبيهات النظام:</strong>{' '}
            <span>الإشعارات والمنبهات تعمل مباشرة عبر نظام الهاتف، حتى والتطبيق مغلق.</span>
          </div>
          <span className="task-push-ok"><CheckCircle2 size={15}/> نشط</span>
        </div>
      );
    }
    return (
      <div className="task-push-permission-bar perm-denied">
        <div>
          <strong>تنبيهات النظام:</strong>{' '}
          <span role="status">إذن الإشعارات غير مفعّل على الهاتف؛ لن تصل المنبهات والتذكيرات والتطبيق مغلق حتى تفعيله.</span>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => void ensureSystemNotificationPermission().then((result) => {
            setNativeDisplay(result);
            if (result !== 'granted') void openAppSettings();
          })}
        >
          <BellRing size={15}/> تفعيل إشعارات الهاتف
        </button>
      </div>
    );
  }
  if (!isBrowserNotificationSupported()) {
    return (
      <div className="task-push-permission-bar">
        <div>
          <strong>حالة الإشعارات:</strong>{' '}
          <span>هذا المتصفح لا يدعم إشعارات النظام؛ ستظهر التنبيهات داخل التطبيق أثناء فتحه.</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`task-push-permission-bar perm-${permission ?? 'default'}`}>
      <div>
        <strong>إذن تنبيهات المتصفح:</strong>{' '}
        <span role="status">{PERMISSION_TEXT[permission ?? 'default']}</span>
      </div>
      {permission !== 'granted' && permission !== 'denied' && (
        <button
          type="button"
          className="primary"
          onClick={() => void requestBrowserPermission().then(setPermission)}
        >
          <BellRing size={15}/> تفعيل الإشعارات
        </button>
      )}
      {permission === 'granted' && (
        <span className="task-push-ok"><CheckCircle2 size={15}/> الإذن ممنوح</span>
      )}
    </div>
  );
}

export const OPEN_SECTION_KEY = 'rabbani-open-notif-section';
export const OPEN_SECTION_EVENT = 'rabbani:open-notif-section';
export type OpenSection = 'prayer' | 'reminders' | 'tasks';

export function requestNotificationSection(section: OpenSection): void {
  try {
    sessionStorage.setItem(OPEN_SECTION_KEY, section);
  } catch {/* تجاهل */}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, {detail: section}));
  }
}

export function consumeOpenSection(): OpenSection | null {
  try {
    const value = sessionStorage.getItem(OPEN_SECTION_KEY) as OpenSection | null;
    if (value) sessionStorage.removeItem(OPEN_SECTION_KEY);
    return value;
  } catch {
    return null;
  }
}

type Props = {
  notify: (message: string) => void;
  goals?: {id: string; title: string}[];
  prayerLocation?: PrayerLocation;
  onPrayerLocation?: (location?: PrayerLocation) => void;
  taskContext?: TaskScheduleContext;
  mode?: 'alarms' | 'adhan' | 'quiet';
  focusTarget?: OpenSection | null;
  extraAdhanContent?: React.ReactNode;
  extraToneContent?: React.ReactNode;
};

export default function NotificationSettings({
  notify,
  goals,
  prayerLocation,
  onPrayerLocation,
  taskContext,
  mode,
  focusTarget,
  extraAdhanContent,
  extraToneContent,
}: Props) {
  const tasksRef = useRef<HTMLElement | null>(null);
  const [alarmsSubTab, setAlarmsSubTab] = useState<'reminders' | 'tasks'>(() =>
    focusTarget === 'tasks' ? 'tasks' : 'reminders',
  );

  useEffect(() => {
    if (focusTarget === 'tasks') {
      setAlarmsSubTab('tasks');
      tasksRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    } else if (focusTarget === 'reminders') {
      setAlarmsSubTab('reminders');
    }
  }, [focusTarget]);

  if (mode === 'alarms') {
    return (
      <div className="settings-section-stack">
        <div className="notif-subtabs" role="tablist" aria-label="أقسام المنبهات والتذكيرات">
          <button
            type="button"
            role="tab"
            aria-selected={alarmsSubTab === 'reminders'}
            className={alarmsSubTab === 'reminders' ? 'active' : ''}
            onClick={() => setAlarmsSubTab('reminders')}
          >
            <AlarmClock size={16}/> منبهاتي الشخصية
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={alarmsSubTab === 'tasks'}
            className={alarmsSubTab === 'tasks' ? 'active' : ''}
            onClick={() => setAlarmsSubTab('tasks')}
          >
            <Clock3 size={16}/> تذكيرات المهام المجدولة
          </button>
        </div>

        {alarmsSubTab === 'reminders' ? (
          <section className="panel notif-settings" aria-label="المنبهات الشخصية">
            <RemindersPanel notify={notify} goals={goals}/>
          </section>
        ) : (
          <section ref={tasksRef} className="panel notif-settings" aria-label="تذكيرات المهام اليومية المجدولة">
            <h3><Clock3 size={18}/> تذكيرات المهام اليومية المجدولة</h3>
            <TaskNotificationsPanel notify={notify} taskContext={taskContext}/>
          </section>
        )}
      </div>
    );
  }

  if (mode === 'adhan') {
    return (
      <div className="settings-section-stack">
        <section className="panel notif-settings" aria-label="أوقات الصلاة والأذان">
          <h3><Bell size={18}/> أوقات الصلاة والأذان</h3>
          <PrayerNotifications
            notify={notify}
            prayerLocation={prayerLocation}
            onPrayerLocation={onPrayerLocation}
          />
        </section>
        {extraAdhanContent}
      </div>
    );
  }

  if (mode === 'quiet') {
    return (
      <div className="settings-section-stack">
        <section className="panel notif-settings" aria-label="الإعدادات العامة وساعات الهدوء">
          <h3><MoonStar size={18}/> الإعدادات العامة وساعات الهدوء</h3>
          <PermissionStatus/>
          <GeneralNotifications notify={notify}/>
        </section>
        {extraToneContent}
        <section className="panel notif-settings" aria-label="مكتبة الأصوات والنغمات">
          <h3><Volume2 size={18}/> مكتبة النغمات والأصوات</h3>
          <SoundPanel notify={notify}/>
        </section>
      </div>
    );
  }

  return (
    <section className="panel notif-settings" aria-labelledby="notif-settings-title">
      <h3 id="notif-settings-title"><Bell size={18}/> الإشعارات والتنبيهات</h3>
      <PermissionStatus/>
      <RemindersPanel notify={notify} goals={goals}/>
    </section>
  );
}
