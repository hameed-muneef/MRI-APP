import {describe, expect, it} from 'vitest';
import {isQuietHoursActive} from './types';
import {isInQuietHours} from './delivery';

// ساعات الهدوء: النافذة العادية والنافذة التي تعبر منتصف الليل (22:00 -> 06:00 هي الافتراضية)
// يجب أن تُحسب بالطريقة نفسها في المحرك وفي مسار التسليم.

const prefs = (start: string, end: string, enabled = true) => ({
  quiet_hours: {enabled, start, end},
});
const at = (hours: number, minutes = 0) => new Date(2026, 10, 27, hours, minutes, 0, 0);

describe('quiet hours', () => {
  it('is off when the switch is off', () => {
    expect(isQuietHoursActive(prefs('22:00', '06:00', false) as never, at(23))).toBe(false);
    expect(isInQuietHours(prefs('22:00', '06:00', false), at(23))).toBe(false);
  });

  it('handles a same-day window', () => {
    const settings = prefs('13:00', '15:00');
    expect(isQuietHoursActive(settings as never, at(14))).toBe(true);
    expect(isQuietHoursActive(settings as never, at(12, 59))).toBe(false);
    expect(isQuietHoursActive(settings as never, at(15, 1))).toBe(false);
    expect(isInQuietHours(settings, at(14))).toBe(true);
    expect(isInQuietHours(settings, at(9))).toBe(false);
  });

  it('handles a window that crosses midnight', () => {
    const settings = prefs('22:00', '06:00');
    for (const [h, m] of [[22, 0], [23, 30], [0, 5], [5, 59], [6, 0]] as const) {
      expect(isQuietHoursActive(settings as never, at(h, m))).toBe(true);
      expect(isInQuietHours(settings, at(h, m))).toBe(true);
    }
    for (const [h, m] of [[6, 1], [9, 0], [12, 0], [21, 59]] as const) {
      expect(isQuietHoursActive(settings as never, at(h, m))).toBe(false);
      expect(isInQuietHours(settings, at(h, m))).toBe(false);
    }
  });

  it('treats start == end as a single minute, not the whole day', () => {
    const settings = prefs('10:00', '10:00');
    expect(isQuietHoursActive(settings as never, at(10))).toBe(true);
    expect(isQuietHoursActive(settings as never, at(10, 1))).toBe(false);
    expect(isInQuietHours(settings, at(10, 1))).toBe(false);
  });
});

describe('quiet hours: النهايات والتطابق بين المسارين', () => {
  const windows: Array<[string, string]> = [
    ['22:00', '06:00'],
    ['13:00', '15:00'],
    ['00:00', '23:59'],
    ['10:00', '10:00'],
    ['06:00', '22:00'],
  ];

  it('the end minute is still quiet, the minute after is not', () => {
    // سلوك حالي: النهاية تُحسب داخل النافذة (current <= end)، فالساعة 06:00 نفسها صامتة.
    const settings = prefs('22:00', '06:00');
    expect(isInQuietHours(settings, at(6, 0))).toBe(true);
    expect(isInQuietHours(settings, at(6, 1))).toBe(false);
    expect(isQuietHoursActive(settings as never, at(6, 0))).toBe(true);
    expect(isQuietHoursActive(settings as never, at(6, 1))).toBe(false);
  });

  it('both paths agree across a grid of times and windows', () => {
    const minutes = [0, 1, 15, 30, 59];
    for (const [start, end] of windows) {
      const settings = prefs(start, end);
      for (let hours = 0; hours < 24; hours += 1) {
        for (const minute of minutes) {
          const now = at(hours, minute);
          expect({start, end, hours, minute, active: isQuietHoursActive(settings as never, now)})
            .toEqual({start, end, hours, minute, active: isInQuietHours(settings, now)});
        }
      }
    }
  });
});
