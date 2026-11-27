// مدير المنبهات والتذكيرات الشخصية — إنشاء، تعديل، حذف، إيقاف/تشغيل، استنساخ، تأجيل.
// السحابة أولًا (Supabase RPC) والتخزين المحلي احتياطيًا عند غيابها — نفس النموذج يخدم
// تطبيقات الجوال المستقبلية لأنه نفس سجلات قاعدة البيانات نفسها.

import {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlarmClock,
  Bell,
  CalendarClock,
  Clock3,
  Copy,
  PencilLine,
  Plus,
  Power,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {uid} from '../../id';
import {effectiveNextDueDate, formatTimeHM, WEEK_DAYS} from '../../notifications/scheduler';
import {createReminder, deleteReminder, snoozeReminder, toggleReminder, updateReminder} from '../../notifications/service';
import {loadPrefs, loadReminders, storeLocalReminder} from '../../notifications/prefs-store';
import {testAlertMessage} from '../../notifications/test-alert-copy';
import {endDateError, parseSpecificDates} from '../../notifications/reminder-date-input';
import {formatRemaining} from '../../notifications/upcoming';
import {SoundSelectField} from './SoundPanel';
import {RECURRENCE_LABELS, type Reminder, type ReminderRecurrence} from '../../notifications/types';
import {
  NATIVE_SCHEDULE_UPDATED_EVENT,
  NOTIFICATIONS_CHANGED_EVENT,
  isNativePlatform,
  notifyNativePrefsChanged,
} from '../../notifications/native-prayer-scheduler';
import {
  deliverNotification,
  getBrowserPermission,
  isBrowserNotificationSupported,
  requestBrowserPermission,
} from '../../notifications/delivery';
import {playAudio, stopAudio, unlockAudioPlayback} from '../../notifications/audio';
import {playBuiltInTone} from '../../notifications/builtin-sounds';
import {soundPlanForReminder} from '../../notifications/sound-selection';

type Draft = {
  id?: string;
  title: string;
  description: string;
  date: string;
  time: string;
  recurrence: ReminderRecurrence;
  days: number[];
  intervalDays: number;
  specificDates: string;
  endDate: string;
  category: string;
  soundId: string | undefined;
  linkedGoalId: string | undefined;
  alarmMode: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  prayer: 'الصلاة',
  reminder: 'تذكير شخصي',
  worship: 'ذكر وعمل',
  goal: 'هدف',
  task: 'مهمة',
  custom: 'عام',
};

/** قوالب إسلامية جاهزة تبرز كاقتراحات لا كإلزام — يخصصها المستخدم كما يشاء */
const TEMPLATES: {title: string; description: string; time: string; category: string}[] = [
  {title: 'أذكار الصباح', description: 'ورد الذكر الصباحي', time: '06:30', category: 'worship'},
  {title: 'أذكار المساء', description: 'ورد الذكر المسائي', time: '17:30', category: 'worship'},
  {title: 'ورد القرآن بعد الفجر', description: 'قراءة وتدبر', time: '06:00', category: 'worship'},
  {title: 'السنن الرواتب والوتر', description: 'الصلاة على الفريضة', time: '18:45', category: 'prayer'},
  {title: 'قيام الليل', description: 'قيام ما قبل الفجر', time: '04:15', category: 'worship'},
  {title: 'محاسبة النفس', description: 'حاسب نفسك قبل أن تُحاسب', time: '21:00', category: 'worship'},
  {title: 'مراجعة أهداف اليوم', description: 'تقويم خطوات اليوم وتجديد النية', time: '20:30', category: 'goal'},
];

const time12Fmt = new Intl.DateTimeFormat('ar-EG', {hour: 'numeric', minute: '2-digit'});
const shortDayFmt = new Intl.DateTimeFormat('ar-EG', {weekday: 'short', day: 'numeric', month: 'short'});

function todayLocalYMD(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function emptyDraft(): Draft {
  return {
    title: '',
    description: '',
    date: todayLocalYMD(),
    time: '07:00',
    recurrence: 'none',
    days: [],
    intervalDays: 2,
    specificDates: '',
    endDate: '',
    category: 'reminder',
    soundId: undefined,
    linkedGoalId: undefined,
    alarmMode: false,
  };
}

function draftFromReminder(reminder: Reminder): Draft {
  const at = new Date(reminder.scheduled_at);
  const validAt = !isNaN(at.getTime());
  return {
    id: reminder.id,
    title: reminder.title,
    description: reminder.description ?? '',
    date: validAt ? todayLocalYMD(at) : todayLocalYMD(),
    time: validAt ? formatTimeHM(at) : '07:00',
    recurrence: reminder.recurrence,
    days: reminder.recurrence_config?.days_of_week ?? [],
    intervalDays: reminder.recurrence_config?.interval_days ?? 2,
    specificDates: (reminder.recurrence_config?.specific_dates ?? []).join('، '),
    endDate: reminder.recurrence_config?.end_date ?? '',
    category: reminder.category,
    soundId: reminder.sound_id,
    linkedGoalId: reminder.linked_goal_id,
    alarmMode: reminder.alarm_mode === true,
  };
}

function buildReminder(draft: Draft): Omit<Reminder, 'id' | 'user_id' | 'created_at' | 'updated_at'> {
  const scheduled_at = `${draft.date}T${draft.time}:00`;
  const base = new Date(`${draft.date}T12:00:00`);
  return {
    title: draft.title.trim().slice(0, 200),
    description: draft.description.trim().slice(0, 1000),
    scheduled_at,
    recurrence: draft.recurrence,
    recurrence_config: {
      days_of_week: draft.recurrence === 'weekdays'
        ? [...draft.days].sort((a, b) => a - b)
        : draft.recurrence === 'weekly' ? [base.getDay()] : undefined,
      start_date: draft.date,
      end_date: draft.endDate || undefined,
      specific_dates: draft.recurrence === 'specific_dates'
        ? parseSpecificDates(draft.specificDates).dates
        : undefined,
      interval_days: draft.recurrence === 'custom' ? Math.max(1, Math.round(draft.intervalDays)) : undefined,
    },
    sound_id: draft.soundId,
    category: draft.category,
    linked_goal_id: draft.linkedGoalId,
    alarm_mode: draft.alarmMode ? true : undefined,
    snooze_until: undefined,
    enabled: true,
  };
}

function draftError(draft: Draft): string {
  if (!draft.title.trim()) return 'اكتب عنوان المنبه.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return 'اختر تاريخًا صحيحًا.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return 'اختر وقتًا صحيحًا.';
  const endIssue = endDateError(draft.date, draft.endDate);
  if (endIssue) return endIssue;
  if (draft.recurrence === 'weekdays' && !draft.days.length) return 'اختر يومًا واحدًا على الأقل للتكرار.';
  if (draft.recurrence === 'specific_dates') {
    const {dates, invalid} = parseSpecificDates(draft.specificDates);
    if (!dates.length && !invalid.length) return 'اكتب تاريخًا واحدًا على الأقل (بفواصل بينها).';
    if (invalid.length) return 'اكتب التواريخ بصيغة YYYY-MM-DD، مثل 2026-12-01.';
  }
  return '';
}

function recurrenceHint(reminder: Reminder): string {
  const config = reminder.recurrence_config ?? {};
  if (reminder.recurrence === 'weekdays' && (config.days_of_week ?? []).length) {
    return `كل ${config.days_of_week!.map(day => WEEK_DAYS[day]).join('، ')}`;
  }
  if (reminder.recurrence === 'custom') return `كل ${config.interval_days ?? 1} يومًا`;
  return RECURRENCE_LABELS[reminder.recurrence];
}

function clockReadout(reminder: Reminder, now: Date): {clock: string; dueText: string; isSnoozed: boolean} {
  const next = effectiveNextDueDate(reminder, now);
  const snoozeMs = reminder.snooze_until ? new Date(reminder.snooze_until).getTime() : NaN;
  const isSnoozed = Boolean(next && Number.isFinite(snoozeMs) && snoozeMs > now.getTime() && next.getTime() === snoozeMs);
  if (!reminder.enabled) {
    const base = new Date(reminder.scheduled_at);
    return {
      clock: !isNaN(base.getTime()) ? time12Fmt.format(base) : '—',
      dueText: 'متوقف مؤقتًا',
      isSnoozed: false,
    };
  }
  if (!next) {
    const base = new Date(reminder.scheduled_at);
    return {
      clock: !isNaN(base.getTime()) ? time12Fmt.format(base) : '—',
      dueText: 'انتهى موعده',
      isSnoozed: false,
    };
  }
  const sameDay =
    next.getFullYear() === now.getFullYear()
    && next.getMonth() === now.getMonth()
    && next.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    next.getFullYear() === tomorrow.getFullYear()
    && next.getMonth() === tomorrow.getMonth()
    && next.getDate() === tomorrow.getDate();
  const dayText = sameDay ? 'اليوم' : isTomorrow ? 'غدًا' : shortDayFmt.format(next);
  const remaining = formatRemaining(next.getTime() - now.getTime());
  return {
    clock: time12Fmt.format(next),
    dueText: isSnoozed ? `مؤجل مؤقتًا · ${remaining}` : `${dayText} · ${remaining}`,
    isSnoozed,
  };
}

export default function RemindersPanel({
  notify,
  goals = [],
}: {
  notify: (message: string) => void;
  goals?: {id: string; title: string}[];
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const sync = () => {
      void (async () => {
        try {
          const [{reminders: loaded}, {prefs: currentPrefs}] = await Promise.all([loadReminders(), loadPrefs()]);
          if (active) {
            setReminders(loaded);
            setGlobalEnabled(currentPrefs.global_enabled !== false);
          }
        } catch {/* تجاهل — القائمة فارغة في البداية */}
      })();
    };
    sync();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    window.addEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, sync);
    const ticker = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
      window.removeEventListener(NATIVE_SCHEDULE_UPDATED_EVENT, sync);
      window.clearInterval(ticker);
    };
  }, []);

  const saved = useMemo(
    () =>
      [...reminders].sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        const nextA = effectiveNextDueDate(a, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const nextB = effectiveNextDueDate(b, now)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (nextA !== nextB) return nextA - nextB;
        return a.scheduled_at.localeCompare(b.scheduled_at);
      }),
    [reminders, now],
  );

  const activeCount = useMemo(() => reminders.filter(r => r.enabled).length, [reminders]);
  const pausedCount = reminders.length - activeCount;

  const commitReminders = (updater: (current: Reminder[]) => Reminder[]) => {
    const next = storeLocalReminder(updater(reminders));
    setReminders(next);
    setNow(new Date());
    notifyNativePrefsChanged();
  };

  const openDraft = (nextDraft: Draft) => {
    setConfirmDeleteId(null);
    setError('');
    setDraft(nextDraft);
    window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
    });
  };

  const submit = async () => {
    if (!draft || busy) return;
    const invalid = draftError(draft);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    try {
      const values = buildReminder(draft);
      if (draft.id) {
        const editId = draft.id;
        try {
          const stored = await updateReminder(editId, {...values, snooze_until: undefined, enabled: true});
          commitReminders(list => list.map(item => (item.id === stored.id ? {...stored, alarm_mode: values.alarm_mode} : item)));
          notify('حُدِّث المنبه');
        } catch {
          commitReminders(list =>
            list.map(item =>
              item.id === editId
                ? {...item, ...values, snooze_until: undefined, updated_at: new Date().toISOString()}
                : item,
            ),
          );
          notify('حُدِّث المنبه محليًا');
        }
      } else {
        try {
          const stored = await createReminder(values);
          commitReminders(list => [...list, {...stored, alarm_mode: values.alarm_mode}]);
          notify('أُضيف المنبه');
        } catch {
          const stamp = new Date().toISOString();
          const local: Reminder = {
            id: uid(),
            user_id: '',
            ...values,
            created_at: stamp,
            updated_at: stamp,
          };
          commitReminders(list => [...list, local]);
          notify('أُضيف المنبه محليًا');
        }
      }
      setDraft(null);
      setError('');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (reminder: Reminder) => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        await deleteReminder(reminder.id);
      } catch {/* حذف محلي عند غياب السحابة */}
      commitReminders(list => list.filter(item => item.id !== reminder.id));
      setConfirmDeleteId(null);
      notify('حُذف المنبه');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (reminder: Reminder) => {
    if (busy) return;
    setBusy(true);
    try {
      const nextEnabled = !reminder.enabled;
      try {
        await toggleReminder(reminder.id, nextEnabled);
      } catch {/* تعديل محلي عند غياب السحابة */}
      commitReminders(list =>
        list.map(item =>
          item.id === reminder.id
            ? {...item, enabled: nextEnabled, updated_at: new Date().toISOString()}
            : item,
        ),
      );
      notify(nextEnabled ? 'تم تشغيل المنبه' : 'أُوقف المنبه مؤقتًا');
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async (reminder: Reminder) => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        const stored = await createReminder({
          title: `${reminder.title} (نسخة)`,
          description: reminder.description,
          scheduled_at: reminder.scheduled_at,
          recurrence: reminder.recurrence,
          recurrence_config: reminder.recurrence_config,
          sound_id: reminder.sound_id,
          category: reminder.category,
          linked_goal_id: reminder.linked_goal_id,
          linked_task_id: reminder.linked_task_id,
          enabled: reminder.enabled,
          alarm_mode: reminder.alarm_mode,
        });
        commitReminders(list => [...list, {...stored, alarm_mode: reminder.alarm_mode}]);
        notify('تم نسخ المنبه');
      } catch {
        const stamp = new Date().toISOString();
        commitReminders(list => [
          ...list,
          {
            id: uid(),
            user_id: reminder.user_id,
            title: `${reminder.title} (نسخة)`,
            description: reminder.description,
            scheduled_at: reminder.scheduled_at,
            recurrence: reminder.recurrence,
            recurrence_config: reminder.recurrence_config,
            sound_id: reminder.sound_id,
            category: reminder.category,
            linked_goal_id: reminder.linked_goal_id,
            linked_task_id: reminder.linked_task_id,
            enabled: reminder.enabled,
            alarm_mode: reminder.alarm_mode,
            created_at: stamp,
            updated_at: stamp,
          },
        ]);
        notify('تم نسخ المنبه محليًا');
      }
    } finally {
      setBusy(false);
    }
  };

  const snooze = async (reminder: Reminder) => {
    if (busy) return;
    setBusy(true);
    try {
      try {
        const stored = await snoozeReminder(reminder.id, 10);
        commitReminders(list => list.map(item => (item.id === stored.id ? {...stored, alarm_mode: item.alarm_mode} : item)));
      } catch {
        const until = new Date(Date.now() + 10 * 60000).toISOString();
        commitReminders(list =>
          list.map(item =>
            item.id === reminder.id
              ? {...item, enabled: true, snooze_until: until, updated_at: new Date().toISOString()}
              : item,
          ),
        );
      }
      notify('أُجّل المنبه 10 دقائق');
    } finally {
      setBusy(false);
    }
  };

  const testReminderAlert = async (soundId?: string, title?: string) => {
    unlockAudioPlayback();
    const {prefs} = await loadPrefs();
    const effectiveSound = soundId ?? prefs.reminder_settings?.default_sound_id;
    const plan = soundPlanForReminder(effectiveSound, prefs, []);
    stopAudio();
    if (plan.mode === 'tone') playBuiltInTone(plan.id);
    else if (plan.mode === 'file') playAudio(plan.url, () => playBuiltInTone('builtin:soft'));

    if (!isNativePlatform() && isBrowserNotificationSupported() && getBrowserPermission() === 'default') {
      await requestBrowserPermission();
    }
    const label = title?.trim() || 'تذكير شخصي';
    await deliverNotification('reminder', `تنبيه تجريبي · ${label}`, 'هذا اختبار لصوت وظهور المنبه.', 'settings', effectiveSound);
    notify(testAlertMessage(plan.mode, prefs.global_enabled !== false));
  };

  const editing = draft !== null;

  return (
    <div ref={rootRef} className="notif-reminders">
      {!globalEnabled && (
        <p className="notif-state" role="status">
          <Bell size={17}/> التنبيهات متوقفة من «الهدوء والإشعارات»، فلن يرنّ أي منبه حتى تعيد تفعيلها.
        </p>
      )}
      {!editing && (
        <div className="notif-reminders-toolbar">
          <div className="notif-reminders-summary">
            <strong>المنبهات الشخصية</strong>
            {/* الرسالة الفارغة تظهر مرة واحدة في بطاقة الحالة أدناه، فلا تتكرر هنا. */}
            {reminders.length > 0 && (
              <span className="muted small">
                {`${activeCount} مفعّل${pausedCount > 0 ? ` · ${pausedCount} متوقف` : ''}`}
              </span>
            )}
          </div>
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            <button
              type="button"
              className="soft-btn"
              onClick={() => void testReminderAlert()}
            >
              <Send size={15}/> تجربة المنبه
            </button>
            <button
              type="button"
              className="primary notif-add-btn"
              onClick={() => openDraft(emptyDraft())}
            >
              <Plus size={17}/> منبه جديد
            </button>
          </div>
        </div>
      )}

      {editing && draft && (
        <form
          className="notif-reminder-form"
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div className="notif-form-head">
            <h3><AlarmClock size={18}/> {draft.id ? 'تعديل المنبه' : 'إضافة منبه جديد'}</h3>
            <button
              type="button"
              className="icon-btn notif-form-close"
              aria-label="إغلاق نموذج المنبه"
              onClick={() => {
                setDraft(null);
                setError('');
              }}
            >
              <X size={18}/>
            </button>
          </div>

          <label>العنوان
            <input
              type="text"
              value={draft.title}
              maxLength={200}
              placeholder="مثل: ورد القرآن بعد الفجر"
              onChange={event => setDraft({...draft, title: event.target.value})}
            />
          </label>
          <label>ملاحظة أو وصف (اختياري)
            <input
              type="text"
              value={draft.description}
              maxLength={1000}
              placeholder="تذكير مختصر يظهر مع التنبيه"
              onChange={event => setDraft({...draft, description: event.target.value})}
            />
          </label>

          <div className="form-grid">
            <label>التاريخ
              <input
                type="date"
                value={draft.date}
                onChange={event => setDraft({...draft, date: event.target.value})}
              />
            </label>
            <label>الوقت
              <input
                type="time"
                dir="ltr"
                value={draft.time}
                onChange={event => setDraft({...draft, time: event.target.value})}
              />
            </label>
          </div>

          <label>التكرار
            <select
              value={draft.recurrence}
              onChange={event => {
                const recurrence = event.target.value as ReminderRecurrence;
                setDraft({
                  ...draft,
                  recurrence,
                  days: recurrence === 'weekdays' && !draft.days.length ? [1, 2, 3, 4, 5] : draft.days,
                });
              }}
            >
              {(['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom', 'specific_dates'] as ReminderRecurrence[])
                .map(option => <option key={option} value={option}>{RECURRENCE_LABELS[option]}</option>)}
            </select>
          </label>

          {draft.recurrence === 'weekdays' && (
            <fieldset className="notif-days">
              <legend>أيام التكرار</legend>
              <div className="notif-days-grid">
                {WEEK_DAYS.map((label, day) => {
                  const selected = draft.days.includes(day);
                  return (
                    <label key={label} className={`notif-day${selected ? ' selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={event =>
                          setDraft({
                            ...draft,
                            days: event.target.checked
                              ? [...draft.days, day]
                              : draft.days.filter(item => item !== day),
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {draft.recurrence === 'custom' && (
            <label>كل كم يوم؟
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={366}
                value={draft.intervalDays}
                onChange={event => setDraft({...draft, intervalDays: Number(event.target.value)})}
              />
            </label>
          )}

          {draft.recurrence === 'specific_dates' && (
            <label>تواريخ محددة (بفواصل، بصيغة YYYY-MM-DD)
              <input
                type="text"
                dir="ltr"
                value={draft.specificDates}
                placeholder="2026-11-25, 2026-12-02"
                onChange={event => setDraft({...draft, specificDates: event.target.value})}
              />
            </label>
          )}

          {(draft.recurrence === 'daily' || draft.recurrence === 'weekdays' || draft.recurrence === 'weekly' || draft.recurrence === 'monthly' || draft.recurrence === 'custom') && (
            <label>تاريخ انتهاء التكرار (اختياري)
              <input
                type="date"
                value={draft.endDate}
                onChange={event => setDraft({...draft, endDate: event.target.value})}
              />
            </label>
          )}

          <div className="form-grid">
            <label>التصنيف
              <select value={draft.category} onChange={event => setDraft({...draft, category: event.target.value})}>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>صوت المنبه
              <SoundSelectField value={draft.soundId} onChange={id => setDraft({...draft, soundId: id})}/>
            </label>
          </div>

          <label className="notif-alarm-mode">
            <input
              type="checkbox"
              checked={draft.alarmMode}
              onChange={event => setDraft({...draft, alarmMode: event.target.checked})}
            />
            <span>نمط منبه (رنين متكرر نحو دقيقة)</span>
          </label>
          {draft.alarmMode && <p className="muted notif-alarm-mode-hint">على الهاتف يرنّ المنبه نحو دقيقة، ويتوقف بزر الإيقاف أو التأجيل أو بزر الشاشة. مغلق افتراضيًا.</p>}

          {goals.length > 0 && (
            <label>ربط بهدف (اختياري)
              <select
                value={draft.linkedGoalId ?? ''}
                onChange={event => setDraft({...draft, linkedGoalId: event.target.value || undefined})}
              >
                <option value="">بلا ربط</option>
                {goals.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
              </select>
            </label>
          )}

          {error && <p role="alert" className="notif-error">{error}</p>}

          <div className="notif-form-actions">
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : draft.id ? 'حفظ التعديل' : 'إضافة المنبه'}
            </button>
            <button
              type="button"
              className="soft-btn"
              onClick={() => void testReminderAlert(draft.soundId, draft.title)}
            >
              <Send size={15}/> تجربة الصوت والتنبيه
            </button>
            <button
              type="button"
              className="soft-btn"
              onClick={() => {
                setDraft(null);
                setError('');
              }}
            >
              إلغاء
            </button>
          </div>
        </form>
      )}

      {!editing && saved.length === 0 && (
        <div className="notif-empty">
          <Bell size={20} aria-hidden="true"/>
          <div>
            <strong>لا توجد منبهات شخصية بعد</strong>
            <p className="muted small">ابدأ من قالب جاهز أو أضف منبهًا جديدًا.</p>
          </div>
        </div>
      )}

      {!editing && saved.length > 0 && (
        <ul className="notif-reminder-list">
          {saved.map(reminder => {
            const info = clockReadout(reminder, now);
            const confirmOpen = confirmDeleteId === reminder.id;
            return (
              <li key={reminder.id} className={`notif-reminder-card${reminder.enabled ? '' : ' paused'}`}>
                <div className="notif-reminder-top">
                  <div className="notif-reminder-main">
                    <div className="notif-reminder-title-row">
                      <span className="notif-reminder-clock" dir="ltr">{info.clock}</span>
                      <strong>{reminder.title}</strong>
                    </div>
                    <small className="notif-reminder-meta">
                      {recurrenceHint(reminder)} · {CATEGORY_LABELS[reminder.category] ?? reminder.category}
                      {reminder.alarm_mode ? ' · نمط منبه' : ''}
                      {reminder.description ? ` · ${reminder.description}` : ''}
                    </small>
                    <small className={`notif-reminder-due${info.isSnoozed ? ' snoozed' : ''}`}>
                      <CalendarClock size={13} aria-hidden="true"/> {info.dueText}
                    </small>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={reminder.enabled}
                    aria-label={reminder.enabled ? `إيقاف ${reminder.title}` : `تشغيل ${reminder.title}`}
                    className={`notif-power-switch${reminder.enabled ? ' on' : ''}`}
                    disabled={busy}
                    onClick={() => void toggle(reminder)}
                  >
                    <Power size={15} aria-hidden="true"/>
                    <span>{reminder.enabled ? 'مفعّل' : 'متوقف'}</span>
                  </button>
                </div>

                <div className="notif-reminder-actions">
                  <button
                    type="button"
                    className="soft-btn"
                    disabled={busy}
                    onClick={() => openDraft(draftFromReminder(reminder))}
                    aria-label={`تعديل ${reminder.title}`}
                  >
                    <PencilLine size={15}/> <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    className="soft-btn"
                    disabled={busy}
                    onClick={() => void snooze(reminder)}
                    aria-label={`تأجيل ${reminder.title} 10 دقائق`}
                  >
                    <Clock3 size={15}/> <span>تأجيل ١٠ د</span>
                  </button>
                  <button
                    type="button"
                    className="soft-btn"
                    disabled={busy}
                    onClick={() => void duplicate(reminder)}
                    aria-label={`نسخ ${reminder.title}`}
                  >
                    <Copy size={15}/> <span>نسخ</span>
                  </button>
                  <button
                    type="button"
                    className="soft-btn danger"
                    disabled={busy}
                    onClick={() => setConfirmDeleteId(confirmOpen ? null : reminder.id)}
                    aria-label={`حذف ${reminder.title}`}
                  >
                    <Trash2 size={15}/> <span>حذف</span>
                  </button>
                </div>

                {confirmOpen && (
                  <div className="notif-confirm notif-inline-confirm" role="alertdialog" aria-label={`تأكيد حذف ${reminder.title}`}>
                    <p>هل تريد حذف منبه «{reminder.title}» نهائيًا؟</p>
                    <div className="notif-confirm-actions">
                      <button type="button" className="outline-danger" disabled={busy} onClick={() => void remove(reminder)}>
                        تأكيد الحذف
                      </button>
                      <button type="button" className="soft-btn" onClick={() => setConfirmDeleteId(null)}>
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!editing && (
        <div className="notif-templates">
          <div className="notif-templates-head">
            <h4><Sparkles size={15}/> قوالب يومية جاهزة</h4>
          </div>
          <div className="notif-template-grid">
            {TEMPLATES.map(template => (
              <button
                type="button"
                key={template.title}
                className="notif-template"
                onClick={() => {
                  openDraft({
                    ...emptyDraft(),
                    title: template.title,
                    description: template.description,
                    time: template.time,
                    category: template.category,
                    recurrence: 'daily',
                    date: todayLocalYMD(),
                  });
                }}
              >
                <span className="notif-template-top">
                  <strong>{template.title}</strong>
                  <span className="notif-template-time" dir="ltr">{template.time}</span>
                </span>
                <small>{template.description}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
