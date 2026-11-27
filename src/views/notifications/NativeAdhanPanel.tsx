// src/views/notifications/NativeAdhanPanel.tsx
import { resolveSchedulingLocation } from '../../notifications/scheduling-location';
import { useCallback, useEffect, useState } from 'react';
import { loadPrefs, loadReminders, savePrefs } from '../../notifications/prefs-store';
import { type PrayerLocation } from '../../prayer-location';
import {
  addAppResumeListener,
  getAndroidEnvironmentStatus,
  getNativeRecomputeState,
  type NativeRecomputeState,
  openAppSettings as openNativeAppSettings,
  openBatterySettings as openNativeBatterySettings,
  openExactAlarmSettings as openNativeExactAlarmSettings,
  stopNativeAdhan,
  type AndroidEnvironmentStatus,
} from '../../lib/settings-opener';
import { getNativeBackgroundAudioPlugin } from '../../audio/native-bridge';
import {
  BUNDLED_ADHAN_SOUNDS,
  getSelectedDefaultAdhanId,
  resolvePrayerAdhan,
} from '../../sounds/adhan-catalog';
import {
  ensureChannels,
  checkPermissions,
  requestPermissions,
  schedulePrayerNotifications,
  scheduleNativePersonalReminders,
  buildNativeAdhanAlarmInputs,
  DEFAULT_SCHEDULE_DAYS,
  notifyNativePrefsChanged,
  cancelAllPrayerNotifications,
  getActiveAdhanChannelInfo,
  isNativePlatform,
  ADHAN_CHANNEL_ID,
  GENERAL_CHANNEL_ID,
  NATIVE_SCHEDULE_UPDATED_EVENT,
  type ActiveChannelInfo,
} from '../../notifications/native-prayer-scheduler';

interface Props { prayerLocation?: PrayerLocation; onNotify: (m: string) => void; }

export default function NativeAdhanPanel({ prayerLocation, onNotify }: Props) {
  const [perm, setPerm] = useState<{ display: string; exact: string }>({ display: 'prompt', exact: 'unsupported' });
  const [envStatus, setEnvStatus] = useState<AndroidEnvironmentStatus | null>(null);
  const [channelInfo, setChannelInfo] = useState<ActiveChannelInfo>(() => getActiveAdhanChannelInfo());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [supported] = useState(isNativePlatform());
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [recompute, setRecompute] = useState<NativeRecomputeState | null>(null);
  const [health, setHealth] = useState<{ hasLocation: boolean; upcoming: number; inAppOnly: string[]; until: string; globalOff: boolean; dnd: boolean } | null>(null);

  const refresh = useCallback(async () => {
    // حالة الجدولة تُحسب محليًا ولا تتوقف على استجابة إضافات النظام.
    try {
      const { prefs } = await loadPrefs();
      const loc = resolveSchedulingLocation(prayerLocation);
      const alarms = loc ? buildNativeAdhanAlarmInputs({ location: loc, prefs, days: DEFAULT_SCHEDULE_DAYS }) : [];
      const upcoming = alarms.length;
      const last = alarms.length ? new Date(alarms[alarms.length - 1].triggerAtMs) : null;
      const until = last ? last.toLocaleDateString('ar', { day: 'numeric', month: 'long' }) : '';
      const inAppOnly = (Object.keys(prefs.prayer_settings) as Array<keyof typeof prefs.prayer_settings>)
        .filter((n) => prefs.prayer_settings[n].enabled && prefs.prayer_settings[n].channel === 'in_app');
      setHealth({ hasLocation: !!loc, upcoming, inAppOnly, until, globalOff: prefs.global_enabled === false, dnd: prefs.dnd_enabled === true });
    } catch { /* ignore */ }
    try {
      const [p, ch, env] = await Promise.all([
        checkPermissions(),
        ensureChannels(),
        getAndroidEnvironmentStatus(),
      ]);
      setPerm(p);
      setChannelInfo(ch);
      setEnvStatus(env);
    } catch { /* ignore */ }
    try { setRecompute(await getNativeRecomputeState()); } catch { /* ignore */ }
  }, [prayerLocation]);

  useEffect(() => {
    void refresh();
    const stopResume = addAppResumeListener(() => { void refresh(); });
    const onUpdated = () => { void refresh(); };
    window.addEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, onUpdated);
    return () => {
      stopResume();
      window.removeEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, onUpdated);
    };
  }, [refresh]);

  const handleEnable = () => setExplainerOpen(true);

  const confirmEnable = async () => {
    setExplainerOpen(false);
    setBusy(true);
    try {
      const ch = await ensureChannels();
      setChannelInfo(ch);
      const p = await requestPermissions();
      setPerm(p);
      setEnvStatus(await getAndroidEnvironmentStatus());
      if (p.display !== 'granted') {
        setResult('لم يُمنح إذن الإشعارات.');
        onNotify('لم يُمنح إذن الإشعارات. يمكنك تفعيله من إعدادات النظام.');
        return;
      }
      const loc = resolveSchedulingLocation(prayerLocation);
      if (!loc) {
        onNotify('اختر موقعك (المدينة) أولاً.');
        return;
      }
      const [{ prefs }, { reminders }] = await Promise.all([loadPrefs(), loadReminders()]);
      const r = await schedulePrayerNotifications({ location: loc, prefs, days: DEFAULT_SCHEDULE_DAYS });
      await scheduleNativePersonalReminders(reminders, prefs);
      await refresh();
      if (r.scheduled > 0) {
        setResult(`تم جدولة ${r.scheduled} منبه (${r.cancelled} ملغى).${r.warning ? ' ملاحظة: ' + r.warning : ''}`);
        onNotify(r.exactAlarm === 'denied'
          ? 'تمت جدولة التنبيهات بشكل تقريبي (inexact) لأن إذن المنبهات الدقيقة غير مفعل.'
          : 'تم تفعيل تنبيهات الأذان على مستوى النظام.');
      } else {
        setResult(`لم تتم جدولة أي منبه (${r.cancelled} ملغى).${r.warning ? ' ' + r.warning : ' تأكد من تفعيل الإشعارات والصلوات.'}`);
        onNotify(r.warning ?? 'لم تتم جدولة أي منبه.');
      }
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'فشل تفعيل التنبيهات.');
    } finally {
      setBusy(false);
    }
  };

  const openAppSettings = async () => {
    const r = await openNativeAppSettings();
    if (r.opened) onNotify('تم فتح إعدادات التطبيق.');
    else if (r.error === 'not-native') onNotify('متاح في تطبيق Android فقط. يدويا: Settings -> Apps -> Al-Rabbaniyyun -> Permissions.');
    else onNotify('تعذر فتح الإعدادات. يدويا: Settings -> Apps -> Al-Rabbaniyyun -> Permissions.');
  };

  const openBatterySettings = async () => {
    const r = await openNativeBatterySettings();
    if (r.opened) onNotify('تم فتح إعدادات توفير البطارية.');
    else if (r.error === 'not-native') onNotify('متاح في تطبيق Android فقط. يدويا: Settings -> Battery -> Battery optimization -> Al-Rabbaniyyun -> Don\'t optimize.');
    else onNotify('تعذر فتح إعدادات البطارية. يدويا: Settings -> Battery -> Battery optimization -> Al-Rabbaniyyun -> Don\'t optimize.');
  };

  const openExactAlarmSettings = async () => {
    const r = await openNativeExactAlarmSettings();
    if (r.opened) {
      onNotify('تم فتح إعدادات المنبهات الدقيقة (Alarms & reminders).');
      return;
    }
    try {
      const mod = await import('@capacitor/local-notifications');
      const changed = await mod.LocalNotifications.changeExactNotificationSetting();
      setPerm((prev) => ({ ...prev, exact: changed.exact_alarm }));
      onNotify('تم فتح إعدادات المنبهات الدقيقة.');
    } catch {
      onNotify('تعذر فتح إعدادات المنبهات الدقيقة. يدويا: Settings -> Apps -> Al-Rabbaniyyun -> Alarms & reminders.');
    }
  };

  const handleReschedule = async () => {
    setBusy(true);
    try {
      const loc = resolveSchedulingLocation(prayerLocation);
      if (!loc) { onNotify('اختر موقعك أولاً.'); return; }
      const [{ prefs }, { reminders }] = await Promise.all([loadPrefs(), loadReminders()]);
      const r = await schedulePrayerNotifications({ location: loc, prefs, days: DEFAULT_SCHEDULE_DAYS });
      await scheduleNativePersonalReminders(reminders, prefs);
      await refresh();
      if (r.scheduled > 0) {
        setResult(`إعادة جدولة: ${r.scheduled} منبه.${r.warning ? ' ملاحظة: ' + r.warning : ''}`);
        onNotify(r.exactAlarm === 'denied'
          ? 'تمت إعادة الجدولة كتنبيهات تقريبية (inexact).'
          : 'تمت إعادة جدولة الأذان.');
      } else {
        setResult(`لم تتم جدولة أي منبه.${r.warning ? ' ' + r.warning : ''}`);
        onNotify(r.warning ?? 'لم تتم جدولة أي منبه.');
      }
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'فشل.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await cancelAllPrayerNotifications();
      await refresh();
      setResult('تم إلغاء جميع منبهات الأذان.');
      onNotify('تم إلغاء المنبهات.');
    } finally {
      setBusy(false);
    }
  };

  // خيار صريح من المستخدم فقط: لا يُغيَّر أي إعداد محفوظ تلقائيًا.
  const enableInAppOnlyPrayers = async () => {
    if (!health || health.inAppOnly.length === 0) return;
    setBusy(true);
    try {
      const { prefs } = await loadPrefs();
      const next = { ...prefs, prayer_settings: { ...prefs.prayer_settings } };
      for (const name of health.inAppOnly) {
        const key = name as keyof typeof next.prayer_settings;
        if (next.prayer_settings[key]?.channel === 'in_app') {
          next.prayer_settings[key] = { ...next.prayer_settings[key], channel: 'both' };
        }
      }
      await savePrefs(next);
      notifyNativePrefsChanged();
      await refresh();
      onNotify(`تم تفعيل الأذان في الخلفية: ${health.inAppOnly.join('، ')}`);
    } finally {
      setBusy(false);
    }
  };

  const handleStopAdhan = async () => {
    await stopNativeAdhan();
    await refresh();
    onNotify('تم إيقاف صوت الأذان.');
  };

  const handleTestAdhan = async () => {
    const plugin = getNativeBackgroundAudioPlugin();
    if (!plugin) {
      onNotify('اختبار الأذان الأصلي متاح في تطبيق Android.');
      return;
    }
    const { prefs } = await loadPrefs();
    const active = resolvePrayerAdhan(prefs.prayer_settings?.['الفجر']?.sound_id, getSelectedDefaultAdhanId());
    try {
      await plugin.testAdhanNotification({
        rawSound: active.rawName,
        soundTitle: active.name,
        full: true,
        delayMs: 250,
      });
      setTimeout(() => { void refresh(); }, 600);
      onNotify(`تم إرسال إشعار الأذان التجريبي بصوت ${active.name}.`);
    } catch {
      onNotify('تعذر تشغيل الأذان التجريبي.');
    }
  };

  if (!supported) {
    return null;
  }

  const activeSoundLabel = channelInfo.soundMode === 'adhan'
    ? `${channelInfo.soundTitle} (res/raw/${channelInfo.soundFile})`
    : 'صوت النظام الافتراضي';

  const batteryLabel = envStatus
    ? (envStatus.ignoringBatteryOptimizations ? 'مستثنى (موصى به)' : 'مقيّد بتوفير البطارية')
    : 'غير معروف';

  return (
    <>
      {explainerOpen && (
        <div className="qibla-banner info" role="dialog" aria-modal="true" style={{ marginBottom: 12 }}>
          <strong>قبل تفعيل تنبيهات الأذان</strong>
          <p className="muted small" style={{ margin: '6px 0' }}>
            سيطلب التطبيق إذن الإشعارات (Android 13+) وإذن المنبهات الدقيقة (Android 12+) لجدولة الأذان في وقتها.
            الأذان يعمل محليًا (بدون إنترنت). يمكنك إيقاف أي صلاة من الإعدادات.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="primary" disabled={busy} onClick={() => void confirmEnable()}>متابعة وطلب الإذن</button>
            <button className="soft-btn" onClick={() => setExplainerOpen(false)}>إلغاء</button>
          </div>
        </div>
      )}
      <div className="notif-prayer-panel">
      <h3>تنبيهات الأذان</h3>
      <p className="muted small">فعّل التنبيهات ليصلك الأذان والتذكيرات والمهام والمراجعة على مستوى الجهاز. أذونات الإشعارات والمنبهات والبطارية أدناه تسري على كل هذه التنبيهات.</p>
      <details className="settings-inner-details"><summary>حالة الأذونات والتشخيص</summary>
      <div className="form-grid">
        <div><strong>الإشعارات:</strong> {perm.display==='granted'?'مفعّلة':'تحتاج إذنًا'}</div>
        <div><strong>المنبهات الدقيقة:</strong> {perm.exact==='granted'?'مفعّلة':perm.exact==='unsupported'?'غير مدعومة':'تحتاج إذنًا'}</div>
        <div><strong>قناة الأذان:</strong> {channelInfo.adhanChannelId || ADHAN_CHANNEL_ID} · {activeSoundLabel}</div>
        <div><strong>قناة عامة:</strong> {GENERAL_CHANNEL_ID} · <strong>البطارية:</strong> {batteryLabel}</div>
        {recompute && (
          <div data-native-recompute={recompute.result}><strong>تجديد الأذان تلقائيًا (بدون فتح التطبيق):</strong>{' '}
            {recompute.result === 'ok' ? `يعمل · آخر تجديد ${recompute.lastRunMs ? new Date(recompute.lastRunMs).toLocaleString('ar') : '—'} · أُضيف ${recompute.added}`
              : recompute.result === 'unsupported' ? 'غير مدعوم لطريقة الحساب الحالية، فيبقى الأذان المجدول عند فتح التطبيق فقط'
              : recompute.result === 'invalid_spec' || recompute.result === 'failed' ? 'تعذّر التجديد؛ الأذان المجدول سابقًا باقٍ وسيُجدَّد عند فتح التطبيق'
              : recompute.result === 'no_spec' ? 'لا توجد إعدادات محفوظة بعد (تُحفظ عند الجدولة)'
              : 'لم يُشغَّل بعد'}
            {' · '}تنبيهات ما قبل/بعد الصلاة والمهام والمراجعة والتذكيرات تتجدد عند فتح التطبيق فقط.
          </div>
        )}
      </div></details>

      {health && (health.globalOff || health.dnd) && (
        <div className="qibla-banner warn" role="alert" data-notif-blocker="global">
          {health.globalOff ? 'مفتاح «تفعيل كل الإشعارات والمنبهات» مغلق، لذلك لا يُجدول أي تنبيه على الجهاز (الأذان والتذكيرات والمهام والمراجعة).' : 'وضع عدم الإزعاج داخل التطبيق مفعّل، لذلك لا يُجدول أي تنبيه على الجهاز (الأذان والتذكيرات والمهام والمراجعة).'}
        </div>
      )}
      {health && !health.hasLocation && (
        <div className="qibla-banner warn" role="alert">
          لا يوجد موقع لحساب المواقيت، لذلك لا أذان مجدول. اختر مدينتك من شاشة المواقيت أو اسمح بالموقع ثم اضغط «إعادة جدولة».
        </div>
      )}
      {health && health.hasLocation && health.inAppOnly.length > 0 && (
        <div className="qibla-banner warn" role="alert">
          صلوات مضبوطة «داخل التطبيق فقط» ولن يصلك أذانها والتطبيق مغلق: {health.inAppOnly.join('، ')}. غيّرها من إعدادات الصلاة، أو فعّلها هنا بضغطة واحدة.
          <div style={{ marginTop: 8 }}>
            <button className="soft-btn" disabled={busy} onClick={() => void enableInAppOnlyPrayers()}>
              تفعيل الأذان في الخلفية لـ: {health.inAppOnly.join('، ')}
            </button>
          </div>
        </div>
      )}
      {health && health.hasLocation && perm.display === 'granted' && (
        <p className="muted small">منبهات الأذان القادمة المحسوبة على هذا الجهاز: {health.upcoming}{health.until ? ` · تغطي حتى ${health.until}، وتتجدد كلما فتحت التطبيق` : ''}</p>
      )}
      {perm.display !== 'granted' && (
        <div className="qibla-banner warn" role="alert">
          لم يُمنح إذن الإشعارات. اضغط «تفعيل» لطلب الإذن، أو افتح إعدادات النظام.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="soft-btn" onClick={() => void openAppSettings()}>فتح إعدادات التطبيق</button>
            <button className="soft-btn" onClick={() => void openBatterySettings()}>إعدادات توفير البطارية</button>
          </div>
        </div>
      )}
      {perm.exact !== 'granted' && perm.exact !== 'unsupported' && (
        <div className="qibla-banner warn" role="alert">
          منبهات الأذان الدقيقة (exact alarm) غير مفعلة. سيتم استخدام الجدولة التقريبية (inexact) وقد تتأخر التنبيهات بضع دقائق.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="soft-btn" onClick={() => void openExactAlarmSettings()}>فتح إعدادات المنبهات الدقيقة</button>
          </div>
        </div>
      )}
      {perm.display === 'granted' && envStatus && !envStatus.ignoringBatteryOptimizations && (
        <div className="qibla-banner warn" role="alert">
          التطبيق خاضع لتوفير البطارية، ما قد يؤخر أو يوقف تنبيهات الأذان في بعض الأجهزة عند إغلاق الشاشة.
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="soft-btn" onClick={() => void openBatterySettings()}>إعدادات توفير البطارية</button>
          </div>
        </div>
      )}

      <div className="notif-form-actions">
        <button className="primary" disabled={busy} onClick={() => void handleEnable()}>
          {busy ? 'جارٍ…' : 'تفعيل تنبيهات الأذان'}
        </button>
        <button className="soft-btn" disabled={busy} onClick={() => void handleReschedule()}>
          إعادة جدولة
        </button>
        <button className="soft-btn" type="button" disabled={busy} onClick={() => void handleTestAdhan()}>
          تجربة إشعار الأذان
        </button>
        <button className="soft-btn" disabled={busy} onClick={() => void handleCancel()}>
          إلغاء الكل
        </button>
        {envStatus?.isAdhanPlaying && (
          <button className="soft-btn" type="button" onClick={() => void handleStopAdhan()}>
            إيقاف الأذان
          </button>
        )}
      </div>

      {result && <p className="muted small">{result}</p>}

      <details className="qibla-steps" style={{ marginTop: 8 }}>
        <summary><strong>مساعدة عند تأخر الأذان</strong></summary>
        <ul style={{ paddingInlineStart: 20, fontSize: 13 }}>
          <li>Android 13+: صلاحية POST_NOTIFICATIONS (تُطلب وقت التشغيل).</li>
          <li>Android 12+: صلاحية SCHEDULE_EXACT_ALARM (exact alarm) — توجيه المستخدم لإعدادات النظام، مع استمرار العمل بالمنبه التقريبي عند الرفض.</li>
          <li>استثناء توفير البطارية: Settings → Battery → Battery optimization → Al-Rabbaniyyun → Don't optimize.</li>
          <li>Xiaomi/Huawei/Oppo: فعّل "التشغيل التلقائي" (Auto-start) و"التشغيل في الخلفية" (Background activity) و"عرض الإشعارات على شاشة القفل".</li>
          <li>إعادة تشغيل الجهاز وتحديث التطبيق وتغيير الوقت/المنطقة الزمنية ومنح إذن المنبهات الدقيقة: يستعيد النظام المنبهات المحفوظة تلقائيًا عبر مستقبل النظام، وتُحدّث الجدولة لـ 30 يومًا عند كل فتح للتطبيق.</li>
        </ul>
      </details>

      <details className="qibla-steps" style={{ marginTop: 8 }}>
        <summary><strong>معلومات تشغيل الأذان</strong></summary>
        <ol style={{ paddingInlineStart: 20, fontSize: 13 }}>
          <li>التطبيق يضم {BUNDLED_ADHAN_SOUNDS.length} تسجيلات أذان كاملة مدمجة محليًا في `res/raw/adhan_*.ogg` (تعمل دون إنترنت)، إضافة إلى ملف `takbeerat_eid.ogg` المستقل لتكبيرات العيد.</li>
          <li>يُشغّل الأذان الكامل في الخلفية أو أثناء قفل الشاشة عبر خدمة `AdhanPlaybackService` (MediaPlayback Foreground Service) مع زر «إيقاف الأذان» وإغلاق تلقائي مضبوط، مع قناة إشعار مخصصة لكل مؤذن في Android 8+.</li>
          <li>لتبديل صوت الأذان، اختر المؤذن من قسم «الأذان» أو من «إعدادات الأصوات» لكل صلاة، وستُحدّث قناة ومنبهات الأذان تلقائيًا.</li>
        </ol>
      </details>
    </div>
    </>
  );
}
