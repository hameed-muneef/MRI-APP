import {describe, expect, it} from 'vitest';
import type {Task} from '../app-state';
import type {ActiveBilQuranPlanState, BilQuranDailyStep, BilQuranPlanSpec} from './bilquran-plans';
import {clearPlanTasks, planTaskLaunch, reconcilePlanTasks, stepFinishedToday} from './plan-tasks';

const spec = {id: 'p1', daysPerWeek: 6} as BilQuranPlanSpec;
const steps: BilQuranDailyStep[] = Array.from({length: 30}, (_, i) => ({
  index: i, dayNumber: i + 1, segments: [{surah: 2, from: i * 5 + 1, to: i * 5 + 5}], pageStart: 1, pageEnd: 1, verseCount: 5, approxPages: 1, isWeeklyMilestone: (i + 1) % 6 === 0,
}));
const plan = (o: Partial<ActiveBilQuranPlanState> = {}): ActiveBilQuranPlanState => ({planId: 'p1', direction: 'baqarah', currentIndex: 0, completedIndices: [], startedAt: '2026-11-01T08:00:00Z', updatedAt: '2026-11-01T08:00:00Z', ...o});
const now = new Date('2026-11-26T12:00:00');
const run = (tasks: Task[], p: ActiveBilQuranPlanState, extra: {dueReviews?: number; now?: Date} = {}) =>
  reconcilePlanTasks({tasks, plan: p, spec, steps, summarize: s => `آيات ${s.index}`, now, ...extra});
const mine = {id: 'u1', title: 'مهمتي', period: 'daily' as const, done: false, optional: true};

describe('plan tasks', () => {
  it('day 1: one daily task, no weekly or monthly yet, user tasks untouched', () => {
    const out = run([mine], plan());
    expect(out.map(t => t.id)).toEqual(['u1', 'bilquran:p1:d:0']);
    expect(out[1]).toMatchObject({period: 'daily', scheduledDate: '2026-11-26', plan: {planId: 'p1', kind: 'day', step: 0}});
  });
  it('is idempotent: same input returns the same array, no duplicates', () => {
    const first = run([mine], plan({currentIndex: 7, completedIndices: [0, 1, 2, 3, 4, 5, 6]}));
    expect(run(first, plan({currentIndex: 7, completedIndices: [0, 1, 2, 3, 4, 5, 6]}), {now: new Date('2026-11-26T12:00:00')})).toBe(first);
    expect(first.filter(t => t.id.startsWith('bilquran:')).length).toBe(3);
  });
  it('weekly review from step 1, monthly after more than a week of material, with weekStart Monday and monthKey', () => {
    const week = run([], plan({currentIndex: 1, completedIndices: [0], updatedAt: '2026-11-25T08:00:00'}));
    expect(week.find(t => t.plan?.kind === 'week')).toMatchObject({period: 'weekly', weekStart: '2026-11-23', scheduledDate: '2026-11-27'});
    expect(week.find(t => t.plan?.kind === 'month')).toBeUndefined();
    const month = run([], plan({currentIndex: 8, completedIndices: [0, 1, 2, 3, 4, 5, 6, 7], updatedAt: '2026-11-25T08:00:00'}));
    expect(month.find(t => t.plan?.kind === 'month')).toMatchObject({period: 'monthly', monthKey: '2026-11', scheduledDate: '2026-11-30'});
  });
  it('progress-based: a missed day keeps the same step, date moves to today, done flag survives', () => {
    const a = run([], plan({currentIndex: 3, completedIndices: [0, 1, 2], updatedAt: '2026-11-20T08:00:00'}), {now: new Date('2026-11-21T09:00:00')});
    const b = run(a, plan({currentIndex: 3, completedIndices: [0, 1, 2], updatedAt: '2026-11-20T08:00:00'}));
    const day = b.filter(t => t.plan?.kind === 'day');
    expect(day.length).toBe(1);
    expect(day[0].id).toBe('bilquran:p1:d:3');
    expect(day[0].scheduledDate).toBe('2026-11-26');
  });
  it('completing the step removes its task and does not open tomorrow\'s step the same day', () => {
    const before = run([mine], plan({currentIndex: 2, completedIndices: [0, 1], updatedAt: '2026-11-26T08:00:00'}), {now});
    expect(stepFinishedToday(plan({currentIndex: 3, completedIndices: [0, 1, 2], updatedAt: '2026-11-26T11:00:00'}), now)).toBe(true);
    const after = run(before, plan({currentIndex: 3, completedIndices: [0, 1, 2], updatedAt: '2026-11-26T11:00:00'}));
    expect(after.some(t => t.plan?.kind === 'day')).toBe(false);
    expect(after.find(t => t.id === 'u1')).toBeDefined();
    const nextDay = run(after, plan({currentIndex: 3, completedIndices: [0, 1, 2], updatedAt: '2026-11-26T11:00:00'}), {now: new Date('2026-11-27T07:00:00')});
    expect(nextDay.find(t => t.plan?.kind === 'day')?.id).toBe('bilquran:p1:d:3');
  });
  it('due reviews are a note only; the step itself does not change', () => {
    const out = run([], plan(), {dueReviews: 4});
    expect(out[0].title).toContain('ومعه 4 مراجعة مستحقة');
    expect(out[0].plan?.step).toBe(0);
  });
  it('keeps a done weekly review for its own week and drops stale ones', () => {
    const p = plan({currentIndex: 3, completedIndices: [0, 1, 2], updatedAt: '2026-11-20T08:00:00'});
    const seed = run([], p);
    const wk = seed.find(t => t.plan?.kind === 'week')!;
    const ticked = seed.map(t => t.id === wk.id ? {...t, done: true, doneKey: wk.weekStart} : t);
    expect(run(ticked, p).find(t => t.id === wk.id)?.done).toBe(true);
    const old: Task = {...wk, id: 'bilquran:p1:w:2026-11-16', weekStart: '2026-11-16'};
    expect(run([...ticked, old], p).some(t => t.id === old.id)).toBe(false);
  });
  it('clearPlanTasks removes only generated tasks', () => {
    const t = run([mine], plan());
    expect(clearPlanTasks(t).map(x => x.id)).toEqual(['u1']);
    expect(clearPlanTasks([mine])).toEqual([mine]);
  });
  it('launch: day opens the step in new mode with its index; week and month open review of past steps only', () => {
    const p = plan({currentIndex: 10, completedIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]});
    expect(planTaskLaunch({plan: {planId: 'p1', kind: 'day', step: 10}}, p, spec, steps)).toMatchObject({mode: 'new', planStepIndex: 10, surah: 2, ayahStart: 51, ayahEnd: 55, autoStart: true});
    const wk = planTaskLaunch({plan: {planId: 'p1', kind: 'week'}}, p, spec, steps)!;
    expect(wk.mode).toBe('review');
    expect(wk.group).toBeUndefined();
    expect(wk.ayahStart).toBe(21);
    expect(wk.ayahEnd).toBe(50);
    const mo = planTaskLaunch({plan: {planId: 'p1', kind: 'month'}}, p, spec, steps)!;
    expect(mo.ayahStart).toBe(1);
    expect(mo.ayahEnd).toBe(50);
    expect(planTaskLaunch({plan: {planId: 'p1', kind: 'week'}}, plan(), spec, steps)).toBeNull();
  });
});
