import {describe, expect, it} from 'vitest';
import {pickDueItems} from './engine';
import {buildNativeTaskPayloads, GENERAL_CHANNEL_ID} from './native-prayer-scheduler';
import {dailyTaskEvents, upcomingTaskAlerts} from './task-planner';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationPreference} from './types';
import type {Task, TaskSchedule} from '../app-state';

function makePrefs(patch: Partial<NotificationPreference> = {}): NotificationPreference {
  const base = structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);
  return {
    ...base,
    ...patch,
    categories: {...base.categories, ...(patch.categories ?? {})},
    reminder_settings: {
      ...base.reminder_settings,
      ...(patch.reminder_settings ?? {}),
      task_notifications: {
        ...base.reminder_settings.task_notifications!,
        ...(patch.reminder_settings?.task_notifications ?? {}),
      },
    },
    quiet_hours: {...base.quiet_hours, ...(patch.quiet_hours ?? {})},
  };
}

const tasks: Task[] = [
  {id: 't1', title: 'مراجعة سورة الكهف', period: 'daily', done: false, optional: true},
  {id: 't2', title: 'ورد الاستغفار', period: 'daily', done: true, doneKey: '2026-11-20', optional: true},
  {id: 't3', title: 'صلة رحم', period: 'weekly', done: false, optional: true},
];

const schedules: Record<string, TaskSchedule> = {
  t1: {
    title: 'مراجعة سورة الكهف',
    sourceLabel: 'يومي مع الله',
    initialDate: '2026-11-20',
    initialTime: '14:00',
    confirmedDate: '2026-11-20',
    confirmedTime: '14:00',
  },
  t2: {
    title: 'ورد الاستغفار',
    sourceLabel: 'يومي مع الله',
    confirmedDate: '2026-11-20',
    confirmedTime: '15:00',
  },
  t3: {
    title: 'صلة رحم',
    sourceLabel: 'أسبوعي مع الله',
    initialDate: '2026-11-20',
    initialTime: '16:30',
  },
};

describe('task-planner and engine integration', () => {
  it('generates before and at events using configurable lead minutes and skips done tasks', () => {
    const now = new Date(2026, 10, 20, 10, 0, 0);
    const prefs = makePrefs({
      reminder_settings: {
        default_channel: 'both',
        snooze_minutes: 10,
        task_notifications: {
          enabled: true,
          remind_before_minutes: 20,
          notify_at_time: true,
          include_initial: true,
          include_day_plan: false,
          channel: 'both',
        },
      },
    });

    const events = dailyTaskEvents({tasks, taskSchedules: schedules}, prefs, now, 1);
    const ids = events.map(e => `${e.taskId}:${e.kind}`);
    expect(ids).toEqual(['t1:before', 't1:at', 't3:before', 't3:at']);
    expect(events[0].at.getHours()).toBe(13);
    expect(events[0].at.getMinutes()).toBe(40);
    expect(events[1].at.getHours()).toBe(14);
    expect(events[1].at.getMinutes()).toBe(0);
  });

  it('respects per-task notifyEnabled, per-task remindBeforeMinutes, and include_initial', () => {
    const now = new Date(2026, 10, 20, 10, 0, 0);
    const customSchedules: Record<string, TaskSchedule> = {
      t1: {...schedules.t1, remindBeforeMinutes: 5},
      t3: {...schedules.t3, notifyEnabled: false},
    };
    const prefs = makePrefs({
      reminder_settings: {
        default_channel: 'both',
        snooze_minutes: 10,
        task_notifications: {
          enabled: true,
          remind_before_minutes: 15,
          notify_at_time: false,
          include_initial: true,
          include_day_plan: false,
          channel: 'both',
        },
      },
    });

    const events = dailyTaskEvents({tasks, taskSchedules: customSchedules}, prefs, now, 1);
    expect(events).toHaveLength(1);
    expect(events[0].taskId).toBe('t1');
    expect(events[0].kind).toBe('before');
    expect(events[0].beforeMinutes).toBe(5);
    expect(events[0].at.getHours()).toBe(13);
    expect(events[0].at.getMinutes()).toBe(55);

    const noInitialPrefs = makePrefs({
      reminder_settings: {
        default_channel: 'both',
        snooze_minutes: 10,
        task_notifications: {
          enabled: true,
          remind_before_minutes: 15,
          notify_at_time: true,
          include_initial: false,
          include_day_plan: false,
          channel: 'both',
        },
      },
    });
    const onlyConfirmed = dailyTaskEvents({tasks, taskSchedules: schedules}, noInitialPrefs, now, 1);
    expect(onlyConfirmed.every(e => e.taskId === 't1')).toBe(true);
  });

  it('includes confirmed DayPlanner activities when include_day_plan is enabled', () => {
    const now = new Date(2026, 10, 20, 4, 0, 0);
    const prefs = makePrefs({
      reminder_settings: {
        default_channel: 'both',
        snooze_minutes: 10,
        task_notifications: {
          enabled: true,
          remind_before_minutes: 10,
          notify_at_time: false,
          include_initial: true,
          include_day_plan: true,
          channel: 'both',
        },
      },
    });
    const dayPlan = {
      activities: {
        'after-fajr-0': [
          {id: 'dp1', title: 'قراءة ورد الفجر', timing: {anchor: 'الفجر', offset: 30}, scheduleStatus: 'confirmed' as const},
          {id: 'dp2', title: 'نشاط مبدئي', timing: {anchor: 'الفجر', offset: 60}, scheduleStatus: 'initial' as const},
        ],
      },
      completed: {},
      workStart: '',
      sleep: '',
    };
    const events = dailyTaskEvents(
      {tasks: [], taskSchedules: {}, dayPlan, prayers: {الفجر: '05:00'}},
      prefs,
      now,
      1,
    );
    expect(events).toHaveLength(1);
    expect(events[0].taskTitle).toBe('قراءة ورد الفجر');
    expect(events[0].at.getHours()).toBe(5);
    expect(events[0].at.getMinutes()).toBe(20);
  });

  it('delivers due task items via pickDueItems and enforces rules and deduplication', () => {
    const prefs = makePrefs();
    const dueNow = new Date(2026, 10, 20, 13, 45, 0); // 15m before 14:00
    const due = pickDueItems([], null, prefs, new Set(), dueNow, [], {tasks, taskSchedules: schedules});
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('task');
    if (due[0].kind === 'task') {
      expect(due[0].event.taskId).toBe('t1');
      expect(due[0].event.kind).toBe('before');
    }

    // Deduplicated once fired
    const fired = new Set([`${due[0].key}:done`]);
    expect(pickDueItems([], null, prefs, fired, dueNow, [], {tasks, taskSchedules: schedules})).toEqual([]);

    // Muted when the single app-wide switch is off, or category task = false, or DND.
    // (The separate task_notifications.enabled master switch was removed; enabling is
    // unified under global_enabled.)
    const disabledPrefs = makePrefs({global_enabled: false});
    expect(pickDueItems([], null, disabledPrefs, new Set(), dueNow, [], {tasks, taskSchedules: schedules})).toEqual([]);
    expect(
      pickDueItems([], null, makePrefs({categories: {task: false}}), new Set(), dueNow, [], {tasks, taskSchedules: schedules}),
    ).toEqual([]);
    expect(
      pickDueItems([], null, makePrefs({dnd_enabled: true}), new Set(), dueNow, [], {tasks, taskSchedules: schedules}),
    ).toEqual([]);
  });

  it('builds native Capacitor payloads for future scheduled tasks and skips in_app channel', () => {
    const now = new Date(2026, 10, 20, 10, 0, 0);
    const payloads = buildNativeTaskPayloads({tasks, taskSchedules: schedules}, makePrefs(), now, GENERAL_CHANNEL_ID, true);
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads[0].extra?.rabbaniKind).toBe('task');
    expect(payloads[0].channelId).toBe(GENERAL_CHANNEL_ID);

    const inAppOnly = makePrefs({
      reminder_settings: {
        default_channel: 'both',
        snooze_minutes: 10,
        task_notifications: {
          enabled: true,
          remind_before_minutes: 15,
          notify_at_time: true,
          include_initial: true,
          include_day_plan: false,
          channel: 'in_app',
        },
      },
    });
    expect(buildNativeTaskPayloads({tasks, taskSchedules: schedules}, inAppOnly, now)).toEqual([]);

    const preview = upcomingTaskAlerts({tasks, taskSchedules: schedules}, makePrefs(), now, 5);
    expect(preview.length).toBe(4);
  });
});
