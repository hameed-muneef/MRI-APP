import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFileProvider } from './provider';
import type { MosqueMeta, MosqueTuple } from './types';

describe('LocalFileProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lazy-loads only the selected country file and returns nearest mosques', async () => {
    const meta: MosqueMeta = {
      version: 1,
      dataDate: '2026-11-20',
      attribution: '© مساهمو OpenStreetMap — قد تكون البيانات غير مكتملة',
      totalCount: 2,
      fields: ['id', 'name', 'lat', 'lon', 'loc?'],
      countries: {
        EG: {
          code: 'EG',
          nameAr: 'مصر',
          count: 2,
          file: 'eg.json',
          rawBytes: 120,
          gzipBytes: 80,
          bbox: [22, 24.7, 31.6, 36.9],
          center: [26.82, 30.8],
        },
      },
    };
    const egTuples: MosqueTuple[] = [
      ['m1', '', 30.0446, 31.2358, 'القاهرة'],
      ['m2', 'مسجد النور', 30.048, 31.239],
    ];

    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/data/meta.json') {
        return new Response(JSON.stringify(meta), { status: 200 });
      }
      if (url === '/data/eg.json') {
        return new Response(JSON.stringify(egTuples), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new LocalFileProvider('/data');
    const res = await provider.findNearby(30.0444, 31.2357, 1000, 10);

    expect(res.outsideCoveredRegion).toBe(false);
    expect(res.countryCode).toBe('EG');
    expect(res.mosques.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second query in same country reuses in-memory index without re-fetching eg.json
    const res2 = await provider.findNearby(30.0445, 31.2357, 1000, 10);
    expect(res2.mosques.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    provider.dispose();
  });

  it('returns outsideCoveredRegion=true without fetching any country file when outside Arab region', async () => {
    const meta: MosqueMeta = {
      version: 1,
      dataDate: '2026-11-20',
      attribution: '© مساهمو OpenStreetMap',
      totalCount: 1,
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
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(meta), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new LocalFileProvider('/data');
    const res = await provider.findNearby(48.8566, 2.3522, 3000, 10);
    expect(res.outsideCoveredRegion).toBe(true);
    expect(res.mosques).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // Only meta.json fetched
    provider.dispose();
  });

  it('falls back to overlapping border country when primary bbox has no mosques within radius', async () => {
    const meta: MosqueMeta = {
      version: 1,
      dataDate: '2026-11-21',
      attribution: '© OpenStreetMap',
      totalCount: 2,
      fields: ['id', 'name', 'lat', 'lon'],
      countries: {
        QA: {
          code: 'QA',
          nameAr: 'قطر',
          count: 1,
          file: 'qa.json',
          rawBytes: 100,
          gzipBytes: 60,
          bbox: [24.553, 50.726, 26.13, 51.615],
          center: [25.3548, 51.1839],
        },
        SA: {
          code: 'SA',
          nameAr: 'السعودية',
          count: 1,
          file: 'sa.json',
          rawBytes: 100,
          gzipBytes: 60,
          bbox: [16.376, 34.743, 31.813, 51.5],
          center: [23.8859, 45.0792],
        },
      },
    };
    const qaTuples: MosqueTuple[] = [['q1', 'مسجد الدوحة', 25.2854, 51.531]];
    const saTuples: MosqueTuple[] = [['s1', 'مسجد سلوى', 24.731, 50.791]];

    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/data/meta.json') return new Response(JSON.stringify(meta), { status: 200 });
      if (url === '/data/qa.json') return new Response(JSON.stringify(qaTuples), { status: 200 });
      if (url === '/data/sa.json') return new Response(JSON.stringify(saTuples), { status: 200 });
      return new Response('Not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new LocalFileProvider('/data');
    // User in Salwa, Saudi Arabia (inside QA bbox rectangle too, closer to QA center)
    const res = await provider.findNearby(24.73, 50.79, 1000, 10);
    expect(res.outsideCoveredRegion).toBe(false);
    expect(res.countryCode).toBe('SA');
    expect(res.mosques.map((m) => m.id)).toEqual(['s1']);
    provider.dispose();
  });
});
