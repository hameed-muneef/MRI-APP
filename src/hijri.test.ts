import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const MONTHS = ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'];

describe('hijriDate', () => {
  it('formats with the Umm al-Qura calendar when the engine supports it', async () => {
    const { hijriDate } = await import('./hijri');
    const out = hijriDate('2026-11-25');
    // Same text the Android 11 and 14 emulator WebViews showed for this day.
    expect(out).toBe('١٥ جمادى الآخرة');
    expect(hijriDate(new Date(2026, 10, 25, 12))).toBe(out);
    expect(hijriDate(new Date(2026, 10, 25, 12).getTime())).toBe(out);
  });

  it('every day over two Hijri years has a day number and a Hijri month name, and consecutive days advance by one day or roll the month', async () => {
    const { hijriDate } = await import('./hijri');
    let previousDay = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 740; i++) {
      const text = hijriDate(new Date(2026, 0, 1 + i, 12))!;
      const [dayText, ...monthWords] = text.split(' ');
      const month = monthWords.join(' ');
      expect(MONTHS).toContain(month);
      seen.add(month);
      const day = Number(dayText.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(30);
      if (previousDay) expect(day === previousDay + 1 || day === 1).toBe(true);
      previousDay = day;
    }
    expect(seen.size).toBe(12);
  });

  it('gives the same answer in a far-east and a far-west timezone for the same calendar day (input is local noon)', async () => {
    const { hijriDate } = await import('./hijri');
    expect(hijriDate('2026-11-25')).toBe('١٥ جمادى الآخرة');
    expect(hijriDate('2026-11-24')).toBe('١٤ جمادى الآخرة');
  });

  it('old engine that applies the calendar but uses Gregorian month names (Chrome 69): names the month from its number', async () => {
    const Real = Intl.DateTimeFormat;
    const GREG = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    class Chrome69 extends Real {
      format(d?: Date | number) {
        return this.resolvedOptions().month === 'long' ? this.formatToParts(d).map(p => p.value).join('') : super.format(d);
      }
      formatToParts(d?: Date | number) {
        return super.formatToParts(d).map(p => p.type === 'month' && this.resolvedOptions().month === 'long' ? { ...p, value: GREG[Number(new Real('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric' }).format(d)) - 1] } : p);
      }
    }
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: Chrome69 });
    vi.resetModules();
    const { hijriDate } = await import('./hijri');
    expect(hijriDate('2026-11-25')).toBe('١٥ جمادى الآخرة');
  });

  it('old engine that ignores the Islamic calendar: returns undefined, never a Gregorian date', async () => {
    const Real = Intl.DateTimeFormat;
    class OldEngine extends Real {
      resolvedOptions() { return { ...super.resolvedOptions(), calendar: 'gregory' }; }
    }
    vi.stubGlobal('Intl', { ...Intl, DateTimeFormat: OldEngine });
    vi.resetModules();
    const { hijriDate } = await import('./hijri');
    expect(hijriDate('2026-11-25')).toBeUndefined();
  });
});
