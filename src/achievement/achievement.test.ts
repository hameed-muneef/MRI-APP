import {afterEach, describe, expect, it, vi} from 'vitest';
import {appendEntry, makeEntry, mergeLogs, ACHIEVEMENT_LOG_LIMIT} from './log';
import {periodRange} from './dates';
import {goalStats, planWindow, prayerStats, readingIn, toneOf, verseCoverage} from './selectors';
import {createEmptyMasteryState} from '../quran-mastery/storage';
import {parseStoredState} from '../state-schema';
import {exportLocalBackup, importLocalBackup} from '../local-backup';
import type {MasteryStateRoot} from '../quran-mastery/types';

const NOW = new Date('2026-11-25T12:00:00'); // الأربعاء
const plan = (over: object = {}) => ({id: 'p1', title: 'خطة', range: {surah: 2, ayahStart: 1, ayahEnd: 286}, weekdays: [0, 1, 2, 3, 4], timezone: 'Africa/Cairo', dailyTargetVerses: 5, repeatPreset: 3, status: 'active', schemaVersion: 1, createdAt: '2026-11-01T08:00:00+02:00', updatedAt: '2026-11-01T08:00:00+02:00', ...over}) as never;
function root(sessions: {day: string; from: number; to: number; reason?: string}[], extra: Partial<MasteryStateRoot> = {}): MasteryStateRoot {
  const base = createEmptyMasteryState(NOW);
  return {...base, plans: [plan()], passages: [{id: 'ps1', planId: 'p1', range: {surah: 2, ayahStart: 1, ayahEnd: 50}, order: 0, schemaVersion: 1, createdAt: '', updatedAt: ''}],
    sessions: sessions.map((s, i) => ({id: `s${i}`, purpose: 'new', passageId: 'ps1', range: {surah: 2, ayahStart: s.from, ayahEnd: s.to}, stage: 'assess', stages: [], startedAt: `${s.day}T09:00:00+02:00`, updatedAt: '', endedAt: `${s.day}T09:30:00+02:00`, completionReason: s.reason ?? 'completed'})) as never, ...extra};
}

describe('achievement log', () => {
  it('dedups by id and keeps the earliest record on merge', () => {
    const a = makeEntry('adhkar_category', '1', '2026-11-25', 'x', new Date('2026-11-25T08:00:00Z'));
    const b = {...a, at: '2026-11-25T09:00:00Z'};
    expect(appendEntry([a], b)).toHaveLength(1);
    expect(mergeLogs([b], [a])[0].at).toBe(a.at);
    expect(mergeLogs([a], [makeEntry('adhkar_category', '2', '2026-11-25')])).toHaveLength(2);
  });
  it('trims to the newest dates when over the limit', () => {
    const many = Array.from({length: ACHIEVEMENT_LOG_LIMIT + 5}, (_, i) => makeEntry('wird_complete', String(i), `2026-01-${String((i % 28) + 1).padStart(2, '0')}`));
    expect(mergeLogs(many, []).length).toBe(ACHIEVEMENT_LOG_LIMIT);
  });
});

describe('periods and tones', () => {
  it('week starts Monday and spans 7 days', () => {
    expect(periodRange('week', NOW)).toEqual({start: '2026-11-23', end: '2026-11-29', today: '2026-11-25'});
  });
  it('tone follows achievement vs plan; nothing planned is neutral, not failure', () => {
    expect(toneOf(5, 5)).toBe('good'); expect(toneOf(8, 10)).toBe('steady'); expect(toneOf(7, 10)).toBe('behind'); expect(toneOf(1, 5)).toBe('behind'); expect(toneOf(12, 10)).toBe('good'); expect(toneOf(0, 0)).toBe('none');
  });
});

describe('quran plan window', () => {
  it('excludes unassigned weekdays, treats today as pending and pre-plan days as unknown', () => {
    const r = root([{day: '2026-11-23', from: 1, to: 5}, {day: '2026-11-24', from: 6, to: 8}]);
    const w = planWindow(r, plan(), 'week', NOW);
    const kinds = Object.fromEntries(w.days.map(d => [d.date, d.kind]));
    expect(kinds['2026-11-23']).toBe('done');     // الإثنين ٥ آيات
    expect(kinds['2026-11-24']).toBe('partial');  // الثلاثاء ٣ آيات
    expect(kinds['2026-11-25']).toBe('pending');  // اليوم لا يُحسب فائتًا
    expect(kinds['2026-11-27']).toBe('future');
    expect(w.assigned).toBe(2); expect(w.full).toBe(1);
    expect(w.plannedVerses).toBe(10); expect(w.doneVerses).toBe(8);
  });
  it('marks days before the plan existed as unknown and Friday/Saturday off', () => {
    const w = planWindow(root([]), plan({createdAt: '2026-11-25T08:00:00+02:00', weekdays: [0, 1, 2, 3, 4]}), 'week', NOW);
    expect(w.days.find(d => d.date === '2026-11-23')?.kind).toBe('unknown');
    expect(w.assigned).toBe(0);
  });
  it('ignores abandoned sessions and other plans', () => {
    const r = root([{day: '2026-11-23', from: 1, to: 5, reason: 'abandoned'}]);
    expect(planWindow(r, plan(), 'week', NOW).days.find(d => d.date === '2026-11-23')?.kind).toBe('missed');
  });
});

describe('verse coverage across both stores', () => {
  const legacy = (state: string, at: string | undefined, a = 1, b = 10) => ({id: 'l' + state, contentType: 'quran', surah: 2, ayahStart: a, ayahEnd: b, state, lastReviewedAt: at}) as never;
  it('counts each verse once when stores overlap', () => {
    const r = root([{day: '2026-11-23', from: 1, to: 5}]);
    const c = verseCoverage(r, {passages: [legacy('good', '2026-10-01T00:00:00Z', 1, 10)]});
    expect(c.started).toBe(50); // اتحاد ١-٥٠ من الجديد و١-١٠ من القديم دون جمع
  });
  it('newest evidence wins so a newer weak review overrides an older mastered one', () => {
    const r = root([{day: '2026-11-23', from: 1, to: 5}]);
    const c = verseCoverage(r, {passages: [legacy('mastered', '2020-01-01T00:00:00Z', 1, 10)]});
    // المخزن الجديد بلا إسقاط مؤرّخ: غير المؤرّخ أدنى أولوية من المؤرّخ القديم، فتبقى راسخة
    expect(c.mastered).toBe(10);
    const weakNew = verseCoverage({...r, projections: [{passageId: 'ps1', state: 'needs_reinforcement', evidence: [], policyVersion: '1', updatedAt: '2026-11-20T00:00:00Z'}]}, {passages: [legacy('mastered', '2020-01-01T00:00:00Z', 1, 10)]});
    expect(weakNew.mastered).toBe(0); expect(weakNew.weak).toBe(50);
  });
  it('legacy-only without dates is reported as undated, never invented', () => {
    const c = verseCoverage(null, {passages: [legacy('mastered', undefined, 1, 3)]});
    expect(c).toEqual({started: 3, mastered: 3, weak: 0, undated: 3});
  });
});

describe('reading, goals and prayers', () => {
  it('flags truncated reading history', () => {
    const history = Array.from({length: 500}, (_, i) => ({id: String(i), surah: 1, ayahStart: 1, ayahEnd: 7, readAt: `2026-11-${String(25 - (i % 3)).padStart(2, '0')}T08:00:00Z`}));
    expect(readingIn({history}, {start: '2026-11-01', end: '2026-11-30'}).truncated).toBe(true);
    expect(readingIn({history: history.slice(0, 3)}, {start: '2026-11-23', end: '2026-11-29'})).toMatchObject({sessions: 3, verses: 7, truncated: false});
  });
  it('goal steps only count inside the goal range up to today', () => {
    const goals = [{id: 'g', title: 't', benefit: '', createdAt: '2026-11-24', steps: [{id: 's', title: 'x', period: 'daily', done: {'2026-11-24': true}}]}] as never;
    expect(goalStats(goals, 'week', NOW)).toEqual({planned: 2, done: 1});
  });
  it('unrecorded prayers are unknown, not missed', () => {
    const p = prayerStats({'2026-11-25': {date: '2026-11-25', savedAt: '', items: [], prayers: {الفجر: 'ontime', الظهر: 'late'}}}, 'week', NOW);
    expect(p).toMatchObject({ontime: 1, late: 1, missed: 0, recorded: 2, expected: 15, unknown: 13});
  });
});

describe('persistence boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('schema keeps achievementLog instead of stripping it', () => {
    const e = makeEntry('bilquran_step', 'plan', '2026-11-25', '3');
    expect(parseStoredState(JSON.stringify({tasks: [], achievementLog: [e]})).achievementLog).toEqual([e]);
  });
  it('log survives a local backup export and import via rabbani-v1', () => {
    const store = new Map<string, string>();
    const ls = {get length() { return store.size; }, key: (i: number) => Array.from(store.keys())[i] ?? null, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear()};
    vi.stubGlobal('window', {localStorage: ls, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}})});
    vi.stubGlobal('document', {documentElement: {dataset: {}, style: {colorScheme: ''}, setAttribute() {}}, querySelector: () => null});
    const e = makeEntry('adhkar_category', '1', '2026-11-25', 'x');
    store.set('rabbani-v1', JSON.stringify({tasks: [], achievementLog: [e]}));
    const payload = exportLocalBackup();
    store.clear();
    const restored = importLocalBackup(JSON.stringify(payload));
    expect(restored?.achievementLog).toEqual([e]);
  });
});
