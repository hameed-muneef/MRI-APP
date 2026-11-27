// الإعدادات العامة للإشعارات: التفعيل العام، عدم الإزعاج، ساعات الهدوء، الفئات، والقناة والصوت الافتراضيان.

import {useEffect, useState} from 'react';
import {Send} from 'lucide-react';
import {loadPrefs, savePrefs} from '../../notifications/prefs-store';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationChannel, type NotificationPreference} from '../../notifications/types';
import {channelLabel, SoundSelectField} from './SoundPanel';
import {NOTIFICATIONS_CHANGED_EVENT, isNativePlatform, notifyNativePrefsChanged} from '../../notifications/native-prayer-scheduler';
import {
  deliverNotification,
  ensureSystemNotificationPermission,
  getBrowserPermission,
  isBrowserNotificationSupported,
  requestBrowserPermission,
} from '../../notifications/delivery';
import {playAudio, stopAudio, unlockAudioPlayback} from '../../notifications/audio';
import {playBuiltInTone} from '../../notifications/builtin-sounds';
import {soundPlanForReminder} from '../../notifications/sound-selection';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const GENERAL_KEYS = ['global_enabled', 'dnd_enabled', 'quiet_hours', 'reminder_settings'] as const;

export default function GeneralNotifications({notify}: {notify: (message: string) => void}) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = () => {
      void loadPrefs().then(({prefs: loaded}) => {
        if (!active) return;
        setPrefs(loaded);
        setLoading(false);
      });
    };
    sync();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    };
  }, []);

  const change = (patch: Partial<NotificationPreference>) => {
    setPrefs(old => ({...old, ...patch}));
    setDirty(true);
  };

  const save = async () => {
    if (prefs.quiet_hours.enabled && (!TIME.test(prefs.quiet_hours.start) || !TIME.test(prefs.quiet_hours.end))) {
      notify('أدخل وقت بداية ونهاية صحيحين لساعات الهدوء');
      return;
    }
    setSaving(true);
    try {
      // يدمج حقول هذه اللوحة فقط في أحدث نسخة محفوظة كي لا يمحو إعدادات الصلاة
      const {prefs: fresh} = await loadPrefs();
      const merged = {...fresh};
      for (const key of GENERAL_KEYS) (merged as Record<string, unknown>)[key] = prefs[key];
      const result = await savePrefs(merged);
      if (merged.global_enabled) {
        // إذن النظام يُطلب مركزيًا من هنا أيضًا كي تصل التنبيهات على الهاتف.
        void ensureSystemNotificationPermission();
      }
      notifyNativePrefsChanged();
      setDirty(false);
      notify(result.source === 'cloud' ? 'حُفظت الإعدادات العامة في حسابك' : 'حُفظت الإعدادات العامة على هذا الجهاز');
    } finally {
      setSaving(false);
    }
  };

  const testDefaultAlert = async () => {
    unlockAudioPlayback();
    const soundId = prefs.reminder_settings?.default_sound_id;
    const plan = soundPlanForReminder(soundId, prefs, []);
    stopAudio();
    if (plan.mode === 'tone') playBuiltInTone(plan.id);
    else if (plan.mode === 'file') playAudio(plan.url, () => playBuiltInTone('builtin:soft'));

    if (!isNativePlatform() && isBrowserNotificationSupported() && getBrowserPermission() === 'default') {
      await requestBrowserPermission();
    }
    await deliverNotification(
      'reminder',
      'تنبيه تجريبي · التذكيرات العامة',
      'هكذا يظهر ويُسمع التذكير بالصوت الافتراضي المختار.',
      'settings',
      soundId,
    );
    notify(plan.mode === 'none' ? 'أُرسل التنبيه التجريبي (صامت).' : 'أُرسل التنبيه التجريبي وشُغِّل الصوت.');
  };

  if (loading) return <p className="muted" role="status">جارٍ تحميل الإعدادات…</p>;
  const quiet = prefs.quiet_hours;

  return (
    <div className="notif-general-panel">
      <label className="notif-switch">
        <input type="checkbox" checked={prefs.global_enabled} onChange={event => change({global_enabled: event.target.checked})}/>
        <span>تفعيل كل الإشعارات والمنبهات</span>
      </label>
      <fieldset disabled={!prefs.global_enabled}>
        <label className="notif-switch">
          <input type="checkbox" checked={prefs.dnd_enabled} onChange={event => change({dnd_enabled: event.target.checked})}/>
          <span>عدم الإزعاج (يكتم الأذان والتذكيرات حتى تعطّله)</span>
        </label>
        <label className="notif-switch">
          <input type="checkbox" checked={quiet.enabled} onChange={event => change({quiet_hours: {...quiet, enabled: event.target.checked}})}/>
          <span>ساعات الهدوء (لا إشعارات ولا أصوات خلالها)</span>
        </label>
        {quiet.enabled && (
          <div className="form-grid">
            <label>من<input type="time" dir="ltr" value={quiet.start} onChange={event => change({quiet_hours: {...quiet, start: event.target.value}})}/></label>
            <label>إلى<input type="time" dir="ltr" value={quiet.end} onChange={event => change({quiet_hours: {...quiet, end: event.target.value}})}/></label>
          </div>
        )}
        <details className="settings-inner-details"><summary>خيارات إضافية للتنبيهات</summary>
        <div className="form-grid">
          <label>مكان ظهور التذكير
            <select value={prefs.reminder_settings.default_channel} onChange={event => change({reminder_settings: {...prefs.reminder_settings, default_channel: event.target.value as NotificationChannel}})}>
              {(['system', 'both'] as NotificationChannel[]).map(key => <option key={key} value={key}>{channelLabel(key)}</option>)}
            </select>

          </label>
          <label>صوت التذكيرات الافتراضي
            <SoundSelectField value={prefs.reminder_settings.default_sound_id} onChange={sound => change({reminder_settings: {...prefs.reminder_settings, default_sound_id: sound}})}/>
          </label>
          <label>مدة الغفوة (دقائق)
            <input type="number" inputMode="numeric" min={1} max={120} value={prefs.reminder_settings.snooze_minutes}
              onChange={event => change({reminder_settings: {...prefs.reminder_settings, snooze_minutes: Math.max(1, Math.min(120, Math.round(Number(event.target.value)) || 10))}})}/>
          </label>
        </div></details>
      </fieldset>
      <div className="notif-form-actions">
        <button type="button" className="primary" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'جارٍ الحفظ…' : dirty ? 'حفظ التغييرات' : 'تم الحفظ'}</button>
        <button type="button" className="soft-btn" onClick={() => void testDefaultAlert()}><Send size={15}/> تجربة الصوت والتنبيه</button>
      </div>
    </div>
  );
                                                                                                         }
