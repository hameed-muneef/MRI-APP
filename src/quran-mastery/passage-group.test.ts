import {describe, expect, it} from 'vitest';
import {createEmptyMasteryState, masteryRootSchema} from './storage';

const base = createEmptyMasteryState(new Date('2026-11-24T10:00:00Z'));
const passage = (id: string, surah: number, extra: object = {}) => ({id, range: {surah, ayahStart: 1, ayahEnd: 3}, order: 0, schemaVersion: 1, createdAt: '2026-11-24T10:00:00Z', updatedAt: '2026-11-24T10:00:00Z', ...extra});

describe('passage group (multi-surah) storage compatibility', () => {
  it('loads a saved state from before the group field existed', () => {
    const r = masteryRootSchema.safeParse({...base, passages: [passage('a', 109)]});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.passages[0].group).toBeUndefined();
  });
  it('keeps the group list through parsing (it is not stripped)', () => {
    const group = [{surah: 109, ayahStart: 1, ayahEnd: 3}, {surah: 110, ayahStart: 1, ayahEnd: 3}];
    const r = masteryRootSchema.safeParse({...base, passages: [passage('a', 109, {group}), passage('b', 110, {group})]});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.passages.map(p => p.group?.length)).toEqual([2, 2]);
  });
  it('rejects a malformed group entry', () => {
    const r = masteryRootSchema.safeParse({...base, passages: [passage('a', 109, {group: [{surah: 'x'}]})]});
    expect(r.success).toBe(false);
  });
});
