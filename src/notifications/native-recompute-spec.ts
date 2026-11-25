// Versioned spec persisted natively so Android can top up the main Adhan alarms without opening the app.
// Native side: android/app/src/main/java/com/alrabbaniyoon/app/NativeAdhanPlanner.java (validated against this file).
import {
  defaultMethodForCoordinates,
  mapAlAdhanMadhab,
  mapAlAdhanMethod,
  prayerNameAr,
  type PrayerMadhab,
  type PrayerMethod,
} from '../lib/prayer-schedule';
import type {PrayerLocation} from '../prayer-location';
import {getSelectedDefaultAdhanId, resolvePrayerAdhan} from '../sounds/adhan-catalog';
import type {NotificationPreference, PrayerName} from './types';

export const NATIVE_RECOMPUTE_SPEC_VERSION = 1;
const KEYS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
const AR: Record<(typeof KEYS)[number], PrayerName> = {Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء'};

export interface NativeRecomputeSpec {
  v: number;
  lat: number;
  lon: number;
  method: PrayerMethod;
  hanafi: boolean;
  adjust: Record<(typeof KEYS)[number], number>;
  quiet: {enabled: boolean; start: string; end: string};
  prayers: Record<(typeof KEYS)[number], {enabled: boolean; type: 'full' | 'short' | 'silent'; raw: string; sound: string; nameAr: string}>;
}

/** Returns null when the adhan builder itself would schedule nothing (master/DND/category off), so native stays idle. */
export function buildNativeRecomputeSpec(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  defaultAdhanId?: string;
}): NativeRecomputeSpec | null {
  const {location, prefs} = opts;
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.prayer === false) return null;
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return null;
  const method = opts.method ?? (location.method === undefined
    ? defaultMethodForCoordinates(location.latitude, location.longitude)
    : mapAlAdhanMethod(location.method));
  const madhab = opts.madhab ?? mapAlAdhanMadhab(location.school);
  const fallback = opts.defaultAdhanId ?? getSelectedDefaultAdhanId();
  const adjust = {} as NativeRecomputeSpec['adjust'];
  const prayers = {} as NativeRecomputeSpec['prayers'];
  for (const k of KEYS) {
    const s = prefs.prayer_settings?.[AR[k]];
    adjust[k] = s?.adjust_minutes ?? 0;
    const adhan = resolvePrayerAdhan(s?.sound_id, fallback);
    const type = s?.adhan_type ?? 'full';
    prayers[k] = {
      enabled: !!s?.enabled,
      type: type === 'short' ? 'short' : type === 'silent' ? 'silent' : 'full',
      raw: adhan.rawName,
      sound: adhan.name,
      nameAr: prayerNameAr(k),
    };
  }
  return {
    v: NATIVE_RECOMPUTE_SPEC_VERSION,
    lat: location.latitude,
    lon: location.longitude,
    method,
    hanafi: madhab === 'Hanafi',
    adjust,
    quiet: {
      enabled: !!prefs.quiet_hours?.enabled,
      start: prefs.quiet_hours?.start ?? '22:00',
      end: prefs.quiet_hours?.end ?? '06:00',
    },
    prayers,
  };
}
