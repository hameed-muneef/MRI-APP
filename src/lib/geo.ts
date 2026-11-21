export type TravelMode = 'walking' | 'driving';

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters using the Haversine formula. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Format straight-line distance in Arabic using م (< 1 km) or كم (>= 1 km). */
export function formatArabicDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 م';
  if (meters < 1000) {
    return `${Math.round(meters)} م`;
  }
  const km = meters / 1000;
  const formatted = km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace(/\.0$/, '');
  return `${formatted} كم`;
}

/** Return a new array sorted nearest-first by distanceMeters. */
export function sortNearestFirst<T extends { distanceMeters: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Build the universal Google Maps directions URL using stored destination coordinates. */
export function buildGoogleMapsDirectionsUrl(
  lat: number,
  lon: number,
  travelMode: TravelMode = 'walking',
): string {
  const mode = travelMode === 'driving' ? 'driving' : 'walking';
  const safeLat = Number(lat.toFixed(5));
  const safeLon = Number(lon.toFixed(5));
  return `https://www.google.com/maps/dir/?api=1&destination=${safeLat},${safeLon}&travelmode=${mode}`;
}
