import {describe, expect, it} from 'vitest';
import {buildNextUp, minutesUntil, relativeLabel} from './next-up';

// Run with TZ=Africa/Cairo (see package scripts or CLI). Dates are local wall clock.
const local = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => new Date(y, mo - 1, d, h, mi, s, 0);

describe('next up: boundaries', () => {
  it('pins a late task only within 3h inclusive', () => {
    const now = local(2026, 11, 27, 19, 0);
    expect(buildNextUp([{id: 'a', time: '16:00'}], now).map(r => r.id)).toEqual(['a']);
    expect(buildNextUp([{id: 'a', time: '15:59'}], now)).toEqual([]);
  });
  it('only one late task is pinned; older late ones are not listed', () => {
    const now = local(2026, 11, 27, 19, 0);
    const rows = buildNextUp([{id: 'a', time: '18:00'}, {id: 'b', time: '18:30'}, {id: 'c', time: '19:10'}], now);
    expect(rows.map(r => r.id)).toEqual(['b', 'c']);
  });
  it('a task due within the last 30 seconds is not labelled late with an "now" label', () => {
    const now = local(2026, 11, 27, 19, 0, 30);
    const [row] = buildNextUp([{id: 'a', time: '19:00'}], now);
    // label says الآن, so the state must not be "late"
    expect(relativeLabel(row.minutes!)).toBe('الآن');
    expect(row.state).not.toBe('late');
  });
  it('many tasks in the same minute keep input order and respect the limit', () => {
    const now = local(2026, 11, 27, 19, 0);
    const items = ['a', 'b', 'c', 'd', 'e'].map(id => ({id, time: '19:30'}));
    expect(buildNextUp(items, now).map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('accepts single-digit hours and rejects invalid clock text without inventing a time', () => {
    const now = local(2026, 11, 27, 6, 0);
    expect(minutesUntil('7:05', now)).toBe(65);
    for (const bad of ['', '25:00x', '07:05 PM', 'fajr', '24:30']) {
      const rows = buildNextUp([{id: 'x', time: bad}], now);
      expect(rows[0]?.state === 'untimed' || rows.length === 0, bad).toBe(true);
    }
  });
  it('rejects out-of-range clock values such as 24:30 or 12:75', () => {
    const now = local(2026, 11, 27, 6, 0);
    expect(minutesUntil('24:30', now)).toBeNull();
    expect(minutesUntil('12:75', now)).toBeNull();
  });
});

describe('next up: midnight rollover', () => {
  it('a 00:20 task at 23:50 is not treated as 10 minutes away (list is per day)', () => {
    const now = local(2026, 11, 27, 23, 50);
    const rows = buildNextUp([{id: 'a', time: '00:20'}], now);
    expect(rows.every(r => r.state !== 'soon')).toBe(true);
  });
});

describe('next up: Cairo DST', () => {
  it('fall back 2026-10-29: after the clocks repeat 23:00, a 23:05 task is only a few minutes late', () => {
    // 2026-10-29 21:10 UTC = 23:10 EET (after fallback). The first 23:05 was DST, 65 real minutes earlier.
    const now = new Date('2026-10-29T21:10:00Z');
    const m = minutesUntil('23:05', now);
    expect(m).not.toBeNull();
    expect(Math.round(m!)).toBe(-5);
  });
});
