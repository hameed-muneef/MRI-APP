import {describe, expect, it} from 'vitest';
import {buildNativeRecurrenceRules} from './native-recurrence-rules';
import {buildNativeReminderPayloads, FAR_QUEUE} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationPreference, type Reminder} from './types';

const CH = 'al-rabbani-general-v2';
const now = new Date('2026-11-25T09:00:00.000Z');
const rem = (over: Partial<Reminder>): Reminder => ({
  id: 'r1', user_id: '', title: 'تذكير', description: 'نص', scheduled_at: '2026-11-01T10:00:00.000Z', recurrence: 'daily', category: 'worship',
  enabled: true, created_at: '', updated_at: '', ...over,
} as Reminder);
const prefs = (over: Partial<NotificationPreference> = {}): NotificationPreference =>
  ({...JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCE)), global_enabled: true, dnd_enabled: false, ...over});
const plan = (rs: Reminder[], p = prefs()) => buildNativeReminderPayloads(rs, p, now, CH, true, FAR_QUEUE);

describe('native recurrence rules (device renewal of daily and weekly custom reminders)', () => {
  it('publishes a rule for daily and weekly only, with the content the app itself plans', () => {
    const rs = [rem({id: 'd'}), rem({id: 'w', recurrence: 'weekly'}), rem({id: 'm', recurrence: 'monthly'}), rem({id: 'c', recurrence: 'custom', recurrence_config: {interval_days: 2}}),
      rem({id: 'o', recurrence: 'none'}), rem({id: 'wd', recurrence: 'weekdays'})];
    const rules = buildNativeRecurrenceRules(rs, prefs(), now, plan(rs), CH);
    expect(rules.map((r) => [r.rid, r.kind])).toEqual([['d', 'daily'], ['w', 'weekly']]);
    expect(rules[0]).toMatchObject({title: 'تذكير', body: 'نص', channelId: CH, baseMs: Date.parse('2026-11-01T10:00:00.000Z')});
    expect(buildNativeRecurrenceRules([rem({description: ''})], prefs(), now, [], CH)[0].body).toBe('تذكير مخصص');
  });
  it('frontier is the last occurrence the app planned for that reminder, never before now', () => {
    const rs = [rem({id: 'd'}), rem({id: 'e', enabled: true, scheduled_at: '2026-11-01T10:00:00.000Z'})];
    const planned = plan(rs);
    const last = Math.max(...planned.filter((p) => (p.extra as {reminderId?: string}).reminderId === 'd').map((p) => p.schedule.at.getTime()));
    const rules = buildNativeRecurrenceRules(rs, prefs(), now, planned, CH);
    expect(rules.find((r) => r.rid === 'd')!.frontierMs).toBe(last);
    expect(buildNativeRecurrenceRules(rs, prefs(), now, [], CH)[0].frontierMs).toBe(now.getTime());
  });
  it('master switch, do not disturb, disabled reminder and a switched-off category give no rule (nothing can resurrect)', () => {
    const rs = [rem({})];
    expect(buildNativeRecurrenceRules(rs, prefs({global_enabled: false}), now, [], CH)).toEqual([]);
    expect(buildNativeRecurrenceRules(rs, prefs({dnd_enabled: true}), now, [], CH)).toEqual([]);
    expect(buildNativeRecurrenceRules([rem({enabled: false})], prefs(), now, [], CH)).toEqual([]);
    expect(buildNativeRecurrenceRules(rs, prefs({categories: {...prefs().categories, worship: false}}), now, [], CH)).toEqual([]);
    expect(buildNativeRecurrenceRules([rem({id: 'quran-mastery-daily-review'})], prefs(), now, [], CH)).toEqual([]);
  });
  it('carries quiet hours, snooze and the dates; an end date that is not a plain date is ignored like the app ignores it', () => {
    const p = prefs({quiet_hours: {enabled: true, start: '23:00', end: '04:30'}});
    const [r] = buildNativeRecurrenceRules([rem({snooze_until: '2026-11-25T09:20:00.000Z', recurrence_config: {start_date: '2026-11-10', end_date: '2026-12-03'}})], p, now, [], CH);
    expect(r).toMatchObject({quietOn: true, quietStart: '23:00', quietEnd: '04:30', snoozeMs: Date.parse('2026-11-25T09:20:00.000Z'), start: '2026-11-10', end: '2026-12-03'});
    const [r2] = buildNativeRecurrenceRules([rem({recurrence_config: {end_date: '2026-12-03T00:00:00Z'}})], prefs(), now, [], CH);
    expect(r2.end).toBeNull();
  });
  it('a start date the device port cannot reproduce exactly keeps the app plan only (no rule)', () => {
    expect(buildNativeRecurrenceRules([rem({recurrence_config: {start_date: '2026-11-10T08:00:00Z'}})], prefs(), now, [], CH)).toEqual([]);
  });
});
