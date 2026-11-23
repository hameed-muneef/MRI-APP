import {describe, expect, it} from 'vitest';
import {effectiveNextDueDate, nextDueDate} from './scheduler';
import {upcomingReminders} from './upcoming';
import {pickDueItems} from './engine';
import {DEFAULT_NOTIFICATION_PREFERENCE, type Reminder} from './types';

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    user_id: '',
    title: 'ورد القرآن',
    description: 'قراءة صفحة',
    scheduled_at: '2026-11-23T08:00:00',
    recurrence: 'daily',
    recurrence_config: {},
    category: 'worship',
    enabled: true,
    created_at: '2026-11-20T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
    ...overrides,
  };
}

describe('notifications scheduler & snooze behavior', () => {
  it('returns active snooze_until for a one-shot reminder even after original scheduled_at passed', () => {
    const now = new Date(2026, 10, 23, 8, 5, 0);
    const snoozeAt = new Date(2026, 10, 23, 8, 15, 0);
    const reminder = makeReminder({
      recurrence: 'none',
      scheduled_at: new Date(2026, 10, 23, 8, 0, 0).toISOString(),
      snooze_until: snoozeAt.toISOString(),
    });

    expect(nextDueDate(reminder, now)).toBeNull();
    const effective = effectiveNextDueDate(reminder, now);
    expect(effective?.getTime()).toBe(snoozeAt.getTime());

    const list = upcomingReminders([reminder], now, 3);
    expect(list).toHaveLength(1);
    expect(list[0].at.getTime()).toBe(snoozeAt.getTime());
    expect(list[0].isSnoozed).toBe(true);
  });

  it('prefers today active snooze over tomorrow recurrence roll-over in effectiveNextDueDate', () => {
    const now = new Date(2026, 10, 23, 8, 2, 0);
    const snoozeAt = new Date(2026, 10, 23, 8, 12, 0);
    const reminder = makeReminder({
      recurrence: 'daily',
      scheduled_at: new Date(2026, 10, 20, 8, 0, 0).toISOString(),
      snooze_until: snoozeAt.toISOString(),
    });

    const effective = effectiveNextDueDate(reminder, now);
    expect(effective?.getTime()).toBe(snoozeAt.getTime());

    // After snooze passes, falls back to tomorrow 08:00
    const afterSnooze = new Date(2026, 10, 23, 8, 15, 0);
    const next = effectiveNextDueDate(reminder, afterSnooze);
    expect(next?.getDate()).toBe(24);
    expect(next?.getHours()).toBe(8);
  });

  it('parses specific_dates in local time preserving reminder hours and minutes', () => {
    const now = new Date(2026, 10, 23, 6, 0, 0);
    const reminder = makeReminder({
      recurrence: 'specific_dates',
      scheduled_at: new Date(2026, 10, 23, 19, 45, 0).toISOString(),
      recurrence_config: {specific_dates: ['2026-11-25']},
    });

    const next = nextDueDate(reminder, now);
    expect(next).not.toBeNull();
    expect(next?.getFullYear()).toBe(2026);
    expect(next?.getMonth()).toBe(10);
    expect(next?.getDate()).toBe(25);
    expect(next?.getHours()).toBe(19);
    expect(next?.getMinutes()).toBe(45);
  });

  it('enforces recurrence_config.end_date inclusively on local calendar day', () => {
    const reminder = makeReminder({
      recurrence: 'daily',
      scheduled_at: new Date(2026, 10, 20, 8, 0, 0).toISOString(),
      recurrence_config: {end_date: '2026-11-24'},
    });

    const onEndDayMorning = new Date(2026, 10, 24, 7, 0, 0);
    const dueOnEndDay = nextDueDate(reminder, onEndDayMorning);
    expect(dueOnEndDay?.getDate()).toBe(24);

    const onEndDayEvening = new Date(2026, 10, 24, 21, 0, 0);
    expect(nextDueDate(reminder, onEndDayEvening)).toBeNull();
  });

  it('delivers snoozed one-shot and daily reminders in pickDueItems and respects fired/DND', () => {
    const snoozeAt = new Date(2026, 10, 23, 9, 10, 0);
    const oneShot = makeReminder({
      id: 'once-snoozed',
      recurrence: 'none',
      scheduled_at: new Date(2026, 10, 23, 9, 0, 0).toISOString(),
      snooze_until: snoozeAt.toISOString(),
    });
    const daily = makeReminder({
      id: 'daily-snoozed',
      recurrence: 'daily',
      scheduled_at: new Date(2026, 10, 20, 9, 0, 0).toISOString(),
      snooze_until: snoozeAt.toISOString(),
    });

    const prefs = structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);
    const atSnooze = new Date(2026, 10, 23, 9, 10, 30);
    const fired = new Set<string>();
    const due = pickDueItems([oneShot, daily], null, prefs, fired, atSnooze);

    expect(due.map(d => d.kind === 'reminder' ? d.reminder.id : '')).toEqual(['once-snoozed', 'daily-snoozed']);

    // Deduplication
    for (const item of due) fired.add(item.key);
    expect(pickDueItems([oneShot, daily], null, prefs, fired, atSnooze)).toEqual([]);

    // DND suppresses
    expect(pickDueItems([oneShot], null, {...prefs, dnd_enabled: true}, new Set(), atSnooze)).toEqual([]);
  });
});
