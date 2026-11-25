import {beforeEach, describe, expect, it} from 'vitest';
import {resetCentralLocationForTests, setManualLocation} from '../lib/location-store';
import {resolveSchedulingLocation} from './scheduling-location';
import {DEFAULT_NOTIFICATION_PREFERENCE} from './types';
import {buildNativeAdhanAlarmInputs} from './native-prayer-scheduler';

describe('scheduling location for native adhan', () => {
  beforeEach(() => resetCentralLocationForTests(true));
  it('is undefined with no saved city and no device/manual location', () => {
    expect(resolveSchedulingLocation(undefined, 'Africa/Cairo')).toBeUndefined();
  });
  it('falls back to the central location so adhan is scheduled without a picked city', () => {
    setManualLocation(30.0444, 31.2357, 'القاهرة');
    const loc = resolveSchedulingLocation(undefined, 'Africa/Cairo');
    expect(loc).toMatchObject({latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo'});
    const alarms = buildNativeAdhanAlarmInputs({location: loc!, prefs: DEFAULT_NOTIFICATION_PREFERENCE, now: new Date('2026-11-25T08:00:00Z')});
    expect(alarms.length).toBeGreaterThan(30);
  });
  it('prefers a saved city', () => {
    setManualLocation(1, 1, 'x');
    const saved = {name: 'القاهرة', country: 'EG', latitude: 30, longitude: 31, timezone: 'Africa/Cairo'};
    expect(resolveSchedulingLocation(saved)?.name).toBe('القاهرة');
  });
  it('default prefs schedule Dhuhr and Asr system adhan (not in-app only)', () => {
    const alarms = buildNativeAdhanAlarmInputs({location: {name: 'c', country: '', latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo'}, prefs: DEFAULT_NOTIFICATION_PREFERENCE, now: new Date('2026-11-25T08:00:00Z')});
    const kinds = new Set(alarms.map(a => a.prayerKey.split(':')[1]));
    expect([...kinds].sort()).toEqual(['Asr', 'Dhuhr', 'Fajr', 'Isha', 'Maghrib']);
  });
});

describe('schedule horizon', () => {
  it('covers 30 days of alarms by default so a gap between app opens is survivable', () => {
    const loc = {name: 'c', country: '', latitude: 30.0444, longitude: 31.2357, timezone: 'Africa/Cairo'};
    const now = new Date('2026-11-25T08:00:00Z');
    const alarms = buildNativeAdhanAlarmInputs({location: loc, prefs: DEFAULT_NOTIFICATION_PREFERENCE, now, days: 30});
    const last = alarms[alarms.length - 1].triggerAtMs;
    expect((last - now.getTime()) / 86400000).toBeGreaterThan(28);
  });
});
