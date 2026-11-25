import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('hijriDate', () => {
  it('formats with the Umm al-Qura calendar when the engine supports it', async () => {
    vi.resetModules();
    const { hijriDate } = await import('./hijri');
    const out = hijriDate('2026-11-25');
    expect(out).toBeTruthy();
    expect(out).not.toMatch(/نوفمبر|يونيو/);
    // Same value the Android 11 and 14 emulator WebViews showed for this day.
    expect(out).toBe('١٥ جمادى الآخرة');
    // The same calendar day gives the same answer whatever the process timezone offset is (the input is noon local).
    expect(hijriDate(new Date(2026, 10, 25, 12))).toBe(out);
  });

  it('returns undefined instead of a Gregorian month when the engine ignores the Islamic calendar (old WebView)', async () => {
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
