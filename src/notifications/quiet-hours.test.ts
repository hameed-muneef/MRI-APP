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
