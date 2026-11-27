import {describe, expect, it} from 'vitest';
import {
  MAX_IMPORT_BYTES,
  decodeImportBytes,
  importableItems,
  importedToReminder,
  parseReminderImport,
  resolveModes,
} from './reminder-import';
import type {Reminder} from './types';

const now = new Date(2026, 10, 27, 20, 0, 0);
const existing: Reminder[] = [{
  id: 'r1', user_id: '', title: 'موجود', scheduled_at: '2026-11-28T07:00:00', recurrence: 'daily',
  category: 'reminder', enabled: true,
} as Reminder];

describe('reminder import: reading the file', () => {
  it('refuses an empty, oversize or non-UTF-8 file with an Arabic reason', () => {
    expect(decodeImportBytes(new Uint8Array()).fileProblem).toMatch(/فارغ/);
    expect(decodeImportBytes(new Uint8Array(MAX_IMPORT_BYTES + 1)).fileProblem).toMatch(/٥١٢/);
    expect(decodeImportBytes(new Uint8Array([0xff, 0xfe, 0xfd])).fileProblem).toMatch(/UTF-8/);
  });

  it('strips a BOM and keeps Arabic text intact', () => {
    const bytes = new TextEncoder().encode('\uFEFF[{"title":"قراءة"}]');
    expect(decodeImportBytes(bytes).text).toBe('[{"title":"قراءة"}]');
  });

  it('refuses text that is not a reminder list', () => {
    expect(parseReminderImport('not json', {defaultMode: 'reminder', now}).fileProblem).toMatch(/JSON/);
    expect(parseReminderImport('{"a":1}', {defaultMode: 'reminder', now}).fileProblem).toMatch(/قائمة/);
    expect(parseReminderImport('[]', {defaultMode: 'reminder', now}).fileProblem).toMatch(/فارغة/);
  });

  it('accepts an array or an object with reminders', () => {
    const array = parseReminderImport('[{"title":"أ","time":"07:30"}]', {defaultMode: 'reminder', now});
    expect(array.items).toHaveLength(1);
    const wrapped = parseReminderImport('{"reminders":[{"title":"ب","time":"08:00"}]}', {defaultMode: 'reminder', now});
    expect(wrapped.items[0].title).toBe('ب');
  });
});

describe('reminder import: rows', () => {
  it('normalises ISO, date+time, and time-only rows', () => {
    const result = parseReminderImport(JSON.stringify([
      {title: 'ا', scheduled_at: '2026-12-01T09:15:00'},
      {title: 'ب', date: '2026-12-02', time: '6:05'},
      {title: 'ج', time: '21:00'},
    ]), {defaultMode: 'reminder', now});
    expect(result.items.map(item => item.scheduled_at)).toEqual([
      '2026-12-01T09:15:00',
      '2026-12-02T06:05:00',
      '2026-11-27T21:00:00',
    ]);
  });

  it('rejects rows without a title or a valid time and keeps the reason', () => {
    const result = parseReminderImport(JSON.stringify([
      {time: '07:00'},
      {title: 'بلا وقت'},
      {title: 'وقت خطأ', time: '25:99'},
    ]), {defaultMode: 'reminder', now});
    expect(result.items.every(item => item.problem)).toBe(true);
    expect(importableItems(result.items)).toHaveLength(0);
  });

  it('marks duplicates inside the file and against existing reminders', () => {
    const result = parseReminderImport(JSON.stringify([
      {title: 'موجود', time: '07:00', recurrence: 'daily'},
      {title: 'جديد', time: '09:00'},
      {title: 'جديد', time: '09:00'},
    ]), {defaultMode: 'reminder', existing, now});
    expect(result.items[0].duplicate).toBe(true);
    expect(result.items[1].duplicate).toBe(false);
    expect(result.items[2].duplicate).toBe(true);
    expect(importableItems(result.items)).toHaveLength(1);
  });

  it('reads the mode from the file when it names one', () => {
    const result = parseReminderImport(JSON.stringify([
      {title: 'ا', time: '07:00', mode: 'alarm'},
      {title: 'ب', time: '08:00', mode: 'تنبيه'},
      {title: 'ج', time: '09:00', alarmMode: true},
    ]), {defaultMode: 'reminder', now});
    expect(result.items.map(item => item.fileMode)).toEqual(['alarm', 'reminder', 'alarm']);
  });
});

describe('reminder import: choosing the mode', () => {
  it('applies the import-wide choice, and a per-row choice wins over it', () => {
    const parsed = parseReminderImport(JSON.stringify([
      {title: 'ا', time: '07:00'},
      {title: 'ب', time: '08:00'},
    ]), {defaultMode: 'reminder', now});
    const all = resolveModes(parsed.items, {defaultMode: 'alarm'});
    expect(all.map(item => item.alarmMode)).toEqual([true, true]);
    const mixed = resolveModes(parsed.items, {defaultMode: 'alarm', overrides: {'import-1': 'reminder'}});
    expect(mixed.map(item => item.alarmMode)).toEqual([true, false]);
  });

  it('follows the file hints by default and lets the import-wide choice override them', () => {
    const parsed = parseReminderImport(JSON.stringify([
      {title: 'ا', time: '07:00', mode: 'alarm'},
      {title: 'ب', time: '08:00'},
      {title: 'ج', time: '09:00', mode: 'تنبيه'},
    ]), {defaultMode: 'reminder', now});
    expect(resolveModes(parsed.items, {defaultMode: 'file'}).map(item => item.alarmMode)).toEqual([true, false, false]);
    expect(resolveModes(parsed.items, {defaultMode: 'alarm'}).map(item => item.alarmMode)).toEqual([true, true, true]);
    expect(resolveModes(parsed.items, {defaultMode: 'file', overrides: {'import-0': 'reminder'}}).map(item => item.alarmMode))
      .toEqual([false, false, false]);
  });

  it('builds a reminder that carries the alarm flag only when it is on', () => {
    const [alarmRow] = parseReminderImport('[{"title":"ا","time":"07:00","mode":"alarm"}]', {defaultMode: 'reminder', now}).items;
    const reminder = importedToReminder(alarmRow, 'new-1', now);
    expect(reminder.alarm_mode).toBe(true);
    expect(reminder.recurrence).toBe('none');
    expect(reminder.enabled).toBe(true);
    const [normalRow] = parseReminderImport('[{"title":"ب","time":"08:00"}]', {defaultMode: 'reminder', now}).items;
    expect(importedToReminder(normalRow, 'new-2', now).alarm_mode).toBeUndefined();
  });
});
