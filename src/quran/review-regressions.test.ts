import {describe, expect, it} from 'vitest';
import {applyReview, buildPlanPassages, duePassages} from './learning';
import type {MemorizationPassage, MemorizationPlan, TargetUnit} from './types';

const plan = (targetUnit: TargetUnit): MemorizationPlan => ({
  id: 'plan', title: 'Across surahs', contentType: 'quran', startSurah: 1, startAyah: 6,
  endSurah: 2, endAyah: 3, dailyTarget: 5, targetUnit, schedule: {days: [1]},
  status: 'active', createdAt: '', updatedAt: '',
});
const verses = [{s: 1, a: 6, p: 1}, {s: 1, a: 7, p: 1}, {s: 2, a: 1, p: 1}, {s: 2, a: 2, p: 1}, {s: 2, a: 3, p: 1}];

describe('memorization boundary regressions', () => {
  for (const unit of ['verses', 'pages', 'half_pages'] as TargetUnit[]) {
    it(`preserves every verse across surahs for ${unit}`, () => {
      let id = 0;
      const passages = buildPlanPassages(plan(unit), verses, () => String(++id));
      const reconstructed = passages.flatMap(passage => {
        expect(passage.ayahEnd!).toBeGreaterThanOrEqual(passage.ayahStart!);
        return Array.from({length: passage.ayahEnd! - passage.ayahStart! + 1}, (_, index) => `${passage.surah}:${passage.ayahStart! + index}`);
      });
      expect(reconstructed).toEqual(verses.map(verse => `${verse.s}:${verse.a}`));
      expect(new Set(passages.map(passage => passage.id)).size).toBe(passages.length);
    });
  }
  it('keeps the original chunk sizes within one surah', () => {
    let id = 0;
    const passages = buildPlanPassages({...plan('verses'), dailyTarget: 3}, verses.map((verse, index) => ({...verse, s: 1, a: index + 1})), () => String(++id));
    expect(passages.map(passage => [passage.ayahStart, passage.ayahEnd])).toEqual([[1, 3], [4, 5]]);
  });
  it('returns mastered passages to review when their next due date arrives', () => {
    const passage: MemorizationPassage = {
      id: 'passage', planId: 'plan', contentType: 'quran', surah: 1, ayahStart: 1, ayahEnd: 3,
      state: 'good', ease: 2.5, intervalDays: 14, reviewCount: 4, lapses: 0, createdAt: '', updatedAt: '',
    };
    const result = applyReview(passage, 4, new Date(2026, 10, 23, 12)).passage;
    expect(result.state).toBe('mastered');
    expect(result.dueDate).toBe('2026-12-23');
    expect(duePassages([result], '2026-12-22')).toEqual([]);
    expect(duePassages([result], '2026-12-23')).toEqual([result]);
    expect(applyReview(result, 4, new Date(2026, 11, 23, 12)).passage.intervalDays).toBeGreaterThan(30);
  });
});
