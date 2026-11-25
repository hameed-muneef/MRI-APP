import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {QuranAsset} from '../quran/types';
import BilQuranPlansBrowser from '../views/quran/BilQuranPlansBrowser';
import HifzMushafMode from '../views/quran/HifzMushafMode';
import {
  BILQURAN_PLANS,
  BILQURAN_PLAN_STORAGE_KEY,
  BILQURAN_TRACKS,
  buildBilQuranDailySteps,
  buildWeeklyReviewSegments,
  clearActiveBilQuranPlan,
  completeBilQuranStep,
  findBilQuranPlan,
  formatStepSummary,
  loadActiveBilQuranPlan,
  saveActiveBilQuranPlan,
} from './bilquran-plans';

const quranAsset = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/quran/quran-hafs-uthmani.json'), 'utf8'),
) as QuranAsset;

describe('bilquran Hifz plans catalog and scheduler', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    const storageMock = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    vi.stubGlobal('localStorage', storageMock);
    vi.stubGlobal('window', {localStorage: storageMock, dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn()});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes all tracks and beginner durations matching Bil-Quran Nahya', () => {
    expect(BILQURAN_TRACKS.map(t => t.id)).toEqual(['all', 'beginner', 'baqarah', 'nas']);
    const beginners = BILQURAN_PLANS.filter(p => p.track === 'beginner');
    expect(beginners.map(p => p.durationMonths)).toEqual([10, 14, 26, 48]);
    expect(beginners.map(p => p.title)).toEqual([
      'الخطة الثالثة للمبتدئين',
      'الخطة الثانية للمبتدئين',
      'الخطة الأولى للمبتدئين',
      'خطة المبتدئين الممتدة',
    ]);
    expect(BILQURAN_PLANS.some(p => p.track === 'baqarah')).toBe(true);
    expect(BILQURAN_PLANS.some(p => p.track === 'nas')).toBe(true);
  });

  it('partitions surahs 2..114 completely without gaps or duplicates in Baqarah->Nas direction', () => {
    const plan = findBilQuranPlan('beginner-10m')!;
    const steps = buildBilQuranDailySteps(quranAsset, plan, 'baqarah');
    expect(steps.length).toBeGreaterThan(280);
    expect(steps.length).toBeLessThan(330);
    expect(steps[0].segments[0].surah).toBe(2);
    expect(steps[0].segments[0].from).toBe(1);

    const seen = new Set<string>();
    for (const step of steps) {
      for (const seg of step.segments) {
        for (let a = seg.from; a <= seg.to; a++) {
          const key = `${seg.surah}:${a}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
    const expectedCount = quranAsset.verses.filter(v => v.s >= 2).length;
    expect(seen.size).toBe(expectedCount);
    const lastStepSegs = steps[steps.length - 1].segments;
    const lastSeg = lastStepSegs[lastStepSegs.length - 1];
    expect(lastSeg.surah).toBe(114);
    expect(lastSeg.to).toBe(6);
  });

  it('partitions surahs 114->2 completely with forward ayahs per surah in Nas->Baqarah direction', () => {
    const plan = findBilQuranPlan('beginner-14m')!;
    const steps = buildBilQuranDailySteps(quranAsset, plan, 'nas');
    expect(steps.length).toBeGreaterThan(370);
    expect(steps.length).toBeLessThan(440);
    expect(steps[0].segments[0].surah).toBe(114);
    expect(steps[0].segments[0].from).toBe(1);

    const seen = new Set<string>();
    for (const step of steps) {
      for (const seg of step.segments) {
        expect(seg.from).toBeLessThanOrEqual(seg.to);
        for (let a = seg.from; a <= seg.to; a++) {
          const key = `${seg.surah}:${a}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
        }
      }
    }
    const expectedCount = quranAsset.verses.filter(v => v.s >= 2).length;
    expect(seen.size).toBe(expectedCount);
    const lastStepSegs = steps[steps.length - 1].segments;
    const lastSeg = lastStepSegs[lastStepSegs.length - 1];
    expect(lastSeg.surah).toBe(2);
    expect(lastSeg.to).toBe(286);
  });

  it('supports every plan pace across the Mushaf', () => {
    for (const plan of BILQURAN_PLANS) {
      const steps = buildBilQuranDailySteps(quranAsset, plan, plan.defaultDirection);
      expect(steps.length).toBeGreaterThan(100);
      expect(formatStepSummary(quranAsset, steps[0]).length).toBeGreaterThan(3);
    }
  });

  it('persists, advances, merges weekly review segments, and clears active plan', () => {
    const plan = findBilQuranPlan('beginner-26m')!;
    const steps = buildBilQuranDailySteps(quranAsset, plan, 'nas');
    saveActiveBilQuranPlan({
      planId: plan.id,
      direction: 'nas',
      currentIndex: 0,
      completedIndices: [],
      startedAt: '2026-11-24T12:00:00Z',
      updatedAt: '2026-11-24T12:00:00Z',
    });

    const loaded = loadActiveBilQuranPlan();
    expect(loaded?.planId).toBe('beginner-26m');
    expect(loaded?.direction).toBe('nas');

    const advanced = completeBilQuranStep(loaded!, 0, steps.length);
    expect(advanced.completedIndices).toEqual([0]);
    expect(advanced.currentIndex).toBe(1);

    const reviewSegs = buildWeeklyReviewSegments(steps, 3, 6);
    expect(reviewSegs.length).toBeGreaterThan(0);

    clearActiveBilQuranPlan();
    expect(loadActiveBilQuranPlan()).toBeNull();
    expect(store.has(BILQURAN_PLAN_STORAGE_KEY)).toBe(false);
  });

  it('renders BilQuranPlansBrowser and HifzMushafMode entry with active plan cleanly', () => {
    const htmlBrowser = renderToStaticMarkup(
      <BilQuranPlansBrowser asset={quranAsset} activePlan={null} onActivatePlan={() => {}} />,
    );
    expect(htmlBrowser).toContain('اختر الخطة التي تناسب وقتك');
    expect(htmlBrowser).toContain('من البقرة ← الناس');
    expect(htmlBrowser).toContain('من الناس ← البقرة');
    expect(htmlBrowser).toContain('الخطة الثالثة للمبتدئين');
    expect(htmlBrowser).toContain('خطة المبتدئين الممتدة');

    saveActiveBilQuranPlan({
      planId: 'beginner-10m',
      direction: 'nas',
      currentIndex: 0,
      completedIndices: [],
      startedAt: '2026-11-24T12:00:00Z',
      updatedAt: '2026-11-24T12:00:00Z',
    });
    const htmlEntry = renderToStaticMarkup(<HifzMushafMode asset={quranAsset} notify={() => {}} />);
    expect(htmlEntry).toContain('خطتي المعتمدة');
    expect(htmlEntry).toContain('من الناس ← البقرة');
    expect(htmlEntry).toContain('ابدأ مقرر اليوم');
    expect(htmlEntry).toContain('خطط الحفظ والمراجعة');
  });
});
