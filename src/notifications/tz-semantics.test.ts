import {afterEach, describe, expect, it} from 'vitest';
import {buildNativeReminderPayloads, buildNativeReviewPayloads, FAR_QUEUE} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE, type Reminder} from './types';
import type {MemorizationPassage} from '../quran/types';

/**
 * Pins how the real JS builders treat a device time zone change, because the native queue re-resolves stored items after
 * a zone change and must match what an app open would plan: review reminders follow the local wall clock, custom
 * reminders keep their instant of day. If a builder changes, this test fails and NativeReminderQueue.followsWallClock must follow.
 */
const hourIn = (z: string) => { process.env.TZ = z; return new Date('2026-11-25T10:00:00Z').getHours(); };
const ZONES = ['Africa/Cairo', 'Asia/Riyadh', 'America/New_York', 'Pacific/Kiritimati'];
const original = process.env.TZ;
afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; });

const NOW = new Date('2026-11-25T08:00:00.000Z');
const prefs = () => structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);
const reminder = {id: 'r1', user_id: '', title: 'ورد', scheduled_at: '2026-11-25T10:00:00.000Z', recurrence: 'daily', category: 'worship', enabled: true, created_at: '', updated_at: ''} as Reminder;
const passage = {id: 'p', contentType: 'quran', surah: 2, ayahStart: 1, ayahEnd: 5, dueDate: '2026-12-05'} as unknown as MemorizationPassage;

describe('time zone semantics of the queued kinds', () => {
  it('the test can really switch the process time zone', () => {
    expect(hourIn('Africa/Cairo')).toBe(12);
    expect(hourIn('Asia/Riyadh')).toBe(13);
  });

  it('review reminders keep the same local wall time in every zone', () => {
    const walls = ZONES.map((z) => {
      process.env.TZ = z;
      const out = buildNativeReviewPayloads([passage], prefs(), NOW, undefined, true, FAR_QUEUE);
      expect(out).toHaveLength(1);
      const d = out[0].schedule.at;
      return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()].join(':');
    });
    expect(new Set(walls).size).toBe(1);
  });

  it('custom daily reminders keep their instant of day (not the wall time) across zones', () => {
    const times = ZONES.map((z) => {
      process.env.TZ = z;
      const out = buildNativeReminderPayloads([reminder], prefs(), NOW, undefined, true, FAR_QUEUE);
      return out[0].schedule.at.getTime();
    });
    expect(new Set(times).size).toBe(1);
  });
});
