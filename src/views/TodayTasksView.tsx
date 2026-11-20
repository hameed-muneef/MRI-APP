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
import {NOTIFICATIONS_CHANGED_EVENT, notifyNativePrefsChanged} from '../notifications/native-prayer-scheduler';
import {loadPrefs, savePrefs} from '../notifications/prefs-store';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  getTaskNotificationSettings,
  type NotificationChannel,
  type NotificationPreference,
  type TaskNotificationSettings,
} from '../notifications/types';
import {channelLabel} from './notifications/SoundPanel';

type Filter = 'today' | 'tomorrow' | 'upcoming' | 'overdue' | 'unscheduled';

const LEAD_OPTIONS = [
  {value: 0, label: 'عند الموعد فقط (0 د)'},
  {value: 5, label: 'قبل 5 دقائق'},
  {value: 10, label: 'قبل 10 دقائق'},
  {value: 15, label: 'قبل 15 دقيقة'},
  {value: 30, label: 'قبل 30 دقيقة'},
  {value: 60, label: 'قبل ساعة (60 د)'},
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
      const msg = 'حُفظت إعدادات تنبيهات المهام المجدولة';
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
      const msg = 'تم تفعيل إشعارات الدفع (Push) للمهام المجدولة';
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

  const globalPaused = !prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.task === false;
  const activeSummary =
    globalPaused || !taskSettings.enabled
      ? 'تنبيهات المهام موقوفة حاليًا'
      : taskSettings.remind_before_minutes > 0
        ? `تنبيه دفع قبل الموعد بـ ${taskSettings.remind_before_minutes} دقيقة${taskSettings.notify_at_time ? ' وعند الموعد' : ''}`
        : 'تنبيه دفع عند حلول موعد المهمة';

  return (
    <div className="today-tasks-view">
      <div className="page-intro">
        <span className="eyebrow">حياتي مع الله</span>
        <h1><CalendarClock size={26}/> مركز المهام</h1>
        <p>تجتمع هنا الاستحقاقات من خططك الشخصية وأهدافك.</p>
        <p className="muted small">المهام الدورية بلا يوم محدد لا تظهر ضمن اليوم أو الغد أو المتأخرة حتى تُجدول.</p>
      </div>

      <section className="panel task-notif-banner" aria-label="إدارة تنبيهات الدفع للمهام المجدولة">
        <div className="task-notif-banner-head">
          <div className="task-notif-banner-status">
            <BellRing size={19}/>
            <div>
              <strong>تنبيهات اقتراب المهام المجدولة (Push)</strong>
              <p className="muted small">
                {activeSummary}
                {isBrowserNotificationSupported() && permission !== 'granted' && ' · إذن المتصفح غير مفعّل بعد'}
              </p>
            </div>
          </div>
          <div className="task-notif-banner-actions">
            {isBrowserNotificationSupported() && permission === 'default' && (
              <button type="button" className="primary" onClick={() => void handleEnablePush()}>
                <Bell size={15}/> تفعيل إشعارات الدفع
              </button>
            )}
            <button
              type="button"
              className="soft-btn"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen(open => !open)}
            >
              <SlidersHorizontal size={15}/> {configOpen ? 'إخفاء التخصيص' : 'تخصيص التنبيهات'}
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
            {isBrowserNotificationSupported() && permission === 'denied' && (
              <p className="muted small">إشعارات الدفع محظورة في إعدادات المتصفح؛ فعّل الإذن من رمز القفل بجانب عنوان الصفحة.</p>
            )}
            <label className="notif-switch">
              <input
                type="checkbox"
                checked={taskSettings.enabled}
                onChange={event => patchTaskSettings({enabled: event.target.checked})}
              />
              تفعيل تنبيهات الدفع للمهام المجدولة
            </label>
            <fieldset disabled={!taskSettings.enabled} className="task-notif-quick-grid">
              <label>
                وقت التنبيه قبل المهمة
                <select
                  aria-label="وقت التنبيه الافتراضي قبل المهمة"
                  value={LEAD_OPTIONS.some(o => o.value === taskSettings.remind_before_minutes) ? String(taskSettings.remind_before_minutes) : 'custom'}
                  onChange={event => {
                    if (event.target.value !== 'custom') {
                      patchTaskSettings({remind_before_minutes: Number(event.target.value)});
                    }
                  }}
                >
                  {LEAD_OPTIONS.map(opt => (
                    <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
                  ))}
                  {!LEAD_OPTIONS.some(o => o.value === taskSettings.remind_before_minutes) && (
                    <option value="custom">مخصص ({taskSettings.remind_before_minutes} د)</option>
                  )}
                </select>
              </label>
              <label>
                أو أدخل الدقائق (0–180)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={180}
                  value={taskSettings.remind_before_minutes}
                  onChange={event => {
                    const parsed = Math.round(Number(event.target.value));
                    patchTaskSettings({
                      remind_before_minutes: Number.isFinite(parsed) ? Math.max(0, Math.min(180, parsed)) : 0,
                    });
                  }}
                />
              </label>
              <label>
                قناة التوصيل
                <select
                  value={taskSettings.channel}
                  onChange={event => patchTaskSettings({channel: event.target.value as NotificationChannel})}
                >
                  {(['both', 'system', 'in_app'] as NotificationChannel[]).map(key => (
                    <option key={key} value={key}>{channelLabel(key)}</option>
                  ))}
                </select>
              </label>
            </fieldset>
            <label className="notif-switch">
              <input
                type="checkbox"
                disabled={!taskSettings.enabled}
                checked={taskSettings.notify_at_time}
                onChange={event => patchTaskSettings({notify_at_time: event.target.checked})}
              />
              التنبيه أيضًا عند حلول وقت المهمة بالضبط
            </label>
            <label className="notif-switch">
              <input
                type="checkbox"
                disabled={!taskSettings.enabled}
                checked={taskSettings.include_initial}
                onChange={event => patchTaskSettings({include_initial: event.target.checked})}
              />
              تضمين المواعيد المبدئية قبل التأكيد
            </label>
            <div className="task-notif-quick-save">
              <button
                type="button"
                className="primary"
                disabled={savingPrefs || !prefsDirty}
                onClick={() => void saveTaskNotificationConfig()}
              >
                {savingPrefs ? 'جارٍ الحفظ…' : 'حفظ التخصيص'}
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
              return (
                <li key={item.id}>
                  <div className="today-task-info">
                    <strong>{item.title}</strong>
                    <span className="today-task-source">
                      {isGoal ? 'خطوة هدف' : `مهمة ${item.period === 'daily' ? 'يومية' : item.period === 'weekly' ? 'أسبوعية' : 'شهرية'}`} · المصدر: {itemSource}
                    </span>
                    {'scheduledDate' in item && item.scheduledDate && (
                      <small><Clock3 size={13}/>الاستحقاق: {item.scheduledDate}</small>
                    )}
                    {schedule?.initialDate && (
                      <small>الموعد المبدئي: {schedule.initialDate}{schedule.initialTime ? ` · ${timeOfDayClock12(schedule.initialTime)}` : ''}</small>
                    )}
                    {schedule?.confirmedDate && (
                      <small>الموعد المؤكد: {schedule.confirmedDate}{schedule.confirmedTime ? ` · ${timeOfDayClock12(schedule.confirmedTime)}` : ''}</small>
                    )}
                    {hasSchedule && (
                      <small className={itemNotifyEnabled ? 'task-notify-meta active' : 'task-notify-meta muted'}>
                        {itemNotifyEnabled ? <Bell size={13}/> : <BellOff size={13}/>}
                        {!itemNotifyEnabled
                          ? 'التنبيه موقوف لهذه المهمة'
                          : effectiveLead > 0
                            ? `تنبيه دفع قبل الموعد بـ ${effectiveLead} د`
                            : 'تنبيه دفع عند الموعد'}
                      </small>
                    )}
                  </div>
                  <div className="today-task-actions">
                    <button className="soft-btn" onClick={() => (isGoal ? completeGoal(item.goalId, item.stepId) : complete(item as Task))}>
                      <CheckCircle2 size={15}/>إنجاز
                    </button>
                    <label>
                      اليوم المقترح
                      <input
                        type="date"
                        aria-label={`اليوم المقترح لـ ${item.title}`}
                        min={now}
                        value={dateByTask[item.id] ?? schedule?.initialDate ?? schedule?.confirmedDate ?? (filter === 'tomorrow' ? tomorrow : now)}
                        onChange={event => setDateByTask(current => ({...current, [item.id]: event.target.value}))}
                      />
                    </label>
                    <label>
                      الوقت
                      <TaskTimeSelect
                        value={timeByTask[item.id] ?? (timeOfTask(taskSchedules[item.id]) || currentTime())}
                        label={`الوقت المختار لـ ${item.title}`}
                        onChange={value => setTimeByTask(current => ({...current, [item.id]: value}))}
                      />
                    </label>
                    <label>
                      تنبيه قبل الموعد
                      <select
                        aria-label={`تنبيه قبل الموعد لـ ${item.title}`}
                        value={itemLeadMinutes === undefined ? '' : String(itemLeadMinutes)}
                        onChange={event => changeItemLeadMinutes(item.id, item.title, event.target.value)}
                      >
                        <option value="">الافتراضي ({taskSettings.remind_before_minutes} د)</option>
                        {LEAD_OPTIONS.map(opt => (
                          <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="soft-btn"
                      aria-pressed={itemNotifyEnabled}
                      title={itemNotifyEnabled ? 'إيقاف التنبيه لهذه المهمة' : 'تفعيل التنبيه لهذه المهمة'}
                      onClick={() => toggleItemNotify(item.id, item.title)}
                    >
                      {itemNotifyEnabled ? <Bell size={15}/> : <BellOff size={15}/>}
                      {itemNotifyEnabled ? 'التنبيه مفعّل' : 'التنبيه موقوف'}
                    </button>
                    <button className="soft-btn" onClick={() => saveInitial(item.id, item.title, itemSource)}>حفظ مبدئي</button>
                    <button className="primary" onClick={() => confirmSchedule(item.id, item.title, itemSource)}>تأكيد الجدولة</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <button className="soft-btn" onClick={onBack}>العودة إلى يومي مع الله</button>
      </section>
    </div>
  );
}
