import {describe, expect, it} from 'vitest';
import {
  buildNativeReminderPayloads,
  buildNativeReviewPayloads,
  farQueueItems,
  FAR_QUEUE,
  splitSilentForLegacyAndroid,
  SILENT_REMINDER_CHANNEL_ID,
  GENERAL_CHANNEL_ID,
} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationPreference, type Reminder} from './types';
import type {MemorizationPassage} from '../quran/types';

const NOW = new Date(2026, 10, 25, 10, 0, 0);
const prefs = (): NotificationPreference => structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);

function dailyReminder(): Reminder {
  return {
    id: 'r1', user_id: '', title: 'ورد', scheduled_at: new Date(2026, 10, 25, 12).toISOString(),
    recurrence: 'daily', category: 'worship', enabled: true, created_at: '', updated_at: '',
  } as Reminder;
}

describe('far queue', () => {
  it('a daily reminder keeps being covered past the normal 5-occurrence window with identical content', () => {
    const normal = buildNativeReminderPayloads([dailyReminder()], prefs(), NOW);
    const far = buildNativeReminderPayloads([dailyReminder()], prefs(), NOW, undefined, true, FAR_QUEUE);
    expect(far.length).toBeGreaterThan(normal.length);
    const queue = farQueueItems(far, normal);
    expect(queue.length).toBe(far.length - normal.length);
    // no overlap with what LocalNotifications already has
    const normalIds = new Set(normal.map((p) => p.id));
    expect(queue.every((q) => !normalIds.has(q.id))).toBe(true);
    // same text and channel as the registered ones
    expect(queue[0].title).toBe(normal[0].title);
    expect(queue[0].channelId).toBe(normal[0].channelId);
    // strictly later than every registered occurrence
    const lastNormal = Math.max(...normal.map((p) => p.schedule.at.getTime()));
    expect(queue.every((q) => q.at > lastNormal)).toBe(true);
  });

  it('disabled notifications produce an empty queue', () => {
    const p = prefs();
    p.global_enabled = false;
    expect(buildNativeReminderPayloads([dailyReminder()], p, NOW, undefined, true, FAR_QUEUE)).toEqual([]);
  });

  it('review passages due 10 days out are queued, not registered', () => {
    const passage = {id: 'p', contentType: 'quran', surah: 2, ayahStart: 1, ayahEnd: 5, dueDate: '2026-12-05'} as unknown as MemorizationPassage;
    const normal = buildNativeReviewPayloads([passage], prefs(), NOW);
    const far = buildNativeReviewPayloads([passage], prefs(), NOW, undefined, true, FAR_QUEUE);
    expect(normal).toHaveLength(0);
    expect(farQueueItems(far, normal)).toHaveLength(1);
  });

  it('silent before/after reminders leave LocalNotifications only on Android 7.x (API 24-25)', () => {
    const list = [
      {id: 1, channelId: SILENT_REMINDER_CHANNEL_ID},
      {id: 2, channelId: GENERAL_CHANNEL_ID},
    ];
    for (const sdk of [24, 25]) {
      const r = splitSilentForLegacyAndroid(list, sdk);
      expect(r.queued.map((x) => x.id)).toEqual([1]);
      expect(r.registered.map((x) => x.id)).toEqual([2]);
    }
    for (const sdk of [26, 29, 33, 36, undefined]) {
      const r = splitSilentForLegacyAndroid(list, sdk);
      expect(r.queued).toEqual([]);
      expect(r.registered.map((x) => x.id)).toEqual([1, 2]);
    }
  });
});
