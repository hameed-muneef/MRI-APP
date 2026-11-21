import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsDirectionsUrl,
  formatArabicDistance,
  haversineMeters,
  sortNearestFirst,
} from './geo';

describe('geo utilities', () => {
  it('computes accurate Haversine distance in meters', () => {
    // Same point -> 0
    expect(haversineMeters(24.7136, 46.6753, 24.7136, 46.6753)).toBe(0);

    // ~1.11 km north (0.01 deg latitude)
    const dist = haversineMeters(24.7, 46.67, 24.71, 46.67);
    expect(dist).toBeGreaterThan(1100);
    expect(dist).toBeLessThan(1125);
  });

  it('formats distances in Arabic م below 1000m and كم at/above 1000m', () => {
    expect(formatArabicDistance(0)).toBe('0 م');
    expect(formatArabicDistance(349.6)).toBe('350 م');
    expect(formatArabicDistance(999)).toBe('999 م');
    expect(formatArabicDistance(1000)).toBe('1 كم');
    expect(formatArabicDistance(1240)).toBe('1.2 كم');
    expect(formatArabicDistance(12540)).toBe('12.5 كم');
  });

  it('sorts items nearest-first without mutating original array', () => {
    const items = [
      { id: 'c', distanceMeters: 1400 },
      { id: 'a', distanceMeters: 120 },
      { id: 'b', distanceMeters: 650 },
    ];
    const sorted = sortNearestFirst(items);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('builds Google Maps directions URL for walking and driving', () => {
    expect(buildGoogleMapsDirectionsUrl(24.7136123, 46.6753199, 'walking')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=24.71361,46.67532&travelmode=walking',
    );
    expect(buildGoogleMapsDirectionsUrl(30.0444, 31.2357, 'driving')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=30.0444,31.2357&travelmode=driving',
    );
  });
});
