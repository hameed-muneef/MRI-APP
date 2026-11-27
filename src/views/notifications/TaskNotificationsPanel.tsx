// إعدادات تنبيهات الدفع (Push Notifications) للمهام اليومية المجدولة في قائمة المهام.
// تتيح للمستخدم التحكم في التفعيل، وقت التذكير المسبق، القناة، الصوت، واختبار الإشعار.

import {useEffect, useMemo, useState} from 'react';
import {BellRing, CheckCircle2, Clock3, Send} from 'lucide-react';
import {
  deliverNotification,
  getBrowserPermission,
  isBrowserNotificationSupported,
  requestBrowserPermission,
} from '../../notifications/delivery';
import {playAudio, stopAudio, unlockAudioPlayback} from '../../notifications/audio';
import {playBuiltInTone} from '../../notifications/builtin-sounds';
import {NOTIFICATIONS_CHANGED_EVENT, isNativePlatform, notifyNativePrefsChanged} from '../../notifications/native-prayer-scheduler';
import {loadPrefs, savePrefs} from '../../notifications/prefs-store';
import {listAudioResources} from '../../notifications/service';
import {soundPlanForTask} from '../../notifications/sound-selection';
import {upcomingTaskAlerts, type TaskScheduleContext} from '../../notifications/task-planner';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  getTaskNotificationSettings,
  type AudioResource,
  type NotificationChannel,
  type NotificationPreference,
  type TaskNotificationSettings,
} from '../../notifications/types';
import {channelDescription, channelLabel, SoundSelectField} from './SoundPanel';

const LEAD_PRESETS = [
  {minutes: 0, label: 'عند الموعد فقط'},
  {minutes: 5, label: 'قبل 5 د'},
  {minutes: 10, label: 'قبل 10 د'},
  {minutes: 15, label: 'قبل 15 د'},
  {minutes: 30, label: 'قبل 30 د'},
  {minutes: 60, label: 'قبل ساعة'},
];

const timeFmt = new Intl.DateTimeFormat('ar-EG', {hour: 'numeric', minute: '2-digit'});
const dayFmt = new Intl.DateTimeFormat('ar-EG', {weekday: 'short', day: 'numeric', month: 'short'});

type Props = {
  notify: (message: string) => void;
  taskContext?: TaskScheduleContext;
};

export default function TaskNotificationsPanel({notify, taskContext}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [library, setLibrary] = useState<AudioResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(() => getBrowserPermission());

  useEffect(() => {
    let active = true;
    const sync = () => {
      setPermission(getBrowserPermission());
      void loadPrefs().then(({prefs: loaded}) => {
        if (!active) return;
        setPrefs(loaded);
        setLoading(false);
      });
    };
    sync();
    void listAudioResources().then(rows => {
      if (active) setLibrary(rows);
    }).catch(() => { /* محلي فقط */ });
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    };
  }, []);

  const taskSettings = getTaskNotificationSettings(prefs);

  const updateTaskSettings = (patch: Partial<TaskNotificationSettings>) => {
    setPrefs(old => {
      const current = getTaskNotificationSettings(old);
      return {
        ...old,
        reminder_settings: {
          ...old.reminder_settings,
          task_notifications: {
            ...current,
            ...patch,
          },
        },
      };
    });
    setDirty(true);
  };

  const handleRequestPermission = async () => {
    const next = await requestBrowserPermission();
    setPermission(next);
    if (next === 'granted') {
      notify('تم تفعيل إشعارات المتصفح للمهام المجدولة');
    } else if (next === 'denied') {
      notify('تم حظر إشعارات المتصفح؛ يمكنك السماح بها من إعدادات الموقع');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const {prefs: fresh} = await loadPrefs();
      const nextTaskSettings = getTaskNotificationSettings(prefs);
      const merged: NotificationPreference = {
        ...fresh,
        categories: {
          ...fresh.categories,
          task: true,
        },
        reminder_settings: {
          ...fresh.reminder_settings,
          task_notifications: nextTaskSettings,
        },
      };
      const result = await savePrefs(merged);
      setPrefs(merged);
      notifyNativePrefsChanged();
      setDirty(false);
      notify(result.source === 'cloud' ? 'حُفظت إعدادات تنبيهات المهام في حسابك' : 'حُفظت إعدادات تنبيهات المهام على هذا الجهاز');
    } finally {
      setSaving(false);
    }
  };

  const sendTestNotification = async () => {
    unlockAudioPlayback();
    const plan = soundPlanForTask(taskSettings.sound_id, prefs, library);
    stopAudio();
    if (plan.mode === 'tone') playBuiltInTone(plan.id);
    else if (plan.mode === 'file') playAudio(plan.url, () => playBuiltInTone('builtin:soft'));

    const leadText = taskSettings.remind_before_minutes > 0
      ? `متبقي ${taskSettings.remind_before_minutes} دقيقة على موعد المهمة المجدولة`
      : 'حان وقت المهمة المجدولة';

    if (isNativePlatform()) {
      await deliverNotification('task', 'تنبيه تجريبي · مهمة مجدولة', leadText, 'tasks', taskSettings.sound_id);
      notify('أُرسل إشعار تجريبي على الجهاز');
      return;
    }

    let currentPerm = getBrowserPermission();
    if (isBrowserNotificationSupported() && currentPerm === 'default') {
      currentPerm = await requestBrowserPermission();
      setPermission(currentPerm);
    }

    await deliverNotification('task', 'تنبيه تجريبي · مهمة مجدولة', leadText, 'tasks', taskSettings.sound_id);
    if (isBrowserNotificationSupported() && currentPerm === 'granted') {
      notify('أُرسل إشعار تجريبي');
    } else if (currentPerm === 'denied') {
      notify('شُغِّل الصوت داخل التطبيق فقط لأن إشعارات المتصفح محظورة');
    } else {
      notify(`تنبيه تجريبي: ${leadText}`);
    }
  };

  const upcoming = useMemo(() => {
    if (!taskContext) return [];
    return upcomingTaskAlerts(taskContext, prefs, new Date(), 6);
  }, [taskContext, prefs]);

  if (loading) return <p className="muted" role="status">جارٍ تحميل إعدادات تنبيهات المهام…</p>;

  const nativeApp = isNativePlatform();
  const browserSupported = !nativeApp && isBrowserNotificationSupported();
  const globalPaused = !prefs.global_enabled || prefs.dnd_enabled;

  return (
    <div className="notif-task-panel">
      {nativeApp ? (
        <div className="task-push-permission-bar perm-granted">
          <div>
            <strong>تنبيهات الجهاز:</strong>{' '}
            <span>تعمل التذكيرات عبر إشعارات النظام على جهازك.</span>
          </div>
          <span className="task-push-ok"><CheckCircle2 size={15}/> جاهزة</span>
        </div>
      ) : browserSupported ? (
        <div className={`task-push-permission-bar perm-${permission ?? 'default'}`}>
          <div>
            <strong>حالة إشعارات المتصفح:</strong>{' '}
            <span>
              {permission === 'granted'
                ? 'مفعّلة — ستصلك التنبيهات على جهازك وعبر المتصفح.'
                : permission === 'denied'
                  ? 'محظورة من المتصفح — ستظهر داخل التطبيق فقط حتى تفعّل الإذن من إعدادات الموقع (رمز القفل بجانب الرابط).'
                  : 'لم يُمنح الإذن بعد — فعّل الإذن لتصلك التنبيهات خارج التطبيق أيضًا.'}
            </span>
          </div>
          {permission === 'default' && (
            <button type="button" className="primary" onClick={() => void handleRequestPermission()}>
              <BellRing size={15}/> تفعيل إشعارات المتصفح
            </button>
          )}
          {permission === 'granted' && (
            <span className="task-push-ok"><CheckCircle2 size={15}/> الإذن ممنوح</span>
          )}
        </div>
      ) : (
        <p className="muted small">المتصفح الحالي لا يدعم إشعارات النظام؛ ستظهر التنبيهات داخل التطبيق أثناء فتحه.</p>
      )}

      {globalPaused && (
        <p className="notif-error" role="status">
          تنبيه: تذكيرات المهام متوقفة حاليًا من الإعدادات العامة (الإيقاف العام أو عدم الإزعاج).
        </p>
      )}

      <fieldset>
        <div className="task-lead-presets" role="group" aria-label="اختيارات سريعة لوقت التذكير المسبق">
          <span className="muted small">التذكير قبل الموعد بـ:</span>
          <div className="task-preset-chips">
            {LEAD_PRESETS.map(preset => (
              <button
                key={preset.minutes}
                type="button"
                className={taskSettings.remind_before_minutes === preset.minutes ? 'primary' : 'soft-btn'}
                aria-pressed={taskSettings.remind_before_minutes === preset.minutes}
                onClick={() => updateTaskSettings({remind_before_minutes: preset.minutes})}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <label>
            دقائق التذكير المسبق (0 = عند الموعد فقط)
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={180}
              value={taskSettings.remind_before_minutes}
              onChange={event => {
                const parsed = Math.round(Number(event.target.value));
                updateTaskSettings({
                  remind_before_minutes: Number.isFinite(parsed) ? Math.max(0, Math.min(180, parsed)) : 0,
                });
              }}
            />
          </label>
          <label>
            طريقة وصول التنبيه
            <select
              value={taskSettings.channel}
              onChange={event => updateTaskSettings({channel: event.target.value as NotificationChannel})}
            >
              {(['both', 'system'] as NotificationChannel[]).map(key => (
                <option key={key} value={key}>{channelLabel(key)}</option>
              ))}
            </select>
            <small className="task-channel-hint">{channelDescription(taskSettings.channel)}</small>
          </label>
          <label>
            صوت تنبيه المهام
            <SoundSelectField
              value={taskSettings.sound_id}
              onChange={sound => updateTaskSettings({sound_id: sound})}
            />
          </label>
        </div>

        <label className="notif-switch">
          <input
            type="checkbox"
            checked={taskSettings.notify_at_time}
            onChange={event => updateTaskSettings({notify_at_time: event.target.checked})}
          />
          <span>إرسال تذكير إضافي عند حلول وقت المهمة بالضبط</span>
        </label>
        <label className="notif-switch">
          <input
            type="checkbox"
            checked={taskSettings.include_initial}
            onChange={event => updateTaskSettings({include_initial: event.target.checked})}
          />
          <span>تذكير المهام ذات الموعد المبدئي أيضًا (قبل تأكيدها)</span>
        </label>
        <label className="notif-switch">
          <input
            type="checkbox"
            checked={taskSettings.include_day_plan}
            onChange={event => updateTaskSettings({include_day_plan: event.target.checked})}
          />
          <span>تذكير الأنشطة المؤكدة في خطة «يومي مع الله»</span>
        </label>
      </fieldset>

      <div className="notif-form-actions">
        <button type="button" className="primary" disabled={saving || !dirty} onClick={() => void save()}>
          {saving ? 'جارٍ الحفظ…' : dirty ? 'حفظ التغييرات' : 'تم الحفظ'}
        </button>
        <button type="button" className="soft-btn" onClick={() => void sendTestNotification()}>
          <Send size={15}/> إرسال تنبيه تجريبي
        </button>
      </div>

      {taskContext && (
        <div className="task-upcoming-alerts">
          <h4><Clock3 size={15}/> التنبيهات القادمة للمهام المجدولة</h4>
          {upcoming.length === 0 ? (
            <p className="muted small">لا توجد تنبيهات مهام مجدولة قادمة حاليًا. جدوِل مهمة من «مركز المهام» لتظهر هنا.</p>
          ) : (
            <ul className="task-alert-preview-list">
              {upcoming.map(event => (
                <li key={event.key}>
                  <div>
                    <strong>{event.taskTitle}</strong>
                    <small>{event.kind === 'before' ? `تذكير قبل الموعد بـ ${event.beforeMinutes} د` : 'عند حلول الموعد'}</small>
                  </div>
                  <span className="task-alert-time">{dayFmt.format(event.at)} · {timeFmt.format(event.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
