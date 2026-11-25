import {afterEach, describe, expect, it} from 'vitest';
import {nextDueDate, upcomingOccurrences} from './scheduler';
import {buildNativeReviewPayloads, farQueueItems, FAR_QUEUE} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE, type Reminder} from './types';
import type {MemorizationPassage} from '../quran/types';

/**
 * Pins the CURRENT behaviour of the JS recurrence code (nextDueDate / upcomingOccurrences) and of the near/far review
 * split across device time zones. These are the facts a native renewal rule has to reproduce exactly; they are not a statement
 * that the behaviour is ideal. If the builders change, these tests fail first.
 */
const original = process.env.TZ;
afterEach(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; });
const setZone = (z: string) => { process.env.TZ = z; };

const rem = (over: Partial<Reminder>): Reminder => ({
  id: 'r', user_id: '', title: 't', scheduled_at: '2026-10-25T10:00:00.000Z', recurrence: 'daily', category: 'worship',
  enabled: true, created_at: '', updated_at: '', ...over,
} as Reminder);
const hm = (d: Date) => [d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()].join(':');

describe('daily recurrence', () => {
  it('fires at the wall-clock time the base instant has in the CURRENT zone, and keeps that wall time through DST', () => {
    setZone('America/New_York'); // DST ends 2026-11-01
    const r = rem({scheduled_at: '2026-10-25T16:00:00.000Z'}); // 12:00 EDT
    const occ = upcomingOccurrences(r, new Date('2026-10-30T00:00:00.000Z'), 6);
    expect(occ.map(hm)).toEqual(Array(6).fill('12:0:0:0'));
    // the instant moves by one hour when DST ends, the wall time does not
    expect(occ.find((d) => d.getTime() === Date.parse('2026-10-31T16:00:00.000Z'))).toBeTruthy();
    expect(occ.find((d) => d.getTime() === Date.parse('2026-11-02T17:00:00.000Z'))).toBeTruthy();
  });
  it('after a zone change the wall time is the base instant read in the new zone (same instant of day)', () => {
    const r = rem({scheduled_at: '2026-11-01T10:00:00.000Z'});
    const from = new Date('2026-11-25T08:00:00.000Z');
    setZone('Africa/Cairo');
    expect(hm(nextDueDate(r, from)!)).toBe('12:0:0:0');
    setZone('Asia/Riyadh');
    expect(hm(nextDueDate(r, from)!)).toBe('13:0:0:0');
  });
});

describe('weekly and weekdays recurrence', () => {
  it('weekly uses the weekday of the base instant in the CURRENT zone', () => {
    const r = rem({recurrence: 'weekly', scheduled_at: '2026-11-04T10:30:00.000Z'}); // Wednesday 12:30 in Cairo, Thursday 00:30 in Kiritimati
    const from = new Date('2026-11-25T00:00:00.000Z');
    setZone('Africa/Cairo');
    expect(new Date(r.scheduled_at).getDay()).toBe(3);
    expect(nextDueDate(r, from)!.getDay()).toBe(3);
    setZone('Pacific/Kiritimati');
    expect(new Date(r.scheduled_at).getDay()).toBe(4);
    expect(nextDueDate(r, from)!.getDay()).toBe(4);
  });
  it('weekdays uses local weekdays from days_of_week and the base wall time', () => {
    setZone('Africa/Cairo');
    const r = rem({recurrence: 'weekdays', recurrence_config: {days_of_week: [0, 3]}, scheduled_at: '2026-11-01T10:00:00.000Z'});
    const occ = upcomingOccurrences(r, new Date('2026-11-25T08:00:00.000Z'), 4);
    expect(occ.map((d) => d.getDay())).toEqual([3, 0, 3, 0]);
    expect(occ.map(hm)).toEqual(Array(4).fill('12:0:0:0'));
  });
});

describe('custom interval and end date', () => {
  it('counts calendar days from the base local date, and clamps at the end of the local end date', () => {
    setZone('Africa/Cairo');
    const r = rem({recurrence: 'custom', recurrence_config: {interval_days: 3, end_date: '2026-12-05'}, scheduled_at: '2026-11-20T10:00:00.000Z'});
    const occ = upcomingOccurrences(r, new Date('2026-11-25T00:00:00.000Z'), 10);
    expect(occ.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-11-26', '2026-11-29', '2026-12-02', '2026-12-05']);
  });
});

describe('near/far review split across a zone change matches the app-open baseline', () => {
  const NOW = new Date('2026-11-25T08:00:00.000Z');
  const mk = (id: string, d: string) => ({id, contentType: 'quran', surah: 2, ayahStart: 1, ayahEnd: 5, dueDate: d}) as unknown as MemorizationPassage;
  const passages = ['2026-11-26', '2026-11-28', '2026-12-02', '2026-12-10', '2026-12-20'].map((d, i) => mk('p' + i, d));
  const plan = (z: string) => {
    setZone(z);
    const near = buildNativeReviewPayloads(passages, structuredClone(DEFAULT_NOTIFICATION_PREFERENCE), NOW, undefined, true);
    const ext = buildNativeReviewPayloads(passages, structuredClone(DEFAULT_NOTIFICATION_PREFERENCE), NOW, undefined, true, FAR_QUEUE);
    return {near, ext, far: farQueueItems(ext, near)};
  };
  it.each([['Africa/Cairo', 'America/New_York', -7], ['Africa/Cairo', 'Pacific/Kiritimati', 12], ['Africa/Cairo', 'Asia/Riyadh', 1]])('%s to %s', (from, to, hours) => {
    const before = plan(from);
    const after = plan(to);
    // same ids, none lost, none added by the zone change
    expect(after.ext.map((p) => p.id)).toEqual(before.ext.map((p) => p.id));
    const base = new Map(after.ext.map((p) => [p.id, p.schedule.at.getTime()]));
    for (const p of before.ext) {
      // every item moves by exactly the offset change: an absolute (old) instant is off by this much, a wall-clock re-resolution is exact
      expect((p.schedule.at.getTime() - base.get(p.id)!) / 3600000).toBe(hours);
    }
    expect(before.far.length).toBeGreaterThan(0);
    expect(before.near.length).toBeGreaterThan(0);
  });
});
