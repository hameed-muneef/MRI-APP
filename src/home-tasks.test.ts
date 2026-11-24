import {describe, expect, it} from 'vitest';
import {nearestTasks} from './home-tasks';
import type {Task, TaskSchedule} from './app-state';

const now = new Date('2026-11-24T10:00:00');
const day = (offset: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-CA');
};
const task = (id: string, period: Task['period'], extra: Partial<Task> = {}): Task =>
  ({id, title: `مهمة ${id}`, period, done: false, optional: true, ...extra});

describe('nearestTasks', () => {
  it('orders by date and marks overdue, date-only tasks get no time', () => {
    const tasks = [
      task('b', 'weekly', {scheduledDate: day(2), weekStart: day(-2)}),
      task('a', 'weekly', {scheduledDate: day(-1), weekStart: day(-7)}),
      task('c', 'monthly', {scheduledDate: day(1), monthKey: day(1).slice(0, 7)}),
    ];
    const result = nearestTasks(tasks, {}, {}, now);
    expect(result.map(r => r.id)).toEqual(['a', 'c', 'b']);
    expect(result[0].overdue).toBe(true);
    expect(result[1].overdue).toBe(false);
    expect(result.every(r => r.time === '')).toBe(true);
  });

  it('prefers schedule confirmed date/time over task fields', () => {
    const tasks = [task('x', 'weekly', {scheduledDate: day(3), weekStart: day(-2)})];
    const schedules: Record<string, TaskSchedule> = {
      x: {title: 'مهمة x', sourceLabel: '', confirmedDate: day(0), confirmedTime: '18:30'},
    };
    const [item] = nearestTasks(tasks, schedules, {}, now);
    expect(item.date).toBe(day(0));
    expect(item.time).toBe('18:30');
    expect(item.overdue).toBe(false);
  });

  it('counts daily tasks as today and skips done tasks', () => {
    const tasks = [
      task('d', 'daily'),
      task('done', 'daily', {done: true, doneKey: day(0)}),
    ];
    const result = nearestTasks(tasks, {}, {}, now);
    expect(result.map(r => r.id)).toEqual(['d']);
    expect(result[0].date).toBe(day(0));
  });

  it('respects the limit and excludes unscheduled non-daily tasks', () => {
    const tasks = [
      task('u', 'weekly', {weekStart: day(-2)}),
      task('1', 'daily'),
      task('2', 'daily'),
      task('3', 'daily'),
      task('4', 'daily'),
    ];
    const result = nearestTasks(tasks, {}, {}, now, 3);
    expect(result).toHaveLength(3);
    expect(result.some(r => r.id === 'u')).toBe(false);
  });
});
