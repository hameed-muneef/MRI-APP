import {Fragment, useEffect, useMemo, useRef, useState} from 'react';
import {Bell, BellOff, BellRing, CalendarClock, CheckCircle2, Clock3} from 'lucide-react';
import {type Task, type TaskSchedule, type Wird, today} from '../app-state';
import type {Goal} from '../goal-plan';
import {goalStepCompletionKey, goalStepDueDate, goalStepOccurrence, goalSteps, isGoalDateInRange} from '../goal-plan';
import {TaskTimeSelect, timeOfDayClock12} from '../TaskTimeSelect';
import '../weekly-planning.css';
import {isTaskDone, markTaskDone} from '../task-periods';
import {NOTIFICATIONS_CHANGED_EVENT, notifyNativePrefsChanged} from '../notifications/native-prayer-scheduler';
import {loadPrefs} from '../notifications/prefs-store';
import {
  DEFAULT_NOTIFICATION_PREFERENCE,
  getTaskNotificationSettings,
  type NotificationPreference,
} from '../notifications/types';
import type {CourseCoach} from '../coach/course';
import {buildNextUp} from '../next-up';
import type {CoachSettings} from '../coach/types';
import type {WirdWithCoach} from '../coach/habit';
import type {AchievementEntry} from '../achievement/log';
import type {DayPlan} from '../DayPlanner';
import type {DayRecords} from '../day-tracking';
import type {MemorizationPassage} from '../quran/types';

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
  courseCoach?: CourseCoach;
  coachSettings?: CoachSettings;
  wirds?: Wird[];
  prayers?: Record<string, string>;
  dayPlan?: DayPlan;
  dayRecords?: DayRecords;
  achievementLog?: AchievementEntry[];
  quranPassages?: MemorizationPassage[];
  onCourseCoach?: (coach: CourseCoach) => void;
  onCoachSettings?: (settings: CoachSettings) => void;
  onCompleteWird?: (wirdId: string) => void;
  onCompletePlanDay?: (task: Task) => Promise<'advanced' | 'stale' | 'failed'>;
  onUpdateWird?: (wird: WirdWithCoach) => void;
  onOpenQuran?: () => void;
  onOpenWirds?: () => void;
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
  onOpenNotificationSettings,
  onCompletePlanDay,
}: Props) {
  const [filter, setFilter] = useState<Filter>('today');
  const [timeByTask, setTimeByTask] = useState<Record<string, string>>({});
  const [dateByTask, setDateByTask] = useState<Record<string, string>>({});
  const [notifyDraftByTask, setNotifyDraftByTask] = useState<Record<string, boolean>>({});
  const [leadDraftByTask, setLeadDraftByTask] = useState<Record<string, number | undefined>>({});
  const [alarmDraftByTask, setAlarmDraftByTask] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<{label: string; before?: Task[]; beforeGoals?: Goal[]} | null>(null);
  const [confirmDone, setConfirmDone] = useState<Task | null>(null);

  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);

  useEffect(() => {
    let active = true;
    const sync = () => {
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
            task.plan && task.sourceLabel
              ? task.sourceLabel
              : task.period === 'daily'
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

  const baseItems = [...items, ...goalTasks].filter(matchesConfirmedDate);

  // «الأقرب الآن» (النظام الذكي): أقرب ٣ مهام من الوقت الحالي، حية تتحدّث كل ٢٠ ثانية. ترتيب وعرض فقط.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 20000);
    return () => window.clearInterval(id);
  }, []);
  const nextUpRows = useMemo(() => {
    if (filter !== 'today') return [];
    return buildNextUp(
      baseItems.map(item => {
        const sch = taskSchedules[item.id];
        return {id: item.id, time: sch?.confirmedTime ?? sch?.initialTime ?? ''};
      }),
      new Date(clock),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, baseItems.map(i => i.id).join('|'), taskSchedules, clock]);
  const nextUpById = new Map(nextUpRows.map(row => [row.id, row]));
  const nextUpIds = nextUpRows.map(row => row.id);
  const allItems = [
    ...nextUpIds.map(id => baseItems.find(item => item.id === id)!).filter(Boolean),
    ...baseItems.filter(item => !nextUpById.has(item.id)),
  ];

  const source = (task: Task & {sourceLabel?: string}) =>
    task.sourceLabel ??
    (task.period === 'daily'
      ? 'يومي مع الله'
      : task.period === 'weekly'
        ? 'المؤمن القوي · الخطة الأسبوعية'
        : 'المؤمن القوي · الخطة الشهرية');

  // مقرر خطة الحفظ أو مهمة تسميع: الإنجاز اليدوي يقدّم الخطة ويسجّل الإنجاز، فيُطلب تأكيد بدل التراجع.
  const needsConfirm = (task: Task) => task.plan?.kind === 'day' || Boolean(task.hifz);
  const confirmTriggerRef = useRef<HTMLElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmBoxRef = useRef<HTMLDivElement | null>(null);
  const requestComplete = (task: Task) => {
    if (needsConfirm(task)) {
      confirmTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setUndo(null);
      setConfirmDone(task);
      setNotice('');
      return;
    }
    complete(task);
  };
  const closeConfirm = () => {
    setConfirmDone(null);
    const trigger = confirmTriggerRef.current;
    confirmTriggerRef.current = null;
    if (trigger && trigger.isConnected) trigger.focus();
  };
  useEffect(() => {
    if (!confirmDone) return;
    confirmBoxRef.current?.scrollIntoView({block: 'center'});
    confirmButtonRef.current?.focus();
  }, [confirmDone]);
  const confirmComplete = async (task: Task) => {
    setConfirmDone(null);
    setUndo(null);
    confirmTriggerRef.current = null;
    if (task.plan?.kind === 'day') {
      const result = onCompletePlanDay ? await onCompletePlanDay(task) : 'failed';
      if (result === 'stale') {
        setNotice(`لم يتغيّر شيء: «${task.title}» لم يعد مقرر اليوم الحالي في الخطة.`);
        return;
      }
      if (result === 'failed') {
        setNotice('تعذّر تقديم الخطة، فلم يتغيّر شيء. حاول مرة أخرى.');
        return;
      }
    }
    // مهمة مقرر اليوم تُزال تلقائيًا بعد تقدّم الخطة؛ لا نكتب قائمة المهام القديمة فوقها.
    if (task.plan?.kind !== 'day') onTasks(tasks.map(item => (item.id === task.id ? markTaskDone(item, true) : item)));
    notifyNativePrefsChanged();
    setNotice(task.plan?.kind === 'day'
      ? `اعتُبر «${task.title}» منجزًا وتقدّمت الخطة. لم تُجدول مراجعة لأن جلسة التسميع لم تُجرَ.`
      : `اعتُبرت «${task.title}» منجزة. لم تُسجَّل جلسة تسميع ولم تُجدول مراجعة.`);
  };

  const complete = (task: Task) => {
    setUndo({label: task.title, before: tasks});
    onTasks(tasks.map(item => (item.id === task.id ? markTaskDone(item, true) : item)));
    if (task.id.startsWith('quran:')) onQuranTaskComplete?.(task.id);
    notifyNativePrefsChanged();
  };

  const completeGoal = (goalId: string, stepId: string) => {
    setUndo({label: goals.find(g => g.id === goalId)?.title ?? 'خطوة الهدف', beforeGoals: goals});
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
    const alarmMode = alarmDraftByTask[id] ?? existing?.alarmMode === true;
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
        alarmMode: alarmMode ? true : undefined,
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
    const alarmMode = alarmDraftByTask[id] ?? existing?.alarmMode === true;
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
        alarmMode: alarmMode ? true : undefined,
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
    } else {
      setNotice(next ? `سيُفعَّل تنبيه «${title}» عند حفظ موعده.` : `سيُوقَف تنبيه «${title}» عند حفظ موعده.`);
    }
  };

  const toggleItemAlarm = (id: string, title: string) => {
    const existing = taskSchedules[id];
    const next = !(alarmDraftByTask[id] ?? existing?.alarmMode === true);
    setAlarmDraftByTask(prev => ({...prev, [id]: next}));
    if (existing) {
      onTaskSchedules({...taskSchedules, [id]: {...existing, alarmMode: next ? true : undefined}});
      notifyNativePrefsChanged();
      setNotice(next ? `سيرنّ تنبيه «${title}» بنمط منبه على الهاتف.` : `عاد تنبيه «${title}» إلى الإشعار العادي.`);
    } else {
      setNotice(next ? `سيُفعَّل نمط المنبه لـ «${title}» عند حفظ موعده.` : `لن يُفعَّل نمط المنبه لـ «${title}».`);
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
      ? 'تذكير المهام موقوف حاليًا'
      : taskSettings.remind_before_minutes > 0
        ? `تذكير قبل الموعد بـ ${taskSettings.remind_before_minutes} دقيقة${taskSettings.notify_at_time ? ' وعند الموعد' : ''}`
        : 'تذكير عند حلول موعد المهمة';

  return (
    <div className="today-tasks-view">
      <h1 className="today-tasks-sr-title"><CalendarClock size={1} aria-hidden="true"/> مركز المهام</h1>

      <button type="button" className="soft-btn task-notif-link" onClick={() => onOpenNotificationSettings?.()} aria-label="ضبط تذكيرات المهام من التنبيهات">
        <BellRing size={16}/> {activeSummary} · ضبط التذكيرات من التنبيهات
      </button>

      <section className="panel">
        <div className="today-task-filters" role="tablist" aria-label="تصفية المهام">
          <button role="tab" aria-selected={filter === 'today'} className={filter === 'today' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('today'); setNotice('')}}>اليوم</button>
          <button role="tab" aria-selected={filter === 'tomorrow'} className={filter === 'tomorrow' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('tomorrow'); setNotice('')}}>غدًا</button>
          <button role="tab" aria-selected={filter === 'upcoming'} className={filter === 'upcoming' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('upcoming'); setNotice('')}}>القادمة</button>
          <button role="tab" aria-selected={filter === 'overdue'} className={filter === 'overdue' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('overdue'); setNotice('')}}>متأخرة</button>
          <button role="tab" aria-selected={filter === 'unscheduled'} className={filter === 'unscheduled' ? 'primary' : 'soft-btn'} onClick={() => {setFilter('unscheduled'); setNotice('')}}>بلا موعد</button>
        </div>
        {undo && (
          <p className="hint" role="status">
            أُنجزت «{undo.label}».{' '}
            <button type="button" className="soft-btn" onClick={() => {if (undo.before) onTasks(undo.before); if (undo.beforeGoals) onGoals(undo.beforeGoals); setUndo(null); notifyNativePrefsChanged();}}>تراجع</button>{' '}
            <button type="button" className="soft-btn" aria-label="إغلاق" onClick={() => setUndo(null)}>✕</button>
          </p>
        )}
        {confirmDone && (
          <div
            ref={confirmBoxRef}
            className="notif-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label="تأكيد إنجاز المقرر"
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeConfirm(); } }}
          >
            <p className="small">
              {confirmDone.plan?.kind === 'day'
                ? 'اعتبار المقرر منجزًا؟ سيتقدّم مقرر الخطة ويُسجَّل الإنجاز، ولن تُجدول مراجعة لأن جلسة التسميع لم تُجرَ. لا يمكن التراجع عن هذا.'
                : 'اعتبار هذه المهمة منجزة؟ ستُعلَّم منجزة فقط: لن تُسجَّل جلسة تسميع ولن تُجدول مراجعة، ولن تتغيّر خطة الحفظ.'}
            </p>
            <div className="notif-confirm-actions">
              <button type="button" ref={confirmButtonRef} className="primary" onClick={() => { void confirmComplete(confirmDone); }}>نعم، اعتبره منجزًا</button>
              <button type="button" className="soft-btn" onClick={closeConfirm}>إلغاء</button>
            </div>
          </div>
        )}
        {notice && <p className="hint" role="status">{notice}</p>}
        {allItems.length === 0 ? (
          <p className="muted">لا توجد مهام غير منجزة في هذا القسم.</p>
        ) : (
          <ul className="today-task-list">
            {allItems.map((item, index) => {
              const isGoal = 'goalId' in item;
              const itemSource = source(item as Task & {sourceLabel?: string});
              const schedule = taskSchedules[item.id];
              const itemNotifyEnabled = notifyDraftByTask[item.id] ?? schedule?.notifyEnabled ?? true;
              const itemLeadMinutes = item.id in leadDraftByTask ? leadDraftByTask[item.id] : schedule?.remindBeforeMinutes;
              const itemAlarmMode = alarmDraftByTask[item.id] ?? schedule?.alarmMode === true;
              const effectiveLead = itemLeadMinutes ?? taskSettings.remind_before_minutes;
              const hasSchedule = Boolean(schedule?.confirmedDate || schedule?.initialDate);
              const showMeta = Boolean(
                ('scheduledDate' in item && item.scheduledDate) ||
                  schedule?.confirmedDate ||
                  schedule?.initialDate ||
                  hasSchedule,
              );
              return (
                <Fragment key={item.id}>
                {nextUpIds.length > 0 && index === 0 && <li className="today-task-heading" aria-hidden="true">الأقرب الآن</li>}
                {nextUpIds.length > 0 && index === nextUpIds.length && <li className="today-task-heading" aria-hidden="true">باقي مهام اليوم</li>}
                <li className="today-task-card">
                  <div className="today-task-head">
                    <div className="today-task-info">
                      <strong className="today-task-title">{item.title}</strong>
                      <span className="today-task-source">
                        <span>{isGoal ? 'خطوة هدف' : `مهمة ${item.period === 'daily' ? 'يومية' : item.period === 'weekly' ? 'أسبوعية' : 'شهرية'}`}</span>
                        <span aria-hidden="true">·</span>
                        <span>{itemSource}</span>
                      </span>
                      {nextUpById.has(item.id) && (
                        <span className={`today-task-nextup is-${nextUpById.get(item.id)!.state}`} data-nextup={nextUpById.get(item.id)!.state}>
                          <Clock3 size={12} aria-hidden="true"/> {nextUpById.get(item.id)!.label}
                        </span>
                      )}
                    </div>
                    {(item as Task).plan && onOpenPlanTask && <button type="button" className="soft-btn" onClick={() => onOpenPlanTask(item as Task)}>{(item as Task).plan!.kind === 'day' ? 'ابدأ مقرر اليوم' : 'ابدأ المراجعة'}</button>}
                    {(item as Task).hifz && onOpenHifzTask && <button type="button" className="soft-btn" onClick={() => onOpenHifzTask((item as Task).hifz!)}>ابدأ التسميع</button>}
                    <button
                      type="button"
                      className="today-task-complete-btn"
                      onClick={() => (isGoal ? completeGoal(item.goalId, item.stepId) : requestComplete(item as Task))}
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
                                : 'تنبيه عند الموعد'}{itemNotifyEnabled && itemAlarmMode ? ' · نمط منبه' : ''}
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

                    <label className="today-task-alarm-mode">
                      <input
                        type="checkbox"
                        checked={itemAlarmMode}
                        aria-label={`نمط منبه لـ ${item.title}`}
                        onChange={() => toggleItemAlarm(item.id, item.title)}
                      />
                      <span>نمط منبه (رنين متكرر نحو دقيقة)</span>
                    </label>

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
                </Fragment>
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
