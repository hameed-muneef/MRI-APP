import {describe, expect, it} from 'vitest';
import {buildNextUp, relativeLabel} from './next-up';

const at = (h: number, m: number) => new Date(2026, 10, 27, h, m, 0, 0);

describe('next up', () => {
  it('labels now, soon, later and late in Arabic', () => {
    expect(relativeLabel(0)).toBe('الآن');
    expect(relativeLabel(15)).toBe('بعد ١٥ د');
    expect(relativeLabel(75)).toBe('بعد ١ س و١٥ د');
    expect(relativeLabel(-10)).toBe('متأخرة ١٠ د');
  });
  it('picks the 3 nearest, pins the most recent late one, untimed last', () => {
    const items = [
      {id: 'a', time: '19:30'}, {id: 'b', time: '18:50'}, {id: 'c', time: '21:00'},
      {id: 'd', time: '20:00'}, {id: 'e', time: ''}, {id: 'f', time: '17:00'},
    ];
    const rows = buildNextUp(items, at(19, 0));
    expect(rows.map(r => r.id)).toEqual(['b', 'a', 'd']);
    expect(rows[0].state).toBe('late');
  });
  it('re-sorts as time passes and when a task is done', () => {
    const items = [{id: 'a', time: '19:30'}, {id: 'b', time: '20:00'}, {id: 'c', time: '21:00'}, {id: 'd', time: '22:00'}];
    expect(buildNextUp(items, at(19, 0)).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(buildNextUp(items.filter(i => i.id !== 'a'), at(19, 0)).map(r => r.id)).toEqual(['b', 'c', 'd']);
    expect(buildNextUp(items, at(19, 45)).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(buildNextUp(items, at(19, 45))[0].state).toBe('late');
  });
  it('fills with untimed tasks only when slots remain and never invents a time', () => {
    const rows = buildNextUp([{id: 'x', time: ''}, {id: 'y', time: '20:00'}], at(19, 0));
    expect(rows.map(r => r.id)).toEqual(['y', 'x']);
    expect(rows[1].minutes).toBeNull();
  });
});
