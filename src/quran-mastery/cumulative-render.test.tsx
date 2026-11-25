import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {QuranAsset} from '../quran/types';
import HifzMushafMode from '../views/quran/HifzMushafMode';
import MasteryWorkspace from '../views/quran/MasteryWorkspace';
import {MASTERY_SCHEMA_VERSION, MASTERY_STORAGE_KEY, type MasteryStateRoot} from './types';

const asset: QuranAsset = {
  version: 'kfgqpc-hafs-v3.0',
  narration: 'حفص عن عاصم',
  script: 'عثماني',
  source: 'test',
  sourceUrl: 'https://example.test',
  generatedAt: '2026-11-24T00:00:00Z',
  counts: {surahs: 1, verses: 4, juz: 1, hizbs: 1, pages: 1},
  juzStarts: [{juz: 1, surah: 1, ayah: 1, global: 1}],
  hizbStarts: [{hizb: 1, surah: 1, ayah: 1, global: 1}],
  sajdas: [],
  surahs: [{n: 1, name: 'الفاتحة', ename: 'Al-Fatihah', type: 'مكية', ayahs: 7, order: 5}],
  verses: [
    {s: 1, a: 1, p: 1, j: 1, h: 1, t: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ۝١', e: 'بسم الله الرحمن الرحيم'},
    {s: 1, a: 2, p: 1, j: 1, h: 1, t: 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ ۝٢', e: 'الحمد لله رب العالمين'},
    {s: 1, a: 3, p: 1, j: 1, h: 1, t: 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ۝٣', e: 'الرحمن الرحيم'},
    {s: 1, a: 4, p: 1, j: 1, h: 1, t: 'مَٰلِكِ يَوْمِ ٱلدِّينِ ۝٤', e: 'مالك يوم الدين'},
  ],
};

describe('cumulative linking UI rendering', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    const storageMock = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    vi.stubGlobal('localStorage', storageMock);
    vi.stubGlobal('window', {localStorage: storageMock});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders HifzMushafMode entry without errors', () => {
    const html = renderToStaticMarkup(<HifzMushafMode asset={asset} notify={() => {}} />);
    expect(html).toContain('مصحف الحفظ والإتقان');
    expect(html).toContain('حفظ');
    expect(html).toContain('مراجعة');
  });

  it('renders MasteryWorkspace connect stage with cumulative scope option and preview', () => {
    const now = '2026-11-24T12:00:00Z';
    const seeded: MasteryStateRoot = {
      schemaVersion: MASTERY_SCHEMA_VERSION,
      plans: [],
      passages: [{id: 'p1', range: {surah: 1, ayahStart: 1, ayahEnd: 4}, order: 0, schemaVersion: 1, createdAt: now, updatedAt: now}],
      sessions: [{id: 's1', purpose: 'new', passageId: 'p1', range: {surah: 1, ayahStart: 1, ayahEnd: 4}, stage: 'connect', stages: ['listen', 'understand', 'memorize', 'connect', 'recite', 'assess'], startedAt: now, updatedAt: now}],
      repetitionEvents: [],
      recallAttempts: [],
      assessments: [],
      projections: [],
      schedules: [],
      recordings: [],
      updatedAt: now,
    };
    store.set(MASTERY_STORAGE_KEY, JSON.stringify(seeded));

    const html = renderToStaticMarkup(<MasteryWorkspace asset={asset} purpose="new" notify={() => {}} />);
    expect(html).toContain('مصحف الحفظ والإتقان');
    expect(html).toContain('اربط');
    expect(html).toContain('استئناف');
  });
});
