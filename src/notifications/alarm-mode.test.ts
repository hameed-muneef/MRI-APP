import {expect, it, vi} from 'vitest';

const mock = vi.hoisted(() => ({
  registered: [] as Array<{id: number; extra?: Record<string, unknown>}>,
  queues: {} as Record<string, Array<Record<string, unknown>>>,
  rules: [] as Array<Record<string, unknown>>,
}));
vi.mock('@capacitor/local-notifications', () => ({LocalNotifications: {
  checkPermissions: async () => ({display: 'granted'}),
  checkExactNotificationSetting: async () => ({exact_alarm: 'granted'}),
  listChannels: async () => ({channels: [{id: 'al-rabbani-general-v2'}]}),
  getPending: async () => ({notifications: []}),
  cancel: async () => {},
  schedule: async (x: {notifications: Array<{id: number; extra?: Record<string, unknown>}>}) => { mock.registered.push(...x.notifications); return {notifications: x.notifications}; },
}}));
vi.mock('../lib/settings-opener', () => ({
  getAndroidEnvironmentStatus: async () => ({hasAdhanRawSound: true}),
  ensureNativeAdhanChannel: async () => null,
  setNativeReminderQueue: async (kind: string, items: Array<Record<string, unknown>>) => { mock.queues[kind] = items; return true; },
  setNativeReminderRules: async (r: Array<Record<string, unknown>>) => { mock.rules = r; return true; },
  rebalanceNativeReminderQueue: async () => true,
}));
import {buildNativeReminderPayloads, buildNativeTaskPayloads, scheduleNativePersonalReminders, scheduleNativeTaskNotifications, GENERAL_CHANNEL_ID} from './native-prayer-scheduler';
import {buildNativeRecurrenceRules} from './native-recurrence-rules';
import {dailyTaskEvents} from './task-planner';
import {reminderSchema} from './storage-schema';
import {DEFAULT_NOTIFICATION_PREFERENCE, type Reminder} from './types';
import {parseStoredState} from '../state-schema';

const now = new Date(2026, 10, 23, 7);
const prefs = () => { const p = structuredClone(DEFAULT_NOTIFICATION_PREFERENCE); p.global_enabled = true; p.dnd_enabled = false; return p; };
const mk = (id: string, alarm?: boolean, recurrence: Reminder['recurrence'] = 'daily'): Reminder => ({
  id, user_id: '', title: id, scheduled_at: new Date(2026, 10, 1, 9).toISOString(), recurrence, category: 'worship',
  enabled: true, created_at: '', updated_at: '', ...(alarm === undefined ? {} : {alarm_mode: alarm}),
});

it('marks only alarm-mode reminders in the payload and defaults to off', () => {
  const ps = buildNativeReminderPayloads([mk('a', true), mk('b'), mk('c', false)], prefs(), now);
  expect(ps.filter(p => p.extra?.reminderId === 'a').every(p => p.extra?.alarmMode === true)).toBe(true);
  expect(ps.filter(p => p.extra?.reminderId !== 'a').some(p => 'alarmMode' in (p.extra ?? {}))).toBe(false);
});

it('sends alarm-mode reminders only to the native queue with alarmMode, never to LocalNotifications', async () => {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {localStorage: {getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k)}, Capacitor: {isNativePlatform: () => true}, dispatchEvent: () => {}});
  vi.stubGlobal('CustomEvent', class {});
  mock.registered.length = 0;
  await scheduleNativePersonalReminders([mk('a', true), mk('b')], prefs(), now);
  expect(mock.registered.length).toBeGreaterThan(0);
  expect(mock.registered.some(p => p.extra?.alarmMode === true || p.extra?.reminderId === 'a')).toBe(false);
  const q = mock.queues.reminder;
  expect(q.length).toBeGreaterThan(0);
  expect(q.filter(r => r.title === 'a').length).toBeGreaterThan(0);
  expect(q.filter(r => r.title === 'a').every(r => r.alarmMode === true)).toBe(true);
  expect(q.filter(r => r.title === 'b').some(r => 'alarmMode' in r)).toBe(false);
  expect(mock.rules.map(r => [r.rid, r.alarmMode]).sort()).toEqual([['a', true], ['b', false]]);
});

it('task alarm mode flows from the schedule to events, payloads and the queue', async () => {
  const schedules = {
    t1: {title: 'ألف', sourceLabel: 'x', confirmedDate: '2026-11-24', confirmedTime: '14:00', alarmMode: true},
    t2: {title: 'باء', sourceLabel: 'x', confirmedDate: '2026-11-24', confirmedTime: '15:00'},
  };
  const ctx = {tasks: [], taskSchedules: schedules};
  const ev = dailyTaskEvents(ctx, prefs(), now, 7);
  expect(ev.filter(e => e.taskId === 't1').every(e => e.alarmMode === true)).toBe(true);
  expect(ev.filter(e => e.taskId === 't2').some(e => e.alarmMode)).toBe(false);
  const ps = buildNativeTaskPayloads(ctx, prefs(), now, GENERAL_CHANNEL_ID);
  expect(ps.filter(p => p.extra?.taskId === 't1').every(p => p.extra?.alarmMode === true)).toBe(true);
  mock.registered.length = 0;
  await scheduleNativeTaskNotifications(ctx, prefs(), now);
  expect(mock.registered.some(p => p.extra?.taskId === 't1')).toBe(false);
  expect(mock.registered.some(p => p.extra?.taskId === 't2')).toBe(true);
  expect(mock.queues.task.length).toBeGreaterThan(0);
  expect(mock.queues.task.filter(r => String(r.title).includes('ألف')).length).toBeGreaterThan(0);
  expect(mock.queues.task.filter(r => String(r.title).includes('ألف')).every(r => r.alarmMode === true)).toBe(true);
  expect(mock.queues.task.filter(r => String(r.title).includes('باء')).some(r => 'alarmMode' in r)).toBe(false);
});

it('old data without the field still loads and an off switch emits nothing new', () => {
  expect(reminderSchema.safeParse({id: 'x', title: 't', scheduled_at: new Date().toISOString()}).success).toBe(true);
  expect(reminderSchema.parse({id: 'x', title: 't', scheduled_at: new Date().toISOString(), alarm_mode: true}).alarm_mode).toBe(true);
  const rules = buildNativeRecurrenceRules([mk('z')], prefs(), now, buildNativeReminderPayloads([mk('z')], prefs(), now), GENERAL_CHANNEL_ID);
  expect(rules[0].alarmMode).toBe(false);
  const st = parseStoredState(JSON.stringify({taskSchedules: {t: {title: 'a', sourceLabel: 'b', alarmMode: true}, u: {title: 'a', sourceLabel: 'b'}}})) as {taskSchedules: Record<string, {alarmMode?: boolean}>};
  expect(st.taskSchedules.t.alarmMode).toBe(true);
  expect(st.taskSchedules.u.alarmMode).toBeUndefined();
});
