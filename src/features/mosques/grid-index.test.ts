import { describe, expect, it } from 'vitest';
import { buildGridIndex, searchGridIndex, selectCountryByCoordinates } from './grid-index';
import type { MosqueMeta, MosqueTuple } from './types';

describe('mosques grid index & country selection', () => {
  it('finds mosques across 0.05-degree cell boundaries', () => {
    // User at 24.7499, 46.6999 (just inside cell boundary 24.75 / 46.70)
    // Mosque just across boundary at 24.7505, 46.7005 (~90 meters away)
    const tuples: MosqueTuple[] = [
      ['1', 'مسجد الحدود', 24.7505, 46.7005],
      ['2', 'مسجد بعيد', 24.85, 46.85],
    ];
    const index = buildGridIndex(tuples);
    const { items } = searchGridIndex(index, 24.7499, 46.6999, 500, 20);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('1');
    expect(items[0].distanceMeters).toBeLessThan(150);
  });

  it('expands rings to cover larger radii up to 5 km and sorts nearest-first', () => {
    const tuples: MosqueTuple[] = [
      ['far', 'مسجد 4 كم', 24.736, 46.675], // ~4 km north of 24.70, 46.675
      ['near', 'مسجد قريب', 24.702, 46.675], // ~220 m north
      ['mid', 'مسجد 2 كم', 24.718, 46.675], // ~2 km north
    ];
    const index = buildGridIndex(tuples);
    const { items } = searchGridIndex(index, 24.7, 46.675, 5000, 10);
    expect(items.map((m) => m.id)).toEqual(['near', 'mid', 'far']);
  });

  it('returns empty array when no mosque is within radius', () => {
    const tuples: MosqueTuple[] = [['1', 'مسجد', 24.8, 46.8]];
    const index = buildGridIndex(tuples);
    const { items } = searchGridIndex(index, 24.7, 46.7, 500, 10);
    expect(items).toEqual([]);
  });

  it('selects nearest covered country by bbox/center and flags outside-region coordinates', () => {
    const meta: MosqueMeta = {
      version: 1,
      dataDate: '2026-11-20',
      attribution: '© OpenStreetMap',
      totalCount: 2,
      fields: ['id', 'name', 'lat', 'lon'],
      countries: {
        SA: {
          code: 'SA',
          nameAr: 'السعودية',
          count: 1,
          file: 'sa.json',
          rawBytes: 100,
          gzipBytes: 60,
          bbox: [16.3, 34.5, 32.1, 55.6],
          center: [23.88, 45.07],
        },
        EG: {
          code: 'EG',
          nameAr: 'مصر',
          count: 1,
          file: 'eg.json',
          rawBytes: 100,
          gzipBytes: 60,
          bbox: [22.0, 24.7, 31.6, 36.9],
          center: [26.82, 30.8],
        },
      },
    };

    const riyadh = selectCountryByCoordinates(meta, 24.7136, 46.6753);
    expect(riyadh.outsideCoveredRegion).toBe(false);
    expect(riyadh.country?.code).toBe('SA');

    const cairo = selectCountryByCoordinates(meta, 30.0444, 31.2357);
    expect(cairo.outsideCoveredRegion).toBe(false);
    expect(cairo.country?.code).toBe('EG');

    const london = selectCountryByCoordinates(meta, 51.5074, -0.1278);
    expect(london.outsideCoveredRegion).toBe(true);
    expect(london.country).toBeNull();
  });
});
