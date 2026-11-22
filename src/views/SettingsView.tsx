import {useEffect, useRef, useState} from 'react';
import {Download, Globe, HardDrive, Lock, Play, RotateCcw, Square, Upload, UserRound, Volume2} from 'lucide-react';
import {type State, createSeed} from '../app-state';
import {
  exportLocalBackup,
  formatStorageBytes,
  getLocalStorageSummary,
  importLocalBackup,
  requestPersistentStorage,
  type LocalStorageSummary,
} from '../local-backup';
import NotificationSettings from './notifications/NotificationSettings';
import {AppearancePanel} from '../AppearanceToggle';
import {InstallGuidePanel} from '../InstallApp';
import {LOCAL_ONLY} from '../config';
import {BUILTIN_SOUNDS, playBuiltInTone} from '../notifications/builtin-sounds';
import {
  NATIVE_SCHEDULE_UPDATED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  notifyNativePrefsChanged,
} from '../notifications/native-prayer-scheduler';
import {loadPrefs, savePrefs} from '../notifications/prefs-store';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  DEFAULT_PRAYER_PREFERENCES,
  PRAYER_NAMES,
  type NotificationPreference,
  type PrayerName,
} from '../notifications/types';
import {
  ADHAN_SELECTION_STORAGE_KEY,
  BUNDLED_ADHAN_SOUNDS,
  getSelectedDefaultAdhanId,
  resolvePrayerAdhan,
} from '../sounds/adhan-catalog';
import AdhanPlayer from './AdhanPlayer';
import AlarmTonePlayer from './AlarmTonePlayer';
import AudioDiagnostics from './AudioDiagnostics';
import {useBackHandler} from '../navigation/useBackHandler';
import {loadLocalAudioObjectUrlForWebView, resolveAudioUrlForWeb} from '../audio/url-resolver';

type Props = {state: State; onReplace: (state: State) => void; notify: (message: string) => void; onOpenProfile?: () => void};

// إعدادات المستخدم: الحساب (في نسخة السحابة)، والتنبيهات والمظهر والخصوصية،
// واختيار أصوات الأذان المحلية لكل وقت صلاة وللمنبهات دون اتصال بالإنترنت.
export default function SettingsView({state, onReplace, notify, onOpenProfile}: Props) {
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [defaultAdhanId, setDefaultAdhanId] = useState<string>(() => getSelectedDefaultAdhanId());
  const [previewPlayingId, setPreviewPlayingId] = useState<string | null>(null);
  const [storageSummary, setStorageSummary] = useState<LocalStorageSummary | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const versionRef = useRef<HTMLSpanElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewBlobRevokeRef = useRef<(() => void) | null>(null);
  const previewTokenRef = useRef(0);
  const backupFileRef = useRef<HTMLInputElement | null>(null);

  // الرجوع يغلق تأكيد التصفير، ثم شاشة تشخيص الصوت.
  useBackHandler(() => setConfirmReset(false), confirmReset);
  useBackHandler(() => setShowDiagnostics(false), showDiagnostics);

  useEffect(() => {
    void getLocalStorageSummary().then(setStorageSummary);
  }, [state]);

  // شاشة التشخيص — long-press على رقم الإصدار (أو long-press الوصفة أيضًا).
  useEffect(() => {
    const el = versionRef.current;
    if (!el) return;
    const onHold = () => setShowDiagnostics(true);
    el.addEventListener('contextmenu', onHold);
    el.addEventListener('touchstart', onHold, {passive: true});
    el.addEventListener('mousedown', onHold, {passive: true});
    return () => {
      el.removeEventListener('contextmenu', onHold);
      el.removeEventListener('touchstart', onHold);
      el.removeEventListener('mousedown', onHold);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const sync = () => {
      setDefaultAdhanId(getSelectedDefaultAdhanId());
      void loadPrefs().then(({prefs: loaded}) => {
        if (active) setPrefs(loaded);
      });
    };
    sync();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    window.addEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
      window.removeEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, sync);
    };
  }, []);

  useEffect(() => () => {
    previewTokenRef.current += 1;
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewBlobRevokeRef.current) {
      try { previewBlobRevokeRef.current(); } catch { /* ignore */ }
      previewBlobRevokeRef.current = null;
    }
  }, []);

  const stopPreview = () => {
    previewTokenRef.current += 1;
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewBlobRevokeRef.current) {
      try { previewBlobRevokeRef.current(); } catch { /* ignore */ }
      previewBlobRevokeRef.current = null;
    }
    setPreviewPlayingId(null);
  };

  const togglePreview = (idOrSoundId?: string) => {
    const resolved = resolvePrayerAdhan(idOrSoundId, defaultAdhanId);
    if (previewPlayingId === resolved.soundId) {
      stopPreview();
      return;
    }
    stopPreview();
    const safeUrl = resolveAudioUrlForWeb(resolved.url);
    if (!safeUrl) {
      playBuiltInTone('builtin:chime');
      return;
    }
    const token = ++previewTokenRef.current;
    const audio = new Audio();
    previewAudioRef.current = audio;
    setPreviewPlayingId(resolved.soundId);
    let handledError = false;
    const onUnavailable = () => {
      if (handledError || token !== previewTokenRef.current) return;
      handledError = true;
      setPreviewPlayingId(null);
      previewAudioRef.current = null;
      if (previewBlobRevokeRef.current) {
        try { previewBlobRevokeRef.current(); } catch { /* ignore */ }
        previewBlobRevokeRef.current = null;
      }
      playBuiltInTone('builtin:chime');
      notify('ملف الأذان غير متوفر في هذه الحزمة؛ شُغِّلت نغمة تنبيه بديلة.');
    };
    audio.addEventListener('ended', () => {
      if (token !== previewTokenRef.current) return;
      setPreviewPlayingId(null);
      previewAudioRef.current = null;
      if (previewBlobRevokeRef.current) {
        try { previewBlobRevokeRef.current(); } catch { /* ignore */ }
        previewBlobRevokeRef.current = null;
      }
    }, {once: true});
    audio.addEventListener('error', onUnavailable, {once: true});
    void loadLocalAudioObjectUrlForWebView(safeUrl).then(localBlob => {
      if (token !== previewTokenRef.current) {
        localBlob?.revoke();
        return;
      }
      if (localBlob) {
        previewBlobRevokeRef.current = localBlob.revoke;
        audio.src = localBlob.url;
      } else {
        audio.src = safeUrl;
      }
      void audio.play().catch(onUnavailable);
    }).catch(() => {
      if (token !== previewTokenRef.current) return;
      audio.src = safeUrl;
      void audio.play().catch(onUnavailable);
    });
  };

  const handleDefaultAdhanChange = (nextId: string) => {
    stopPreview();
    setDefaultAdhanId(nextId);
    try {
      localStorage.setItem(ADHAN_SELECTION_STORAGE_KEY, nextId);
    } catch { /* ignore */ }
    notifyNativePrefsChanged();
    const entry = resolvePrayerAdhan(undefined, nextId);
    notify(`تم تعيين الأذان الافتراضي: ${entry.name}`);
  };

  const handlePrayerSoundChange = async (prayer: PrayerName, nextSoundId: string) => {
    const soundId = nextSoundId || undefined;
    setPrefs(old => ({
      ...old,
      prayer_settings: {
        ...old.prayer_settings,
        [prayer]: {
          ...DEFAULT_PRAYER_PREFERENCES[prayer],
          ...old.prayer_settings?.[prayer],
          sound_id: soundId,
        },
      },
    }));
    try {
      const {prefs: fresh} = await loadPrefs();
      const current = {...DEFAULT_PRAYER_PREFERENCES[prayer], ...fresh.prayer_settings?.[prayer], sound_id: soundId};
      const nextPrefs: NotificationPreference = {
        ...fresh,
        prayer_settings: {
          ...fresh.prayer_settings,
          [prayer]: current,
        },
      };
      await savePrefs(nextPrefs);
      setPrefs(nextPrefs);
      notifyNativePrefsChanged();
      const label = soundId
        ? (BUNDLED_ADHAN_SOUNDS.find(s => s.soundId === soundId)?.name
          ?? BUILTIN_SOUNDS.find(s => s.id === soundId)?.title
          ?? 'الصوت المختار')
        : `الافتراضي (${defaultAdhan.name})`;
      notify(`تم تعيين صوت ${prayer}: ${label}`);
    } catch {
      notify(`تعذر حفظ صوت ${prayer}`);
    }
  };

  const handleReminderSoundChange = async (nextSoundId: string) => {
    const soundId = nextSoundId || undefined;
    setPrefs(old => ({
      ...old,
      reminder_settings: {
        ...old.reminder_settings,
        default_sound_id: soundId,
      },
    }));
    try {
      const {prefs: fresh} = await loadPrefs();
      const nextPrefs: NotificationPreference = {
        ...fresh,
        reminder_settings: {
          ...fresh.reminder_settings,
          default_sound_id: soundId,
        },
      };
      await savePrefs(nextPrefs);
      setPrefs(nextPrefs);
      notifyNativePrefsChanged();
      const label = soundId
        ? (BUNDLED_ADHAN_SOUNDS.find(s => s.soundId === soundId)?.name
          ?? BUILTIN_SOUNDS.find(s => s.id === soundId)?.title
          ?? 'الصوت المختار')
        : 'الافتراضي';
      notify(`تم تعيين صوت المنبهات: ${label}`);
    } catch {
      notify('تعذر حفظ صوت المنبهات');
    }
  };

  const exportBackup = () => {
    try {
      const payload = exportLocalBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rabbaniyun-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify('تم تصدير النسخة الاحتياطية المحلية');
    } catch {
      notify('تعذر تصدير النسخة الاحتياطية');
    }
  };

  const importBackup = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const restored = importLocalBackup(text);
      if (restored) onReplace(restored);
      void getLocalStorageSummary().then(setStorageSummary);
      notify('تم استيراد النسخة الاحتياطية بنجاح');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'تعذر قراءة ملف النسخة الاحتياطية');
    }
  };

  const enablePersistentStorage = async () => {
    const granted = await requestPersistentStorage();
    void getLocalStorageSummary().then(setStorageSummary);
    if (granted === true) notify('تم تثبيت التخزين المحلي الدائم على هذا الجهاز');
    else if (granted === false) notify('المتصفح لم يمنح تثبيتًا تلقائيًا للتخزين الدائم، لكن البيانات تبقى محفوظة محليًا.');
    else notify('التخزين المحلي يعمل على هذا الجهاز');
  };

  const reset = () => {
    onReplace(createSeed());
    setConfirmReset(false);
    void getLocalStorageSummary().then(setStorageSummary);
    notify('تمت إعادة ضبط البيانات المحلية');
  };

  const defaultAdhan = resolvePrayerAdhan(undefined, defaultAdhanId);
  const isDefaultPlaying = previewPlayingId === defaultAdhan.soundId;

  return <>
    <div className="page-intro"><span className="eyebrow">المنصة</span><h1>الإعدادات والبيانات</h1><p>{LOCAL_ONLY?'نسخة محلية تعمل على هذا الجهاز وحده: لا حساب ولا مزامنة سحابية ولا نسخ احتياطية خارجية.':'نسخة تجريبية تعمل محليًا في المتصفح، وتُزامَن بيانات حسابك في السحابة عند تسجيل الدخول.'}</p></div>
    {!LOCAL_ONLY&&onOpenProfile&&<section className='panel'><h3><UserRound size={18}/> الملف الشخصي وإعدادات الحساب</h3><p className="muted">اسمك وبلدك، والمنطقة الزمنية واللغة والمدينة ومواعيد اليوم، وتفضيلات الإشعارات، وحذف الحساب.</p><button className="primary" onClick={onOpenProfile}><Globe size={17}/> فتح حسابي</button></section>}
    <AppearancePanel/>
    <NotificationSettings
      notify={notify}
      prayerLocation={state.prayerLocation}
      onPrayerLocation={prayerLocation=>onReplace({...state,prayerLocation})}
      goals={state.goals.map(goal=>({id:String(goal.id),title:String((goal as {title?:string}).title??'')}))}
      taskContext={{
        tasks: state.tasks,
        goals: state.goals,
        taskSchedules: state.taskSchedules ?? {},
        dayPlan: state.dayPlan,
        prayers: state.prayers,
      }}
    />
    <section className="panel adhan-player" dir="rtl" aria-labelledby="offline-adhan-select-title">
      <h3 id="offline-adhan-select-title"><Volume2 size={18}/> اختيار صوت الأذان (يعمل بدون إنترنت)</h3>
      <p className="muted">اختر صوت الأذان المفضل من الملفات المدمجة محليًا في التطبيق لكل وقت صلاة أو للمنبهات دون الحاجة لاتصال بالإنترنت.</p>
      <div className="adhan-row adhan-default-row">
        <select
          className="adhan-select"
          aria-label="الأذان الافتراضي للصلوات"
          value={defaultAdhanId}
          onChange={event => handleDefaultAdhanChange(event.target.value)}
        >
          {BUNDLED_ADHAN_SOUNDS.map(sound => (
            <option key={sound.id} value={sound.id}>{sound.name}</option>
          ))}
        </select>
        <button
          type="button"
          className={isDefaultPlaying ? 'soft-btn selected' : 'primary'}
          onClick={() => togglePreview(defaultAdhan.soundId)}
          aria-pressed={isDefaultPlaying}
        >
          {isDefaultPlaying ? <Square size={16}/> : <Play size={16}/>} {isDefaultPlaying ? 'إيقاف' : 'معاينة'}
        </button>
      </div>
      <div className="form-grid">
        {PRAYER_NAMES.map(prayer => {
          const currentValue = prefs.prayer_settings?.[prayer]?.sound_id ?? '';
          return (
            <label key={prayer}>أذان صلاة {prayer}
              <select
                aria-label={`أذان صلاة ${prayer}`}
                value={currentValue}
                onChange={event => void handlePrayerSoundChange(prayer, event.target.value)}
              >
                <option value="">الافتراضي ({defaultAdhan.name})</option>
                <optgroup label="ملفات الأذان المحلية (بدون إنترنت)">
                  {BUNDLED_ADHAN_SOUNDS.map(sound => (
                    <option key={sound.soundId} value={sound.soundId}>{sound.name}</option>
                  ))}
                </optgroup>
                <optgroup label="نغمات التنبيه">
                  {BUILTIN_SOUNDS.map(sound => (
                    <option key={sound.id} value={sound.id}>{sound.title}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          );
        })}
        <label>صوت المنبهات والتذكيرات
          <select
            aria-label="صوت المنبهات والتذكيرات"
            value={prefs.reminder_settings?.default_sound_id ?? ''}
            onChange={event => void handleReminderSoundChange(event.target.value)}
          >
            <option value="">الافتراضي</option>
            <optgroup label="ملفات الأذان المحلية (بدون إنترنت)">
              {BUNDLED_ADHAN_SOUNDS.map(sound => (
                <option key={sound.soundId} value={sound.soundId}>{sound.name}</option>
              ))}
            </optgroup>
            <optgroup label="نغمات التنبيه">
              {BUILTIN_SOUNDS.map(sound => (
                <option key={sound.id} value={sound.id}>{sound.title}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
    </section>
    <AdhanPlayer notify={notify}/>
    <AlarmTonePlayer notify={notify}/>
    <section className="panel">
      <h3><HardDrive size={18}/> التخزين المحلي والنسخ الاحتياطي</h3>
      <p className="muted">جميع بياناتك — مهامك، خططك، أهدافك، أورادك، محاسبتك، حفظ القرآن، الأذكار، المنبهات، والإشعارات — محفوظة محليًا بالكامل على هذا الجهاز فقط دون أي خادم خارجي.</p>
      {storageSummary && (
        <div className="hint settings-storage-hint">
          <div><strong>حالة الحفظ الدائم:</strong> {storageSummary.persisted === true ? 'مفعّل على الجهاز' : storageSummary.persisted === false ? 'تخزين محلي قياسي' : 'متاح محليًا'}</div>
          <div><strong>السجلات المحلية المحفوظة:</strong> {storageSummary.localKeysCount} مفتاحًا {storageSummary.usageBytes !== null ? `· المساحة المستخدمة: ${formatStorageBytes(storageSummary.usageBytes)}` : ''}</div>
        </div>
      )}
      <div className="settings-backup-actions">
        <button type="button" className="primary" onClick={exportBackup}><Download size={16}/> تصدير نسخة احتياطية</button>
        <button type="button" className="soft-btn" onClick={() => backupFileRef.current?.click()}><Upload size={16}/> استيراد نسخة احتياطية</button>
        {storageSummary?.persisted !== true && (
          <button type="button" className="soft-btn" onClick={() => void enablePersistentStorage()}>تثبيت التخزين الدائم</button>
        )}
        <input
          ref={backupFileRef}
          className="hidden-file-input"
          type="file"
          accept="application/json,.json"
          onChange={event => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = '';
            void importBackup(file);
          }}
        />
      </div>
      {!confirmReset ? (
        <button type="button" className="outline-danger" onClick={() => setConfirmReset(true)}><RotateCcw size={17}/> حذف البيانات المحلية</button>
      ) : (
        <div className="notif-confirm" role="alertdialog" aria-label="تأكيد حذف البيانات المحلية">
          <p className="small">هل تريد حذف كل البيانات المحلية في هذا الجهاز؟ يُنصح بتصدير نسخة احتياطية أولًا. لا يمكن التراجع.</p>
          <div className="settings-confirm-actions">
            <button type="button" className="outline-danger" onClick={reset}>تأكيد الحذف النهائي</button>
            <button type="button" className="soft-btn" onClick={() => setConfirmReset(false)}>إلغاء</button>
          </div>
        </div>
      )}
    </section>
    <InstallGuidePanel/>
    <details className="panel settings-collapsible">
      <summary><Lock size={18}/> الخصوصية ومصادر المحتوى</summary>
      <div className="settings-collapsible-body">
        <p className="muted">اسمك وبلدك ملكك وحدك ولا يظهران لغيرك. محاسبة نفسك («حاسب نفسك») لا تُعرض على أحد ولا تدخل في أي إجمالي.</p>
        <p className="muted">الموقع يُستخدم على جهازك فقط لحساب أوقات الصلاة والقبلة والمساجد القريبة، ولا يُرسل إلى أي خادم. سياسة الخصوصية الكاملة: <a href="https://alrabbaniyun.com/privacy.html" target="_blank" rel="noopener noreferrer">alrabbaniyun.com/privacy.html</a></p>
        <p className="muted small">مصادر المحتوى: نص القرآن من مشروع Tanzil (CC BY 3.0)، والخط العثماني من مجمع الملك فهد لطباعة المصحف الشريف. الأحاديث من مستودع fawazahmed0/hadith-api (The Unlicense / Public Domain).</p>
      </div>
    </details>

    {/* الشاشة التشخيصية: long-press على رقم الإصدار (أو التقليدي، سأضيفه) → زر على الجهاز */}
    {showDiagnostics && <AudioDiagnostics />}

    <div className="hint settings-version-bar">
      <span ref={versionRef} className="muted small">
        الربانيون · إصدار Android 1.0.1
      </span>
    </div>
  </>;
}
