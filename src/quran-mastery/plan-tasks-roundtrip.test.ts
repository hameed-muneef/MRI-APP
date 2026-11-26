import {afterEach, describe, expect, it, vi} from 'vitest';
import {createSeed, loadFromRaw, type State, type Task} from '../app-state';
import {parseStoredState} from '../state-schema';
import {exportLocalBackup, importLocalBackup} from '../local-backup';
import {reconcilePlanTasks} from './plan-tasks';
import type {ActiveBilQuranPlanState, BilQuranDailyStep, BilQuranPlanSpec} from './bilquran-plans';

const spec = {id: 'p1', daysPerWeek: 6} as BilQuranPlanSpec;
const steps: BilQuranDailyStep[] = Array.from({length: 30}, (_, i) => ({index: i, dayNumber: i + 1, segments: [{surah: 2, from: i * 5 + 1, to: i * 5 + 5}], pageStart: 1, pageEnd: 1, verseCount: 5, approxPages: 1, isWeeklyMilestone: false}));
const plan: ActiveBilQuranPlanState = {planId: 'p1', direction: 'baqarah', currentIndex: 9, completedIndices: [0,1,2,3,4,5,6,7,8], startedAt: '2026-11-01T08:00:00Z', updatedAt: '2026-11-25T08:00:00'};
const now = new Date('2026-11-26T12:00:00');
const rec = (tasks: Task[]) => reconcilePlanTasks({tasks, plan, spec, steps, summarize: s => `آيات ${s.index}`, now, dueReviews: 2});

function mockStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const ls = {get length() {return store.size}, key: (i: number) => Array.from(store.keys())[i] ?? null, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear()};
  vi.stubGlobal('window', {localStorage: ls, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}})});
  vi.stubGlobal('document', {documentElement: {dataset: {}, style: {colorScheme: ''}, setAttribute() {}}, querySelector: () => null});
  return store;
}
afterEach(() => vi.unstubAllGlobals());

const userTasks: Task[] = [
  {id: 'u1', title: 'مهمتي', period: 'daily', done: false, optional: true},
  {id: 'u2', title: 'أسبوعية', period: 'weekly', done: true, optional: false, weekStart: '2026-11-23'},
  {id: 'u3', title: 'hifz يدوي', period: 'daily', done: false, optional: true, hifz: {passageId: 'x', sessionId: 's', surah: 1, from: 1, to: 7}},
];
const summary = (ts: Task[]) => [...ts].sort((a, b) => a.id.localeCompare(b.id));

describe('plan tasks survive backup, cloud shape and reload', () => {
  it('export -> import -> cloud JSON -> reconcile: no dup, no loss, user tasks byte-equal', () => {
    const base: State = {...createSeed(), tasks: rec(userTasks)};
    const planIds = base.tasks.filter(t => t.plan).map(t => t.id);
    expect(planIds.length).toBe(3);
    mockStorage({'rabbani-v1': JSON.stringify(base)});
    const payload = exportLocalBackup();
    mockStorage();
    const restored = importLocalBackup(JSON.stringify(payload))!;
    expect(summary(restored.tasks)).toEqual(summary(base.tasks));
    // cloud shape: JSON through jsonb, strict schema, loadFromRaw
    const cloud = loadFromRaw(JSON.stringify(JSON.parse(JSON.stringify(base))));
    expect(summary(cloud.tasks)).toEqual(summary(base.tasks));
    expect(() => parseStoredState(JSON.stringify(base))).not.toThrow();
    // reconcile after restore: identical, still 3 plan tasks, user tasks untouched
    const again = rec(restored.tasks);
    expect(again.filter(t => t.plan).map(t => t.id).sort()).toEqual([...planIds].sort());
    expect(summary(again.filter(t => !t.plan))).toEqual(summary(userTasks));
    expect(new Set(again.map(t => t.id)).size).toBe(again.length);
    // done flag on a plan task survives the round trip
    const doneBase: State = {...base, tasks: base.tasks.map(t => t.plan?.kind === 'day' ? {...t, done: true, doneKey: '2026-11-26'} : t)};
    const rt = loadFromRaw(JSON.stringify(doneBase));
    expect(rec(rt.tasks).find(t => t.plan?.kind === 'day')).toMatchObject({done: true, doneKey: '2026-11-26'});
  });
  it('a backup made before this feature (no Task.plan) imports and gains tasks without touching user tasks', () => {
    const old: State = {...createSeed(), tasks: userTasks};
    mockStorage();
    const restored = importLocalBackup(JSON.stringify({version: exportLocalBackup().version, app: exportLocalBackup().app, exportedAt: 'x', storage: {'rabbani-v1': JSON.stringify(old)}}))!;
    expect(summary(restored.tasks)).toEqual(summary(userTasks));
    expect(rec(restored.tasks).length).toBe(userTasks.length + 3);
  });
});
