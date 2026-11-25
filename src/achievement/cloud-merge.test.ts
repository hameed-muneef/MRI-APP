import {beforeEach, describe, expect, it, vi} from 'vitest';
import {applyRemoteState, makeEntry} from './log';
import {bilQuranSummary} from './selectors';

// خادم وهمي: نمرّ على مسار التطبيق الحقيقي (fetchCloudState ثم دمج السجل) دون Supabase حي.
let rpcData: unknown = null;
vi.mock('../auth', () => ({authClient: {rpc: async () => ({data: rpcData, error: null}), from: () => { throw new Error('legacy path not expected'); }}}));

const stubStorage = () => {
  const store = new Map<string, string>();
  const ls = {get length() { return store.size; }, key: (i: number) => Array.from(store.keys())[i] ?? null, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); }, removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear()};
  vi.stubGlobal('window', {localStorage: ls, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}})});
  vi.stubGlobal('document', {documentElement: {dataset: {}, style: {colorScheme: ''}, setAttribute() {}}, querySelector: () => null});
  return store;
};

describe('cloud load merge and local backup restore', () => {
  beforeEach(() => { stubStorage(); });

  it('cloud response keeps entries from both devices, once each, and local-only entries are not lost', async () => {
    const {fetchCloudState} = await import('../cloud-state');
    const shared = makeEntry('adhkar_category', '1', '2026-11-24', 'x', new Date('2026-11-24T08:00:00Z'));
    const remoteOnly = makeEntry('wird_complete', 'w1', '2026-11-23', 'ورد', new Date('2026-11-23T08:00:00Z'));
    const localOnly = makeEntry('adhkar_category', '2', '2026-11-25', 'y', new Date('2026-11-25T08:00:00Z'));
    rpcData = {tasks: [], goals: [], wirds: [], reflections: [], lessonStep: 0, prayers: {}, achievementLog: [shared, remoteOnly]};
    const remote = await fetchCloudState('u1');
    expect(remote?.achievementLog?.map(e => e.id).sort()).toEqual([shared.id, remoteOnly.id].sort());
    const local = {...remote!, achievementLog: [{...shared, at: '2026-11-24T09:00:00Z'}, localOnly]};
    const merged = applyRemoteState(local, remote!);
    expect(merged.achievementLog!.map(e => e.id).sort()).toEqual([shared.id, remoteOnly.id, localOnly.id].sort());
    expect(merged.achievementLog!.find(e => e.id === shared.id)!.at).toBe('2026-11-24T08:00:00.000Z'); // الأقدم زمنًا
  });

  it('cloud state without a log (older client) does not wipe the local log', async () => {
    const {fetchCloudState} = await import('../cloud-state');
    rpcData = {tasks: [], goals: [], wirds: [], reflections: [], lessonStep: 0, prayers: {}};
    const remote = await fetchCloudState('u1');
    const e = makeEntry('adhkar_category', '1', '2026-11-25');
    expect(applyRemoteState({...remote!, achievementLog: [e]}, remote!).achievementLog).toEqual([e]);
  });

  it('backup restore, then a cloud load, keeps every entry', async () => {
    const store = stubStorage();
    const {exportLocalBackup, importLocalBackup} = await import('../local-backup');
    const {fetchCloudState} = await import('../cloud-state');
    const a = makeEntry('adhkar_category', '1', '2026-11-20');
    store.set('rabbani-v1', JSON.stringify({tasks: [], achievementLog: [a]}));
    const payload = exportLocalBackup();
    store.clear();
    const restored = importLocalBackup(JSON.stringify(payload));
    expect(restored?.achievementLog).toEqual([a]);
    const b = makeEntry('wird_complete', 'w', '2026-11-22');
    rpcData = {tasks: [], goals: [], wirds: [], reflections: [], lessonStep: 0, prayers: {}, achievementLog: [b]};
    const remote = await fetchCloudState('u1');
    const merged = applyRemoteState(restored!, remote!);
    expect(merged.achievementLog!.map(e => e.id).sort()).toEqual([a.id, b.id].sort());
  });
});

describe('bil-Quran step events', () => {
  const plan = {planId: 'x', direction: 'baqarah', currentIndex: 2, completedIndices: [0, 1], startedAt: '', updatedAt: ''} as never;
  const range = {start: '2026-11-23', end: '2026-11-29'};
  it('keeps one event per step identity and date, counts distinct days once, and credits progress from plan state', () => {
    const log = [makeEntry('bilquran_step', 'x#0', '2026-11-25'), makeEntry('bilquran_step', 'x#1', '2026-11-25'), makeEntry('bilquran_step', 'x#1', '2026-11-25'), makeEntry('bilquran_step', 'y#0', '2026-11-25')];
    const unique = new Map(log.map(e => [e.id, e]));
    expect(unique.size).toBe(3);
    const s = bilQuranSummary(plan, 10, [...unique.values()], range)!;
    expect(s.daysLogged).toBe(1);
    expect(s.stepsLogged).toBe(2);
    expect(s.done).toBe(2);
  });
});
