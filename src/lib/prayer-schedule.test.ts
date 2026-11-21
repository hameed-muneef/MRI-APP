import { describe, it, expect } from 'vitest';
import {
  computePrayerTimes,
  computePrayerSchedule,
  computeDayPrayerStrings,
  mapAlAdhanMethod,
  mapAlAdhanMadhab,
  defaultMethodForCoordinates,
  prayerNameAr,
  prayerId,
} from './prayer-schedule';

describe('computePrayerTimes', () => {
  it('returns 5 prayers for Makkah', () => {
    const r = computePrayerTimes({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 'UmmAlQura', 'Shafi');
    expect(r.length).toBe(5);
    expect(r.map((x) => x.prayer)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
  });
  it('applies manual adjustment', () => {
    const base = computePrayerTimes({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 'UmmAlQura', 'Shafi');
    const adj = computePrayerTimes({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 'UmmAlQura', 'Shafi', { fajr: 5 });
    const b0 = base.find((x) => x.prayer === 'Fajr')!.at.getTime();
    const b1 = adj.find((x) => x.prayer === 'Fajr')!.at.getTime();
    expect(b1 - b0).toBe(5 * 60000);
  });
  it('hhmm format', () => {
    const r = computePrayerTimes({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 'UmmAlQura', 'Shafi');
    for (const p of r) expect(p.hhmm).toMatch(/^\d{2}:\d{2}$/);
  });
  it('date matches input day', () => {
    const r = computePrayerTimes({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 'UmmAlQura', 'Shafi');
    expect(r[0].date).toBe('2026-11-20');
  });
});

describe('computePrayerSchedule', () => {
  it('7 days * 5 = 35 events', () => {
    const r = computePrayerSchedule({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 7, 'UmmAlQura', 'Shafi');
    expect(r.length).toBe(35);
  });
  it('clamps days to 1..30', () => {
    const r = computePrayerSchedule({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 100, 'UmmAlQura', 'Shafi');
    expect(r.length).toBe(30 * 5);
    const r2 = computePrayerSchedule({ latitude: 21.4225, longitude: 39.8262 }, new Date('2026-11-20'), 0, 'UmmAlQura', 'Shafi');
    expect(r2.length).toBe(5);
  });
  it('madhab affects Asr', () => {
    const a = computePrayerSchedule({ latitude: 30.0444, longitude: 31.2357 }, new Date('2026-11-20'), 1, 'Egyptian', 'Shafi');
    const b = computePrayerSchedule({ latitude: 30.0444, longitude: 31.2357 }, new Date('2026-11-20'), 1, 'Egyptian', 'Hanafi');
    const asrA = a.find((x) => x.prayer === 'Asr')!.at.getTime();
    const asrB = b.find((x) => x.prayer === 'Asr')!.at.getTime();
    expect(asrB).toBeGreaterThan(asrA);
  });
});

describe('AlAdhan mappings & offline strings', () => {
  it('maps AlAdhan method and madhab numbers safely', () => {
    expect(mapAlAdhanMethod(4)).toBe('UmmAlQura');
    expect(mapAlAdhanMethod(5)).toBe('Egyptian');
    expect(mapAlAdhanMethod(999)).toBe('MuslimWorldLeague');
    expect(mapAlAdhanMadhab(1)).toBe('Hanafi');
    expect(mapAlAdhanMadhab(0)).toBe('Shafi');
  });

  it('computes offline Arabic day prayer strings including Sunrise', () => {
    const map = computeDayPrayerStrings(
      { latitude: 21.4225, longitude: 39.8262 },
      new Date('2026-11-20T12:00:00Z'),
      'UmmAlQura',
      'Shafi',
      'Asia/Riyadh',
    );
    expect(Object.keys(map)).toEqual(['الفجر', 'الشروق', 'الظهر', 'العصر', 'المغرب', 'العشاء']);
    for (const v of Object.values(map)) {
      expect(v).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});

describe('defaultMethodForCoordinates', () => {
  it('picks a regional convention without sending coordinates anywhere', () => {
    expect(defaultMethodForCoordinates(21.4225, 39.8262)).toBe('UmmAlQura'); // Makkah
    expect(defaultMethodForCoordinates(30.0444, 31.2357)).toBe('Egyptian'); // Cairo
    expect(defaultMethodForCoordinates(25.2048, 55.2708)).toBe('Dubai'); // Dubai
    expect(defaultMethodForCoordinates(25.2854, 51.5310)).toBe('Qatar'); // Doha
    expect(defaultMethodForCoordinates(29.3759, 47.9774)).toBe('Kuwait'); // Kuwait City
    expect(defaultMethodForCoordinates(41.0082, 28.9784)).toBe('Turkey'); // Istanbul
    expect(defaultMethodForCoordinates(35.6892, 51.3890)).toBe('Tehran'); // Tehran
    expect(defaultMethodForCoordinates(24.8607, 67.0011)).toBe('Karachi'); // Karachi
    expect(defaultMethodForCoordinates(-6.2088, 106.8456)).toBe('Singapore'); // Jakarta
    expect(defaultMethodForCoordinates(40.7128, -74.0060)).toBe('NorthAmerica'); // New York
    expect(defaultMethodForCoordinates(51.5074, -0.1278)).toBe('MuslimWorldLeague'); // London
  });
});

describe('prayerNameAr', () => {
  it('maps Fajr', () => expect(prayerNameAr('Fajr')).toBe('الفجر'));
});

describe('prayerId', () => {
  it('stable & strictly positive non-zero 32-bit int', () => {
    const a = prayerId('2026-11-20', 'Fajr');
    const b = prayerId('2026-11-20', 'Fajr');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThan(2147483647);
  });
  it('different inputs differ', () => {
    expect(prayerId('2026-11-20', 'Fajr')).not.toBe(prayerId('2026-11-20', 'Dhuhr'));
  });
});
