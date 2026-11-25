import {describe, expect, it} from 'vitest';
import {buildNativeRecomputeSpec, NATIVE_RECOMPUTE_SPEC_VERSION} from './native-recompute-spec';
import {DEFAULT_NOTIFICATION_PREFERENCE} from './types';

const loc = {latitude: 30.0444, longitude: 31.2357, label: 'Cairo'} as never;
const prefs = () => JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFERENCE));

describe('buildNativeRecomputeSpec', () => {
  it('carries version, location, method, madhab, adjustments, quiet hours and per-prayer settings', () => {
    const p = prefs();
    p.prayer_settings['الفجر'].adjust_minutes = 4;
    p.prayer_settings['العصر'].adhan_type = 'silent';
    p.quiet_hours = {enabled: true, start: '23:00', end: '04:00'};
    const s = buildNativeRecomputeSpec({location: loc, prefs: p, method: 'Egyptian', madhab: 'Hanafi'})!;
    expect(s.v).toBe(NATIVE_RECOMPUTE_SPEC_VERSION);
    expect(s).toMatchObject({lat: 30.0444, lon: 31.2357, method: 'Egyptian', hanafi: true});
    expect(s.adjust.Fajr).toBe(4);
    expect(s.prayers.Asr.type).toBe('silent');
    expect(s.prayers.Fajr.nameAr).toBe('الفجر');
    expect(s.quiet).toEqual({enabled: true, start: '23:00', end: '04:00'});
    expect(Object.keys(s.prayers)).toEqual(['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
  });

  it('returns null (native stays idle) when master, DND or the prayer category blocks scheduling', () => {
    const a = prefs(); a.global_enabled = false;
    const b = prefs(); b.dnd_enabled = true;
    const c = prefs(); c.categories.prayer = false;
    for (const p of [a, b, c]) expect(buildNativeRecomputeSpec({location: loc, prefs: p})).toBeNull();
  });

  it('returns null for a non-finite location', () => {
    expect(buildNativeRecomputeSpec({location: {latitude: NaN, longitude: 1} as never, prefs: prefs()})).toBeNull();
  });
});
