import {useEffect, useMemo, useState} from 'react';
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
import CoachToday from '../coach/CoachToday';
import type {CourseCoach} from '../coach/course';
import type {CoachSettings} from '../coach/types';
import type {SmartTodayItem} from '../coach/smart';
import type {WirdWithCoach} from '../coach/habit';
import type {AchievementEntry} from '../achievement/log';
import type {DayPlan} from '../DayPlanner';
import {timeLabel} from '../day-timing';
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
  courseCoach,
  coachSettings,
  onCourseCoach,
  onCoachSettings,
  wirds,
  prayers,
  dayPlan,
  dayRecords,
  achievementLog,
  quranPassages,
  onCompleteWird,
  onUpdateWird,
  onOpenQuran,
  onOpenWirds,
}: Props) {
  const [filter, setFilter] = useState<Filter>('today');
  const [timeByTask, setTimeByTask] = useState<Record<string, string>>({});
  const [dateByTask, setDateByTask] = useState<Record<string, string>>({});
  const [notifyDraftByTask, setNotifyDraftByTask] = useState<Record<string, boolean>>({});
  const [leadDraftByTask, setLeadDraftByTask] = useState<Record<string, number | undefined>>({});
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<{label: string; before: Task[]} | null>(null);

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

  const allItems = [...items, ...goalTasks].filter(matchesConfirmedDate);

  const source = (task: Task & {sourceLabel?: string}) =>
    task.sourceLabel ??
    (task.period === 'daily'
      ? 'يومي مع الله'
      : task.period === 'weekly'
        ? 'المؤمن القوي · الخطة الأسبوعية'
        : 'المؤمن القوي · الخطة الشهرية');

  const complete = (task: Task) => {
    setUndo({label: task.title, before: tasks});
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

      {onCourseCoach&&(
        <CoachToday
          goals={goals}
          tasks={tasks}
          wirds={wirds}
          coach={courseCoach}
          coachSettings={coachSettings}
          prayers={prayers}
          dayPlan={dayPlan}
          dayRecords={dayRecords}
          taskSchedules={taskSchedules}
          achievementLog={achievementLog}
          quranPassages={quranPassages}
          onCoach={onCourseCoach}
          onCoachSettings={onCoachSettings}
          onCompleteGoalStep={completeGoal}
          onCompleteCourseTask={taskId=>{
            const t=tasks.find(x=>x.id===taskId);
            if(t)complete(t);
          }}
          onCompleteWird={onCompleteWird}
          onUpdateGoal={nextGoal=>onGoals(goals.map(g=>g.id===nextGoal.id?nextGoal:g))}
          onUpdateWird={onUpdateWird}
          onScheduleSmartItem={(item:SmartTodayItem)=>{
            if(!item.suggestedSlot)return;
            const slot=item.suggestedSlot;
            const existing=taskSchedules[item.taskId];
            const existingDate=existing?.confirmedDate??existing?.initialDate;
            if(existingDate&&existingDate>=now){setNotice(`«${item.title}» مجدولة بالفعل ولم أغيّر موعدها.`);return}
            onTaskSchedules({
              ...taskSchedules,
              [item.taskId]:{
                ...existing,
                title:item.title,
                sourceLabel:item.goalTitle,
                initialDate:now,
                initialTime:slot.startTime,
                confirmedDate:now,
                confirmedTime:slot.startTime,
                notifyEnabled:existing?.notifyEnabled??true,
              },
            });
            notifyNativePrefsChanged();
            setNotice(`تمت جدولة «${item.title}» (${slot.label}) الساعة ${timeLabel(slot.startTime)}.`);
          }}
          onOpenPlanTask={onOpenPlanTask}
          onOpenHifzTask={onOpenHifzTask}
          onOpenQuran={onOpenQuran}
          onOpenWirds={onOpenWirds}
        />
      )}

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
            <button type="button" className="soft-btn" onClick={() => {onTasks(undo.before); setUndo(null); notifyNativePrefsChanged();}}>تراجع</button>{' '}
            <button type="button" className="soft-btn" aria-label="إغلاق" onClick={() => setUndo(null)}>✕</button>
          </p>
        )}
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
