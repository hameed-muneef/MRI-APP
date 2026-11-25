// الموقع المستخدم لجدولة أذان الهاتف: المدينة المحفوظة إن وُجدت، وإلا موقع الجهاز/الموقع اليدوي المركزي.
// نفس المصدر الذي تُعرض منه المواقيت في الشاشة، حتى لا تظهر مواقيت بلا أذان مجدول.
import {getCentralLocationState} from '../lib/location-store';
import {sanitizePrayerLocation, type PrayerLocation} from '../prayer-location';

export function resolveSchedulingLocation(saved: unknown, zone?: string): PrayerLocation | undefined {
  const city = sanitizePrayerLocation(saved);
  if (city) return city;
  const coords = getCentralLocationState().coords;
  if (!coords) return undefined;
  const timezone = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return sanitizePrayerLocation({
    name: 'موقعي', country: '', latitude: coords.latitude, longitude: coords.longitude, timezone,
  });
}
