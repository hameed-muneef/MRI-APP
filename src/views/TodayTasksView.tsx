import {useEffect, useMemo, useState} from 'react';
import {Bell, BellOff, BellRing, CalendarClock, CheckCircle2, Clock3, SlidersHorizontal} from 'lucide-react';
import {type Task, type TaskSchedule, today} from '../app-state';
import type {Goal} from '../goal-plan';
import {goalStepCompletionKey, goalStepDueDate, goalStepOccurrence, goalSteps, isGoalDateInRange} from '../goal-plan';
import {TaskTimeSelect, timeOfDayClock12} from '../TaskTimeSelect';
import '../weekly-planning.css';
import {isTaskDone, markTaskDone} from '../task-periods';
import {
  getBrowserPermission,
  isBrowserNotificationSupported,
  requestBrowserPermission,
} from '../notifications/delivery';
import {NOTIFICATIONS_CHANGED_EVENT, isNativePlatform, notifyNativePrefsChanged} from '../notifications/native-prayer-scheduler';
import {loadPrefs, savePrefs} from '../notifications/prefs-store';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  getTaskNotificationSettings,
  type NotificationChannel,
  type NotificationPreference,
  type TaskNotificationSettings,
} from '../notifications/types';
import {channelDescription, channelLabel} from './notifications/SoundPanel';
import {useBackHandler} from '../navigation/useBackHandler';

type Filter = 'today' | 'tomorrow' | 'upcoming' | 'overdue' | 'unscheduled';

const LEAD_OPTIONS = [
  {value: 0, label: 'عند الموعد', fullLabel: 'عند الموعد فقط (0 د)'},
  {value: 5, label: 'قبل 5 د', fullLabel: 'قبل 5 دقائق'},
  {value: 10, label: 'قبل 10 د', fullLabel: 'قبل 10 دقائق'},
  {value: 15, label: 'قبل 15 د', fullLabel: 'قبل 15 دقيقة'},
  {value: 30, label: 'قبل 30 د', fullLabel: 'قبل 30 دقيقة'},
  {value: 60, label: 'قبل ساعة', fullLabel: 'قبل ساعة (60 د)'},
];

const dateAfter = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return new Intl.DateTimeFormat('en-CA').format(value);
};

type Props = {
  tasks: Task[];
  goals: Goal[];
  taskSchedules: Record<string, TaskSchedule>;
  onTaskSchedules: (schedules: Record<string, TaskSchedule>) => void;
  onTasks: (tasks: Task[]) => void;
  onGoals: (goals: Goal[]) => void;
  onQuranTaskComplete?: (taskId: string) => void;
  onOpenHifzTask?: (hifz: NonNullable<Task['hifz']>) => void;
  onOpenPlanTask?: (task: Task) => void;
  onBack: () => void;
  notify?: (message: string) => void;
  onOpenNotificationSettings?: () => void;
};

export default function TodayTasksView({
  tasks,
  goals,
  taskSchedules,
  onTaskSchedules,
  onTasks,
  onGoals,
  onQuranTaskComplete,
  onOpenHifzTask,
  onOpenPlanTask,
  onBack,
  notify,
  onOpenNotificationSettings,
}: Props) {
  const [filter, setFilter] = useState<Filter>('today');
  const [timeByTask, setTimeByTask] = useState<Record<string, string>>({});
  const [dateByTask, setDateByTask] = useState<Record<string, string>>({});
  const [notifyDraftByTask, setNotifyDraftByTask] = useState<Record<string, boolean>>({});
  const [leadDraftByTask, setLeadDraftByTask] = useState<Record<string, number | undefined>>({});
  const [notice, setNotice] = useState('');

  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  const [configOpen, setConfigOpen] = useState(false);
  useBackHandler(() => setConfigOpen(false), configOpen);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(() => getBrowserPermission());

  useEffect(() => {
    let active = true;
    const sync = () => {
      setPermission(getBrowserPermission());
      void loadPrefs().then(({prefs: loaded}) => {
        if (active) setPrefs(loaded);
      });
    };
    sync();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    return () => {
      active = false;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, sync);
    };
  }, []);

  const taskSettings = getTaskNotificationSettings(prefs);

  const patchTaskSettings = (patch: Partial<TaskNotificationSettings>) => {
    setPrefs(old => ({
      ...old,
      reminder_settings: {
        ...old.reminder_settings,
        task_notifications: {
          ...getTaskNotificationSettings(old),
          ...patch,
        },
      },
    }));
    setPrefsDirty(true);
  };

  const saveTaskNotificationConfig = async () => {
    setSavingPrefs(true);
    try {
      const {prefs: fresh} = await loadPrefs();
      const merged: NotificationPreference = {
        ...fresh,
        categories: {
          ...fresh.categories,
          task: true,
        },
        reminder_settings: {
          ...fresh.reminder_settings,
          task_notifications: getTaskNotificationSettings(prefs),
        },
      };
      await savePrefs(merged);
      setPrefs(merged);
      setPrefsDirty(false);
      notifyNativePrefsChanged();
      const msg = 'حُفظت إعدادات تذكير المهام المجدولة';
      setNotice(msg);
      notify?.(msg);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleEnablePush = async () => {
    const next = await requestBrowserPermission();
    setPermission(next);
    if (next === 'granted') {
      const msg = 'تم تفعيل إشعارات المتصفح للمهام المجدولة';
      setNotice(msg);
      notify?.(msg);
    } else if (next === 'denied') {
      const msg = 'المتصفح يحظر الإشعارات حاليًا؛ يمكنك السماح بها من إعدادات الموقع.';
      setNotice(msg);
      notify?.(msg);
    }
  };

  const now = today();
  const tomorrow = dateAfter(now, 1);
  const currentTime = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const timeOfTask = (schedule?: {initialTime?: string; confirmedTime?: string}) =>
    schedule?.confirmedTime ?? schedule?.initialTime ?? '';
  const afterTomorrow = dateAfter(tomorrow, 1);

  const matchesDateFilter = (date: string) =>
    filter === 'unscheduled'
      ? false
      : filter === 'today'
        ? date === now
        : filter === 'tomorrow'
          ? date === tomorrow
          : filter === 'upcoming'
            ? date > tomorrow
            : date < now;

  const items = useMemo(
    () =>
      tasks
        .filter(task => {
          if (isTaskDone(task)) return false;
          const savedDate = taskSchedules[task.id]?.confirmedDate ?? taskSchedules[task.id]?.initialDate;
          if (savedDate) return matchesDateFilter(savedDate);
          if (filter === 'unscheduled') return task.period !== 'daily' && !task.scheduledDate;
          if (filter === 'today') return task.period === 'daily' || task.scheduledDate === now;
          if (filter === 'tomorrow') return task.scheduledDate === tomorrow;
          return !!task.scheduledDate && task.scheduledDate < now;
        })
        .map(task => ({
          ...task,
          sourceLabel:
            task.period === 'daily'
              ? 'يومي مع الله'
              : task.period === 'weekly'
                ? 'المؤمن القوي · خطة أسبوعية'
                : 'المؤمن القوي · خطة شهرية',
        })),
    [tasks, filter, now, tomorrow, taskSchedules],
  );

  const goalTasks = goals.flatMap(goal =>
    goalSteps(goal).flatMap(step => {
      let dueDate = filter === 'today' ? now : filter === 'tomorrow' ? tomorrow : filter === 'upcoming' ? afterTomorrow : '';
      if (filter === 'overdue') {
        if (!isGoalDateInRange(goal, now)) return [];
        if (step.period === 'daily') {
          if (!goal.createdAt || goal.createdAt >= now) return [];
          dueDate = goal.createdAt;
        } else if (step.period === 'custom') {
          if (!step.customDate || step.customDate >= now) return [];
          dueDate = step.customDate;
        } else {
          const upcoming = goalStepDueDate(step, new Date(`${now}T12:00:00`));
          const previous = new Date(`${upcoming}T12:00:00`);
          if (step.period === 'weekly') previous.setDate(previous.getDate() - 7);
          else if (step.period === 'monthly') previous.setDate(0);
          else previous.setFullYear(previous.getFullYear() - 1);
          dueDate = new Intl.DateTimeFormat('en-CA').format(previous);
          if (dueDate >= now) return [];
        }
      } else if (filter === 'upcoming') {
        if (step.period === 'custom') {
          if (step.customDate && step.customDate > tomorrow) dueDate = step.customDate;
        } else {
          dueDate = goalStepDueDate(step, new Date(`${afterTomorrow}T12:00:00`));
        }
      }
      if (!dueDate || filter === 'unscheduled' || !goalStepOccurrence(goal, step, dueDate)) return [];
      const id = `goal:${goal.id}:${step.id}`;
      if (step.period !== 'custom' && step.period !== 'daily') {
        const saved = taskSchedules[id]?.confirmedDate ?? taskSchedules[id]?.initialDate;
        if (saved && saved !== dueDate) return [];
      }
      return [
        {
          id,
          title: step.title,
          period: 'goal' as const,
          scheduledDate: dueDate,
          sourceLabel: `المؤمن القوي · ${goal.title} · ${
            step.period === 'custom'
              ? 'تاريخ مخصص'
              : step.period === 'daily'
                ? 'يومي'
                : step.period === 'weekly'
                  ? 'أسبوعي'
                  : step.period === 'monthly'
                    ? 'شهري'
                    : 'سنوي'
          }${filter === 'overdue' ? ' · متأخرة' : ''}`,
          goalId: goal.id,
          stepId: step.id,
        },
      ];
    }),
  );

  const matchesConfirmedDate = (item: {id: string}) => {
    if (item.id.startsWith('goal:')) return true;
    const date = taskSchedules[item.id]?.confirmedDate ?? taskSchedules[item.id]?.initialDate;
    if (!date) return true;
    return matchesDateFilter(date);
  };

  const allItems = [...items, ...goalTasks].filter(matchesConfirmedDate);

  const source = (task: Task & {sourceLabel?: string}) =>
    task.sourceLabel ??
    (task.period === 'daily'
      ? 'يومي مع الله'
      : task.period === 'weekly'
        ? 'المؤمن القوي · الخطة الأسبوعية'
        : 'المؤمن القوي · الخطة الشهرية');

  const complete = (task: Task) => {
    onTasks(tasks.map(item => (item.id === task.id ? markTaskDone(item, true) : item)));
    if (task.id.startsWith('quran:')) onQuranTaskComplete?.(task.id);
    notifyNativePrefsChanged();
  };

  const completeGoal = (goalId: string, stepId: string) => {
    onGoals(
      goals.map(goal =>
        goal.id === goalId
          ? {
              ...goal,
              steps: goalSteps(goal).map(step =>
                step.id === stepId ? {...step, done: {...step.done, [goalStepCompletionKey(step)]: true}} : step,
              ),
            }
          : goal,
      ),
    );
    notifyNativePrefsChanged();
  };

  const saveInitial = (id: string, title: string, sourceLabel: string) => {
    const existing = taskSchedules[id];
    const date = dateByTask[id] ?? existing?.initialDate ?? existing?.confirmedDate ?? (filter === 'tomorrow' ? tomorrow : now);
    const time = timeByTask[id] ?? (timeOfTask(existing) || currentTime());
    const notifyEnabled = notifyDraftByTask[id] ?? existing?.notifyEnabled ?? true;
    const remindBeforeMinutes = id in leadDraftByTask ? leadDraftByTask[id] : existing?.remindBeforeMinutes;
    onTaskSchedules({
      ...taskSchedules,
      [id]: {
        ...existing,
        title,
        sourceLabel,
        initialDate: date,
        initialTime: time,
        initialSlot: undefined,
        confirmedSlot: undefined,
        notifyEnabled,
        remindBeforeMinutes,
      },
    });
    notifyNativePrefsChanged();
    setNotice(`حُفظ الموعد المبدئي لـ «${title}» بتاريخ ${date} الساعة ${timeOfDayClock12(time)}. لم يُعتمد بعد.`);
  };

  const confirmSchedule = (id: string, title: string, sourceLabel: string) => {
    const existing = taskSchedules[id];
    const date = dateByTask[id] ?? existing?.initialDate ?? existing?.confirmedDate ?? (filter === 'tomorrow' ? tomorrow : now);
    const time = timeByTask[id] ?? (timeOfTask(existing) || currentTime());
    const notifyEnabled = notifyDraftByTask[id] ?? existing?.notifyEnabled ?? true;
    const remindBeforeMinutes = id in leadDraftByTask ? leadDraftByTask[id] : existing?.remindBeforeMinutes;
    onTaskSchedules({
      ...taskSchedules,
      [id]: {
        ...existing,
        title,
        sourceLabel,
        initialDate: date,
        initialTime: time,
        confirmedDate: date,
        confirmedTime: time,
        initialSlot: undefined,
        confirmedSlot: undefined,
        notifyEnabled,
        remindBeforeMinutes,
      },
    });
    notifyNativePrefsChanged();
    setNotice(`تم تأكيد «${title}» ليوم ${date} الساعة ${timeOfDayClock12(time)}.`);
  };

  const toggleItemNotify = (id: string, title: string) => {
    const existing = taskSchedules[id];
    const current = notifyDraftByTask[id] ?? existing?.notifyEnabled ?? true;
    const next = !current;
    setNotifyDraftByTask(prev => ({...prev, [id]: next}));
    if (existing) {
      onTaskSchedules({
        ...taskSchedules,
        [id]: {...existing, notifyEnabled: next},
      });
      notifyNativePrefsChanged();
      setNotice(next ? `تم تفعيل تنبيه «${title}».` : `تم إيقاف تنبيه «${title}».`);
    }
  };

  const changeItemLeadMinutes = (id: string, title: string, rawValue: string) => {
    const parsed = rawValue === '' ? undefined : Number(rawValue);
    setLeadDraftByTask(prev => ({...prev, [id]: parsed}));
    const existing = taskSchedules[id];
    if (existing) {
      onTaskSchedules({
        ...taskSchedules,
        [id]: {...existing, remindBeforeMinutes: parsed},
      });
      notifyNativePrefsChanged();
      setNotice(
        parsed === undefined
          ? `استعاد «${title}» توقيت التنبيه الافتراضي.`
          : parsed === 0
            ? `سيُنبّه لـ «${title}» عند حلول الموعد فقط.`
            : `سيُنبّه لـ «${title}» قبل الموعد بـ ${parsed} دقيقة.`,
      );
    }
  };

  const nativeApp = isNativePlatform();
  const browserSupported = !nativeApp && isBrowserNotificationSupported();
  const globalPaused = !prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.task === false;
  const activeSummary =
    globalPaused || !taskSettings.enabled
      ? 'تذكير المهام موقوف حاليًا'
      : taskSettings.remind_before_minutes > 0
        ? `تذكير قبل الموعد بـ ${taskSettings.remind_before_minutes} دقيقة${taskSettings.notify_at_time ? ' وعند الموعد' : ''}`
        : 'تذكير عند حلول موعد المهمة';

  return (
    <div className="today-tasks-view">
      <div className="page-intro">
        <span className="eyebrow">حياتي مع الله</span>
        <h1><CalendarClock size={26}/> مركز المهام</h1>
        <p>تجتمع هنا الاستحقاقات من خططك الشخصية وأهدافك.</p>
        <p className="muted small">المهام الدورية بلا يوم محدد لا تظهر ضمن اليوم أو الغد أو المتأخرة حتى تُجدول.</p>
      </div>

      <section className="panel task-notif-banner" aria-label="إعدادات تذكير المهام المجدولة">
        <div className="task-notif-banner-head">
          <div className="task-notif-banner-status">
            <BellRing size={19}/>
            <div>
              <strong>تذكير المهام المجدولة</strong>
              <p className="muted small">
                {activeSummary}
                {browserSupported && permission !== 'granted' && ' · إشعارات المتصفح غير مفعّلة'}
              </p>
            </div>
          </div>
          <div className="task-notif-banner-actions">
            {browserSupported && permission === 'default' && (
              <button type="button" className="primary" onClick={() => void handleEnablePush()}>
                <Bell size={15}/> تفعيل إشعارات المتصفح
              </button>
            )}
            <button
              type="button"
              className="soft-btn"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen(open => !open)}
            >
              <SlidersHorizontal size={15}/> {configOpen ? 'إخفاء الإعدادات' : 'تخصيص التنبيهات'}
            </button>
            {onOpenNotificationSettings && (
              <button type="button" className="soft-btn" onClick={onOpenNotificationSettings}>
                الإعدادات الكاملة
              </button>
            )}
          </div>
        </div>

        {configOpen && (
          <div className="task-notif-quick-config">
            {browserSupported && permission === 'denied' && (
              <div className="task-perm-callout is-denied" role="note">
                <strong>إشعارات المتصفح محظورة حاليًا</strong>
                <p>
                  ستظل التنبيهات تظهر لك داخل التطبيق أثناء استخدامه. لتصلك خارج التطبيق أيضًا، فعّل إذن الإشعارات من إعدادات الموقع (رمز القفل بجانب عنوان الصفحة) ثم أعد التحميل.
                </p>
              </div>
            )}
            <label className="notif-switch">
              <input
                type="checkbox"
                checked={taskSettings.enabled}
                onChange={event => patchTaskSettings({enabled: event.target.checked})}
              />
              <span>تفعيل تذكير المهام المجدولة</span>
            </label>
            <fieldset disabled={!taskSettings.enabled} className="task-notif-quick-grid">
              <div className="task-quick-field">
                <span className="task-quick-label">متى يصلك التذكير قبل المهمة؟</span>
                <div className="task-preset-chips" role="group" aria-label="اختيارات سريعة لوقت التذكير">
                  {LEAD_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={taskSettings.remind_before_minutes === opt.value ? 'primary' : 'soft-btn'}
                      aria-pressed={taskSettings.remind_before_minutes === opt.value}
                      onClick={() => patchTaskSettings({remind_before_minutes: opt.value})}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <label className="task-custom-minutes">
                  <span>أو أدخل الدقائق يدويًا (0–180):</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={180}
                    aria-label="دقائق التذكير قبل المهمة (0 إلى 180)"
                    value={taskSettings.remind_before_minutes}
                    onChange={event => {
                      const parsed = Math.round(Number(event.target.value));
                      patchTaskSettings({
                        remind_before_minutes: Number.isFinite(parsed) ? Math.max(0, Math.min(180, parsed)) : 0,
                      });
                    }}
                  />
                </label>
              </div>
              <label className="task-quick-field">
                <span className="task-quick-label">طريقة وصول التنبيه</span>
                <select
                  value={taskSettings.channel}
                  onChange={event => patchTaskSettings({channel: event.target.value as NotificationChannel})}
                >
                  {(['both', 'system'] as NotificationChannel[]).map(key => (
                    <option key={key} value={key}>{channelLabel(key)}</option>
                  ))}
                </select>
                <small className="task-channel-hint">{channelDescription(taskSettings.channel)}</small>
              </label>
            </fieldset>
            <label className="notif-switch">
              <input
                type="checkbox"
                disabled={!taskSettings.enabled}
                checked={taskSettings.notify_at_time}
                onChange={event => patchTaskSettings({notify_at_time: event.target.checked})}
              />
              <span>إرسال تذكير إضافي عند حلول وقت المهمة بالضبط</span>
            </label>
            <label className="notif-switch">
              <input
                type="checkbox"
                disabled={!taskSettings.enabled}
                checked={taskSettings.include_initial}
                onChange={event => patchTaskSettings({include_initial: event.target.checked})}
              />
              <span>تذكير المهام ذات الموعد المبدئي أيضًا (قبل تأكيدها)</span>
            </label>
            <div className="task-notif-quick-save">
              <button
                type="button"
                className="primary"
                disabled={savingPrefs || !prefsDirty}
                onClick={() => void saveTaskNotificationConfig()}
              >
                {savingPrefs ? 'جارٍ الحفظ…' : prefsDirty ? 'حفظ التغييرات' : 'تم الحفظ'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="today-task-filters" role="tablist" aria-label="تصفية المهام">
          <button role="tab" aria-selected={filter === 'today'} className={filter === 'today' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('today'); setNotice('')}}>اليوم</button>
          <button role="tab" aria-selected={filter === 'tomorrow'} className={filter === 'tomorrow' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('tomorrow'); setNotice('')}}>غدًا</button>
          <button role="tab" aria-selected={filter === 'upcoming'} className={filter === 'upcoming' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('upcoming'); setNotice('')}}>القادمة</button>
          <button role="tab" aria-selected={filter === 'overdue'} className={filter === 'overdue' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('overdue'); setNotice('')}}>متأخرة</button>
          <button role="tab" aria-selected={filter === 'unscheduled'} className={filter === 'unscheduled' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('unscheduled'); setNotice('')}}>بلا موعد</button>
        </div>
        {notice && <p className="hint" role="status">{notice}</p>}
        {allItems.length === 0 ? (
          <p className="muted">لا توجد مهام غير منجزة في هذا القسم.</p>
        ) : (
          <ul className="today-task-list">
            {allItems.map(item => {
              const isGoal = 'goalId' in item;
              const itemSource = source(item as Task & {sourceLabel?: string});
              const schedule = taskSchedules[item.id];
              const itemNotifyEnabled = notifyDraftByTask[item.id] ?? schedule?.notifyEnabled ?? true;
              const itemLeadMinutes = item.id in leadDraftByTask ? leadDraftByTask[item.id] : schedule?.remindBeforeMinutes;
              const effectiveLead = itemLeadMinutes ?? taskSettings.remind_before_minutes;
              const hasSchedule = Boolean(schedule?.confirmedDate || schedule?.initialDate);
              const showMeta = Boolean(
                ('scheduledDate' in item && item.scheduledDate) ||
                  schedule?.confirmedDate ||
                  schedule?.initialDate ||
                  hasSchedule,
              );
              return (
                <li key={item.id} className="today-task-card">
                  <div className="today-task-head">
                    <div className="today-task-info">
                      <strong className="today-task-title">{item.title}</strong>
                      <span className="today-task-source">
                        <span>{isGoal ? 'خطوة هدف' : `مهمة ${item.period === 'daily' ? 'يومية' : item.period === 'weekly' ? 'أسبوعية' : 'شهرية'}`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{itemSource}</span>
                      </span>
                    </div>
                    {(item as Task).plan && onOpenPlanTask && <button type="button" className="soft-btn" onClick={() => onOpenPlanTask(item as Task)}>{(item as Task).plan!.kind === 'day' ? 'ابدأ مقرر اليوم' : 'ابدأ المراجعة'}</button>}
                    {(item as Task).hifz && onOpenHifzTask && <button type="button" className="soft-btn" onClick={() => onOpenHifzTask((item as Task).hifz!)}>ابدأ التسميع</button>}
                    <button
                      type="button"
                      className="today-task-complete-btn"
                      onClick={() => (isGoal ? completeGoal(item.goalId, item.stepId) : complete(item as Task))}
                    >
                      <CheckCircle2 size={16} aria-hidden="true"/>
                      <span>إنجاز</span>
                    </button>
                  </div>

                  {showMeta && (
                    <div className="today-task-meta">
                      {'scheduledDate' in item && item.scheduledDate && (
                        <span className="today-task-meta-item">
                          <Clock3 size={13} aria-hidden="true"/>
                          <span>الاستحقاق: {item.scheduledDate}</span>
                        </span>
                      )}
                      {schedule?.confirmedDate && (
                        <span className="today-task-meta-item is-confirmed">
                          <CalendarClock size={13} aria-hidden="true"/>
                          <span>مؤكد: {schedule.confirmedDate}{schedule.confirmedTime ? ` · ${timeOfDayClock12(schedule.confirmedTime)}` : ''}</span>
                        </span>
                      )}
                      {!schedule?.confirmedDate && schedule?.initialDate && (
                        <span className="today-task-meta-item">
                          <CalendarClock size={13} aria-hidden="true"/>
                          <span>مبدئي: {schedule.initialDate}{schedule.initialTime ? ` · ${timeOfDayClock12(schedule.initialTime)}` : ''}</span>
                        </span>
                      )}
                      {hasSchedule && (
                        <span className={`today-task-meta-item task-notify-meta ${itemNotifyEnabled ? 'active' : 'muted'}`}>
                          {itemNotifyEnabled ? <Bell size={13} aria-hidden="true"/> : <BellOff size={13} aria-hidden="true"/>}
                          <span>
                            {!itemNotifyEnabled
                              ? 'التنبيه موقوف'
                              : effectiveLead > 0
                                ? `تنبيه قبل ${effectiveLead} د`
                                : 'تنبيه عند الموعد'}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  <div className="today-task-schedule">
                    <div className="today-task-fields">
                      <label className="today-task-field today-task-field-date">
                        <span>اليوم المقترح</span>
                        <input
                          type="date"
                          aria-label={`اليوم المقترح لـ ${item.title}`}
                          min={now}
                          value={dateByTask[item.id] ?? schedule?.initialDate ?? schedule?.confirmedDate ?? (filter === 'tomorrow' ? tomorrow : now)}
                          onChange={event => setDateByTask(current => ({...current, [item.id]: event.target.value}))}
                        />
                      </label>

                      <label className="today-task-field today-task-field-time">
                        <span>الوقت</span>
                        <TaskTimeSelect
                          value={timeByTask[item.id] ?? (timeOfTask(taskSchedules[item.id]) || currentTime())}
                          label={`الوقت المختار لـ ${item.title}`}
                          onChange={value => setTimeByTask(current => ({...current, [item.id]: value}))}
                        />
                      </label>

                      <div className="today-task-alert-row">
                        <label className="today-task-field today-task-field-lead">
                          <span>تنبيه قبل الموعد</span>
                          <select
                            aria-label={`تنبيه قبل الموعد لـ ${item.title}`}
                            value={itemLeadMinutes === undefined ? '' : String(itemLeadMinutes)}
                            onChange={event => changeItemLeadMinutes(item.id, item.title, event.target.value)}
                          >
                            <option value="">الافتراضي ({taskSettings.remind_before_minutes} د)</option>
                            {LEAD_OPTIONS.map(opt => (
                              <option key={opt.value} value={String(opt.value)}>{opt.fullLabel}</option>
                            ))}
                          </select>
                        </label>

                        <button
                          type="button"
                          className={`today-task-notify-btn${itemNotifyEnabled ? ' is-on' : ''}`}
                          aria-pressed={itemNotifyEnabled}
                          aria-label={itemNotifyEnabled ? `إيقاف التنبيه لـ ${item.title}` : `تفعيل التنبيه لـ ${item.title}`}
                          title={itemNotifyEnabled ? 'إيقاف التنبيه لهذه المهمة' : 'تفعيل التنبيه لهذه المهمة'}
                          onClick={() => toggleItemNotify(item.id, item.title)}
                        >
                          {itemNotifyEnabled ? <Bell size={16} aria-hidden="true"/> : <BellOff size={16} aria-hidden="true"/>}
                          <span>{itemNotifyEnabled ? 'مفعّل' : 'موقوف'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="today-task-footer">
                      <button
                        type="button"
                        className="today-task-draft-btn"
                        onClick={() => saveInitial(item.id, item.title, itemSource)}
                      >
                        حفظ مبدئي
                      </button>
                      <button
                        type="button"
                        className="primary today-task-confirm-btn"
                        onClick={() => confirmSchedule(item.id, item.title, itemSource)}
                      >
                        تأكيد الجدولة
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="today-tasks-back">
          <button type="button" className="soft-btn" onClick={onBack}>العودة إلى يومي مع الله</button>
        </div>
      </section>
    </div>
  );
}
