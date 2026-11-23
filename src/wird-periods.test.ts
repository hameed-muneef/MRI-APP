import {describe, expect, it} from 'vitest';
import type {Period, Wird} from './app-state';
import {changeWirdCount, normalizeWirds, periodKey} from './wird-periods';

const wird = (period: Period, now: Date): Wird => ({id: 'wird', title: 'Dhikr', target: 100, count: 30, period, periodKey: periodKey(period, now)});

describe('dhikr period rollover', () => {
  it.each([
    ['daily', new Date(2026, 10, 23, 23, 59), new Date(2026, 10, 24, 0, 1)],
    ['weekly', new Date(2026, 10, 20, 12), new Date(2026, 10, 23, 12)],
    ['monthly', new Date(2026, 10, 30, 23, 59), new Date(2026, 11, 1, 0, 1)],
  ] as [Period, Date, Date][])('normalizes %s before increment and preserves it on reload', (period, before, after) => {
    const original = [wird(period, before)];
    const updated = changeWirdCount(original, 'wird', 1, after);
    expect(updated[0].count).toBe(1);
    expect(updated[0].periodKey).toBe(periodKey(period, after));
    expect(normalizeWirds(JSON.parse(JSON.stringify(updated)), after)[0].count).toBe(1);
    expect(original[0].count).toBe(30);
  });
  it('does not reset within a period and never decrements below zero', () => {
    const now = new Date(2026, 10, 23, 12);
    const original = [wird('daily', now)];
    expect(normalizeWirds(original, now)).toBe(original);
    expect(changeWirdCount(original, 'wird', 10, now)[0].count).toBe(40);
    expect(changeWirdCount(original, 'wird', -100, now)[0].count).toBe(0);
  });
});
