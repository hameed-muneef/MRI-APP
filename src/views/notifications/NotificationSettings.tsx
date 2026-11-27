// بوابة أقسام التنبيهات: تصدير موجّهات التنقل الداخلي وعرض حالة الإذن وأقسام التنبيهات.

import {useEffect, useState, useRef} from 'react';
import {AlarmClock, Bell, BellRing, CheckCircle2, Clock3, MoonStar} from 'lucide-react';
import {
  ensureSystemNotificationPermission,
  getBrowserPermission,
  isBrowserNotificationSupported,
  requestBrowserPermission,
} from '../../notifications/delivery';
import {unlockAudioPlayback} from '../../notifications/audio';
import {checkPermissions as checkNativePermissions, isNativePlatform} from '../../notifications/native-prayer-scheduler';
import {openAppSettings} from '../../lib/settings-opener';
import type {TaskScheduleContext} from '../../notifications/task-planner';
import GeneralNotifications from './GeneralNotifications';
import PrayerNotifications from './PrayerNotifications';
import RemindersPanel from './RemindersPanel';
import TaskNotificationsPanel from './TaskNotificationsPanel';
import type {PrayerLocation} from '../../prayer-location';

export function PermissionStatus() {
  const nativeApp = isNativePlatform();
  const [nativeDisplay, setNativeDisplay] = useState<string>('prompt');
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | null>(() => getBrowserPermission());
  // سبب عدم اكتمال التفعيل: يظهر بدل أن يبدو الزر بلا أثر.
  const [enableNote, setEnableNote] = useState('');
  const browserSupported = !nativeApp && isBrowserNotificationSupported();

  useEffect(() => {
    if (!nativeApp) {
      setBrowserPerm(getBrowserPermission());
      return;
    }
    let active = true;
    void checkNativePermissions().then((p) => {
      if (active) setNativeDisplay(p.display);
    });
    return () => {
      active = false;
    };
  }, [nativeApp]);

  if (!nativeApp) {
    if (!browserSupported) {
      return (
        <div className="task-push-permission-bar perm-default">
          <div>
            <strong>تنبيهات المتصفح:</strong>{' '}
            <span>المتصفح الحالي لا يدعم إشعارات النظام؛ ستظهر التنبيهات والأصوات داخل التطبيق أثناء فتحه.</span>
          </div>
        </div>
      );
    }
    if (browserPerm === 'granted') {
      return (
        <div className="task-push-permission-bar perm-granted">
          <div>
            <strong>إشعارات المتصفح:</strong>{' '}
            <span>مفعّلة — ستصلك التنبيهات والأصوات عبر المتصفح وداخل التطبيق.</span>
          </div>
          <span className="task-push-ok"><CheckCircle2 size={15}/> نشط</span>
        </div>
      );
    }
    if (browserPerm === 'denied') {
      return (
        <div className="task-push-permission-bar perm-denied">
          <div>
            <strong>إشعارات المتصفح:</strong>{' '}
            <span role="status">محظورة في المتصفح؛ فعّل الإذن من إعدادات الموقع (رمز القفل بجانب الرابط) لتصلك خارج التطبيق.</span>
          </div>
        </div>
      );
    }
    return (
      <div className="task-push-permission-bar perm-default">
        <div>
          <strong>إشعارات المتصفح:</strong>{' '}
          <span role="status">الإذن غير مفعّل بعد — فعّله لتصلك التنبيهات والأذان خارج التطبيق أيضًا.</span>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            unlockAudioPlayback();
            setEnableNote('');
            void requestBrowserPermission().then((next) => {
              setBrowserPerm(next);
              if (next !== 'granted') {
                setEnableNote('لم يمنح المتصفح الإذن. افتح إعدادات الموقع من رمز القفل بجانب العنوان، وفعّل الإشعارات.');
              }
            });
          }}
        >
          <BellRing size={15}/> تفعيل إشعارات المتصفح
        </button>
        {enableNote&&<p className="small notif-enable-note" role="status">{enableNote}</p>}
      </div>
    );
  }

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
        onClick={() => void (async () => {
          setEnableNote('');
          const result = await ensureSystemNotificationPermission({force: true});
          setNativeDisplay(result);
          if (result === 'granted') return;
          const opened = await openAppSettings();
          if (!opened.opened) {
            setEnableNote('لم يُفتح إعدادات الهاتف من التطبيق. افتح إعدادات الجهاز ثم التطبيقات ثم الربانيون ثم الإشعارات وفعّلها.');
          }
        })()}
      >
        <BellRing size={15}/> تفعيل إشعارات الهاتف
      </button>
      {enableNote&&<p className="small notif-enable-note" role="status">{enableNote}</p>}
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
