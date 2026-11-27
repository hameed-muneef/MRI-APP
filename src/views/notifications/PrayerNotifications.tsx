// إعداد إشعارات الصلاة لكل صلاة على حدة: التفعيل، نوع الأذان، القناة، الصوت، التذكير قبل/بعد، والتعديل اليدوي.

import {useEffect, useState} from 'react';
import {BellRing, Check, CheckCircle2, ChevronDown, ChevronUp, RotateCcw, Send, Square} from 'lucide-react';
import {loadPrefs, savePrefs} from '../../notifications/prefs-store';
import {clampAdjustment, MAX_PRAYER_ADJUSTMENT} from '../../notifications/prayer-planner';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  DEFAULT_PRAYER_PREFERENCES,
  PRAYER_ADHAN_LABELS,
  PRAYER_NAMES,
  type NotificationChannel,
  type NotificationPreference,
  type PrayerAdhanType,
  type PrayerName,
} from '../../notifications/types';
import {channelLabel, SoundSelectField} from './SoundPanel';
import PrayerLocationPicker from '../../PrayerLocationPicker';
import {sanitizePrayerLocation, type PrayerLocation} from '../../prayer-location';
import NativeAdhanPanel from './NativeAdhanPanel';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  isNativePlatform,
  notifyNativePrefsChanged,
} from '../../notifications/native-prayer-scheduler';
import {resolveSchedulingLocation} from '../../notifications/scheduling-location';
import {
  deliverNotification,
  getBrowserPermission,
  isBrowserNotificationSupported,
  requestBrowserPermission,
} from '../../notifications/delivery';
import {playAudio, stopAudio, unlockAudioPlayback} from '../../notifications/audio';
import {playBuiltInTone} from '../../notifications/builtin-sounds';
import {getSelectedDefaultAdhanId, resolvePrayerAdhan} from '../../sounds/adhan-catalog';
import {getNativeBackgroundAudioPlugin} from '../../audio/native-bridge';
import {stopNativeAdhan} from '../../lib/settings-opener';

type PrayerSetting = NotificationPreference['prayer_settings'][PrayerName];

const MAX_REMINDER_MINUTES = 120;

function boundedMinutes(value: string, max: number): number {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
}

function summarizePrayer(setting: PrayerSetting): string {
  if (!setting.enabled) return 'متوقف';
  const parts: string[] = [PRAYER_ADHAN_LABELS[setting.adhan_type]];
  if ((setting.remind_before_minutes ?? 0) > 0) parts.push(`قبل ${setting.remind_before_minutes} د`);
  if ((setting.remind_after_minutes ?? 0) > 0) parts.push(`بعد ${setting.remind_after_minutes} د`);
  if ((setting.adjust_minutes ?? 0) !== 0) {
    const adj = setting.adjust_minutes ?? 0;
    parts.push(`تعديل ${adj > 0 ? `+${adj}` : adj} د`);
  }
  return parts.join(' · ');
}

type Props = {notify: (message: string) => void; prayerLocation?: PrayerLocation; onPrayerLocation?: (location?: PrayerLocation) => void};

export default function PrayerNotifications({notify, prayerLocation, onPrayerLocation}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [loading, setLoading] = useState(true);
  const [savingPrayer, setSavingPrayer] = useState<PrayerName | null>(null);
  const [expandedPrayer, setExpandedPrayer] = useState<PrayerName | null>(null);
  // الحفظ لكل صلاة على حدة: تعديل صلاة لا يلمس إعدادات باقي الصلوات.
  const [dirtyPrayers, setDirtyPrayers] = useState<ReadonlySet<PrayerName>>(new Set());
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | null>(() => getBrowserPermission());
  const [testingAdhan, setTestingAdhan] = useState(false);

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

  const update = (prayer: PrayerName, patch: Partial<PrayerSetting>) => {
    setPrefs(old => ({
      ...old,
      prayer_settings: {
        ...old.prayer_settings,
        [prayer]: {...DEFAULT_PRAYER_PREFERENCES[prayer], ...old.prayer_settings[prayer], ...patch},
      },
    }));
    setDirtyPrayers(old => new Set(old).add(prayer));
  };

  // يحفظ إعدادات صلاة واحدة فقط مدمجًا معها أحدث نسخة محفوظة لباقي الإعدادات.
  const savePrayer = async (prayer: PrayerName) => {
    setSavingPrayer(prayer);
    try {
      const setting: PrayerSetting = {...DEFAULT_PRAYER_PREFERENCES[prayer], ...prefs.prayer_settings[prayer]};
      const {prefs: fresh} = await loadPrefs();
      const result = await savePrefs({...fresh, prayer_settings: {...fresh.prayer_settings, [prayer]: setting}});
      notifyNativePrefsChanged();
      setDirtyPrayers(old => {
        const next = new Set(old);
        next.delete(prayer);
        return next;
      });
      notify(result.source === 'cloud' ? `حُفظت إعدادات صلاة ${prayer} في حسابك` : `حُفظت إعدادات صلاة ${prayer} على هذا الجهاز`);
    } finally {
      setSavingPrayer(null);
    }
  };

  const restorePrayer = (prayer: PrayerName) => {
    setPrefs(old => ({...old, prayer_settings: {...old.prayer_settings, [prayer]: {...DEFAULT_PRAYER_PREFERENCES[prayer]}}}));
    setDirtyPrayers(old => new Set(old).add(prayer));
  };

  const stopTestAdhan = async () => {
    stopAudio();
    setTestingAdhan(false);
    if (isNativePlatform()) {
      await stopNativeAdhan();
    }
    notify('تم إيقاف صوت الأذان التجريبي.');
  };

  const testAdhanAlert = async () => {
    unlockAudioPlayback();
    const defaultId = getSelectedDefaultAdhanId();
    const adhan = resolvePrayerAdhan(prefs.prayer_settings?.['الفجر']?.sound_id, defaultId);
    const title = `تجربة الأذان — ${adhan.name}`;
    const body = 'هذا تنبيه تجريبي لصوت وإشعار الأذان.';

    if (isNativePlatform()) {
      const plugin = getNativeBackgroundAudioPlugin();
      if (plugin) {
        try {
          setTestingAdhan(true);
          await plugin.testAdhanNotification({
            rawSound: adhan.rawName,
            soundTitle: adhan.name,
            full: true,
            delayMs: 250,
          });
          notify(`جاري تشغيل إشعار الأذان التجريبي (${adhan.name}).`);
          return;
        } catch {
          // Fallback to LocalNotifications/Web playback below
        }
      }
      await deliverNotification('prayer', title, body, 'settings', adhan.soundId);
      notify(`أُرسل تنبيه تجريبي (${adhan.name}).`);
      return;
    }

    setTestingAdhan(true);
    playAudio(adhan.url, () => {
      playBuiltInTone('builtin:chime');
      setTestingAdhan(false);
    });
    let perm = getBrowserPermission();
    if (isBrowserNotificationSupported() && perm === 'default') {
      perm = await requestBrowserPermission();
      setBrowserPerm(perm);
    }
    await deliverNotification('prayer', title, body, 'settings', adhan.soundId);
    notify(perm === 'denied'
      ? `تم تشغيل الأذان داخل التطبيق فقط (${adhan.name}) لأن إشعارات المتصفح محظورة.`
      : `تم تشغيل تجربة الأذان والإشعار (${adhan.name}).`);
  };

  if (loading) return <p className="muted" role="status">جارٍ تحميل إعدادات الصلاة…</p>;

  const nativeApp = isNativePlatform();
  const hasWebLocation = Boolean(resolveSchedulingLocation(prayerLocation));

  return (
    <div className="notif-prayer-panel">
      <NativeAdhanPanel prayerLocation={prayerLocation} onNotify={notify}/>
      {!nativeApp && !hasWebLocation && (
        <div className="qibla-banner warn" role="alert">
          اختر مدينتك أدناه أو اسمح بالموقع لتعمل مواقيت الصلاة وتنبيهات الأذان تلقائيًا.
        </div>
      )}
      {!nativeApp && isBrowserNotificationSupported() && browserPerm !== 'granted' && (
        <div className={`task-push-permission-bar perm-${browserPerm ?? 'default'}`}>
          <div>
            <strong>إشعارات الأذان في المتصفح:</strong>{' '}
            <span>
              {browserPerm === 'denied'
                ? 'محظورة من المتصفح؛ فعّل الإذن من إعدادات الموقع ليظهر تنبيه الأذان خارج الصفحة.'
                : 'فعّل إشعارات المتصفح ليصلك تنبيه الأذان بصوته المختار.'}
            </span>
          </div>
          {browserPerm !== 'denied' && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                unlockAudioPlayback();
                void requestBrowserPermission().then(next => {
                  setBrowserPerm(next);
                  if (next === 'granted') notify('تم تفعيل إشعارات المتصفح للأذان.');
                });
              }}
            >
              <BellRing size={15}/> تفعيل الإشعارات
            </button>
          )}
        </div>
      )}
      {!nativeApp && isBrowserNotificationSupported() && browserPerm === 'granted' && (
        <div className="task-push-permission-bar perm-granted">
          <div>
            <strong>إشعارات المتصفح للأذان:</strong>{' '}
            <span>مفعّلة — ستصلك أثناء فتح التطبيق.</span>
          </div>
          <span className="task-push-ok"><CheckCircle2 size={15}/> نشط</span>
        </div>
      )}
      {onPrayerLocation && (
        <PrayerLocationPicker location={sanitizePrayerLocation(prayerLocation)} onChange={onPrayerLocation}/>
      )}

      <div className="notif-form-actions" style={{marginBottom: 8}}>
        <button type="button" className="soft-btn" onClick={() => void testAdhanAlert()}>
          <Send size={15}/> تجربة صوت وإشعار الأذان
        </button>
        {testingAdhan && (
          <button type="button" className="soft-btn" onClick={() => void stopTestAdhan()}>
            <Square size={15}/> إيقاف الأذان
          </button>
        )}
      </div>

      <div className="notif-prayer-list-head">
        <h4>تخصيص كل صلاة</h4>
        <p className="muted small">
          {!prefs.global_enabled && 'الإشعارات متوقفة من إعدادات الهدوء والإشعارات.'}
        </p>
      </div>

      <div className="notif-prayer-list">
        {PRAYER_NAMES.map(prayer => {
          const setting: PrayerSetting = {...DEFAULT_PRAYER_PREFERENCES[prayer], ...prefs.prayer_settings[prayer]};
          const id = `prayer-${PRAYER_NAMES.indexOf(prayer)}`;
          const isOpen = expandedPrayer === prayer;
          const isDirty = dirtyPrayers.has(prayer);
          return (
            <fieldset key={prayer} className={`notif-prayer-card${setting.enabled ? '' : ' paused'}`} disabled={!prefs.global_enabled}>
              <legend className="sr-only">إعدادات صلاة {prayer}</legend>
              <div className="notif-prayer-head">
                <label className="notif-prayer-toggle">
                  <input
                    type="checkbox"
                    checked={setting.enabled}
                    onChange={event => update(prayer, {enabled: event.target.checked})}
                    aria-label={`تفعيل تنبيه صلاة ${prayer}`}
                  />
                  <span className="notif-prayer-title-wrap">
                    <strong>{prayer}</strong>
                    <small className="notif-prayer-summary">{summarizePrayer(setting)}</small>
                  </span>
                </label>

                <div className="notif-prayer-head-actions">
                  {isDirty && !isOpen && (
                    <button
                      type="button"
                      className="primary notif-prayer-quick-save"
                      disabled={savingPrayer !== null}
                      onClick={() => void savePrayer(prayer)}
                    >
                      <Check size={15}/> حفظ
                    </button>
                  )}
                  <button
                    type="button"
                    className={`soft-btn notif-prayer-expand${isOpen ? ' open' : ''}`}
                    aria-expanded={isOpen}
                    aria-controls={`${id}-details`}
                    onClick={() => setExpandedPrayer(isOpen ? null : prayer)}
                  >
                    <span>{isOpen ? 'إخفاء' : 'تخصيص'}</span>
                    {isOpen ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                  </button>
                </div>
              </div>

              {isOpen && (
                <div id={`${id}-details`} className="notif-prayer-details">
                  {setting.enabled ? (
                    <div className="form-grid">
                      <label htmlFor={`${id}-type`}>نوع الأذان
                        <select
                          id={`${id}-type`}
                          value={setting.adhan_type}
                          onChange={event => update(prayer, {adhan_type: event.target.value as PrayerAdhanType})}
                        >
                          {(Object.keys(PRAYER_ADHAN_LABELS) as PrayerAdhanType[]).map(key => (
                            <option key={key} value={key}>{PRAYER_ADHAN_LABELS[key]}</option>
                          ))}
                        </select>
                      </label>
                      <label htmlFor={`${id}-channel`}>طريقة وصول التنبيه
                        <select
                          id={`${id}-channel`}
                          value={setting.channel}
                          onChange={event => update(prayer, {channel: event.target.value as NotificationChannel})}
                        >
                          {(['system', 'both'] as NotificationChannel[]).map(key => (
                            <option key={key} value={key}>{channelLabel(key)}</option>
                          ))}
                        </select>
                      </label>
                      {setting.adhan_type !== 'silent' && (
                        <label>الصوت
                          <SoundSelectField value={setting.sound_id} onChange={sound => update(prayer, {sound_id: sound})}/>
                        </label>
                      )}
                      <label htmlFor={`${id}-before`}>تذكير قبل الأذان (دقائق، 0 = بلا تذكير)
                        <input
                          id={`${id}-before`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={MAX_REMINDER_MINUTES}
                          value={setting.remind_before_minutes ?? 0}
                          onChange={event => update(prayer, {remind_before_minutes: boundedMinutes(event.target.value, MAX_REMINDER_MINUTES)})}
                        />
                      </label>
                      <label htmlFor={`${id}-after`}>تذكير بعد الأذان (دقائق، 0 = بلا تذكير)
                        <input
                          id={`${id}-after`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={MAX_REMINDER_MINUTES}
                          value={setting.remind_after_minutes ?? 0}
                          onChange={event => update(prayer, {remind_after_minutes: boundedMinutes(event.target.value, MAX_REMINDER_MINUTES)})}
                        />
                      </label>
                      <label htmlFor={`${id}-adjust`}>تعديل يدوي للوقت (دقائق، −{MAX_PRAYER_ADJUSTMENT} إلى +{MAX_PRAYER_ADJUSTMENT})
                        <input
                          id={`${id}-adjust`}
                          type="number"
                          inputMode="numeric"
                          min={-MAX_PRAYER_ADJUSTMENT}
                          max={MAX_PRAYER_ADJUSTMENT}
                          value={setting.adjust_minutes ?? 0}
                          onChange={event => update(prayer, {adjust_minutes: clampAdjustment(Number(event.target.value))})}
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="muted small">التنبيه متوقف لهذه الصلاة. فعّل المفتاح بالأعلى لضبط خيارات الأذان والتذكير.</p>
                  )}

                  <div className="notif-form-actions">
                    <button
                      type="button"
                      className="primary"
                      disabled={savingPrayer !== null || !isDirty}
                      onClick={() => void savePrayer(prayer)}
                    >
                      {savingPrayer === prayer ? 'جارٍ الحفظ…' : isDirty ? `حفظ إعدادات ${prayer}` : 'تم الحفظ'}
                    </button>
                    <button
                      type="button"
                      className="soft-btn"
                      disabled={savingPrayer !== null}
                      onClick={() => restorePrayer(prayer)}
                    >
                      <RotateCcw size={15}/> استعادة الافتراضي
                    </button>
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
