import {describe, expect, it} from 'vitest';
import {buildNativeTaskPayloads, GENERAL_CHANNEL_ID} from './native-prayer-scheduler';
import {dailyTaskEvents} from './task-planner';
import {DEFAULT_NOTIFICATION_PREFERENCE} from './types';
import type {Task, TaskSchedule} from '../app-state';

// Same shape that HifzMushafMode.confirmSchedule writes.
const id = 'quran-recite-p1-2026-11-25-09:30';
const tasks: Task[] = [{id, title: 'تسميع الكافرون ← الناس', period: 'daily', done: false, optional: false, scheduledDate: '2026-11-25', sourceLabel: 'مصحف الحفظ والإتقان', hifz: {passageId: 'p1', sessionId: 's1', surah: 109, from: 1, to: 3, tail: []}}];
const taskSchedules: Record<string, TaskSchedule> = {[id]: {confirmedDate: '2026-11-25', confirmedTime: '09:30', title: tasks[0].title, sourceLabel: 'مصحف الحفظ والإتقان', notifyEnabled: true}};

describe('scheduled hifz recitation reminder', () => {
  const now = new Date(2026, 10, 24, 22, 0, 0);
  it('produces at-time reminder events from the real task schedule', () => {
    const ev = dailyTaskEvents({tasks, taskSchedules}, structuredClone(DEFAULT_NOTIFICATION_PREFERENCE), now, 2);
    const at = ev.find(e => e.taskId === id && e.kind === 'at');
    expect(at).toBeTruthy();
    expect(at!.at.getDate()).toBe(25);
    expect(at!.at.getHours()).toBe(9);
    expect(at!.at.getMinutes()).toBe(30);
  });
  it('produces native payloads, and none once the task is done', () => {
    const prefs = structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);
    const p = buildNativeTaskPayloads({tasks, taskSchedules}, prefs, now, GENERAL_CHANNEL_ID, true);
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].extra?.rabbaniKind).toBe('task');
  });
  it('is silent when notifyEnabled is false', () => {
    const off = {[id]: {...taskSchedules[id], notifyEnabled: false}};
    expect(dailyTaskEvents({tasks, taskSchedules: off}, structuredClone(DEFAULT_NOTIFICATION_PREFERENCE), now, 2)).toEqual([]);
  });
});
