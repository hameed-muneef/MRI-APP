// Regression: the single app-wide master switch (global_enabled) must gate every
// notification delivery path, and removing the per-category enable toggles must
// never re-enable delivery while the master switch is off.

import {describe, expect, it} from 'vitest';
import {pickDueItems} from './engine';
import {
  buildNativeReminderPayloads,
  buildNativeReviewPayloads,
  buildNativeTaskPayloads,
  GENERAL_CHANNEL_ID,
} from './native-prayer-scheduler';
import {isPrayerEventAllowed} from './prayer-planner';
import {isReminderAllowed} from './rules';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationPreference} from './types';
import type {Task, TaskSchedule} from '../app-state';

function makePrefs(patch: Partial<NotificationPreference> = {}): NotificationPreference {
  const base = structuredClone(DEFAULT_NOTIFICATION_PREFERENCE);
  return {
    ...base,
    ...patch,
    categories: {...base.categories, ...(patch.categories ?? {})},
    reminder_settings: {
      ...base.reminder_settings,
      ...(patch.reminder_settings ?? {}),
    },
    quiet_hours: {...base.quiet_hours, ...(patch.quiet_hours ?? {})},
  };
}

const offPrefs = makePrefs({global_enabled: false});
const now = new Date(2026, 10, 20, 14, 0, 0);

const tasks: Task[] = [
  {id: 't1', title: 'مراجعة', period: 'daily', done: false, optional: true},
];
const schedules: Record<string, TaskSchedule> = {
  t1: {
    title: 'مراجعة',
    sourceLabel: 'يومي مع الله',
    initialDate: '2026-11-20',
    initialTime: '14:00',
    confirmedDate: '2026-11-20',
    confirmedTime: '14:00',
  },
};
const taskContext = {tasks, taskSchedules: schedules, goals: [], dayPlan: null, prayers: {}};

describe('master switch gates every delivery path', () => {
  it('blocks in-app/web engine items: reminders, prayers, tasks, reviews', () => {
    const reminder = {
      id: 'r1', title: 'تذكير', description: '', category: 'reminder' as const,
      recurrence: 'daily' as const, time: '13:59', enabled: true,
      created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    const due = pickDueItems([reminder], {'الظهر': '14:00'}, offPrefs, new Set(), now, [], taskContext);
    expect(due).toEqual([]);
  });

  it('blocks native reminder payloads', () => {
    const reminder = {
      id: 'r1', title: 'تذكير', description: '', category: 'reminder' as const,
      recurrence: 'daily' as const, time: '15:00', enabled: true,
      created_at: now.toISOString(), updated_at: now.toISOString(),
    };
    expect(buildNativeReminderPayloads([reminder], offPrefs, now, GENERAL_CHANNEL_ID, true)).toEqual([]);
  });

  it('blocks native review payloads', () => {
    const passage = {id: 'p1', dueDate: '2026-11-20'} as never;
    expect(buildNativeReviewPayloads([passage], offPrefs, now, GENERAL_CHANNEL_ID, true)).toEqual([]);
  });

  it('blocks native task payloads', () => {
    expect(buildNativeTaskPayloads(taskContext, offPrefs, now, GENERAL_CHANNEL_ID, true)).toEqual([]);
  });

  it('blocks prayer events and personal reminders at the rule level', () => {
    expect(isPrayerEventAllowed({} as never, offPrefs, now)).toBe(false);
    expect(isReminderAllowed({category: 'reminder'}, offPrefs, now)).toBe(false);
  });

  it('normalized categories cannot re-enable delivery while the master switch is off', () => {
    // After category unification, categories are always all-true; global off must still block.
    const normalized = makePrefs({global_enabled: false, categories: {}});
    for (const key of Object.keys(normalized.categories)) {
      expect(normalized.categories[key]).toBe(true);
    }
    expect(isPrayerEventAllowed({} as never, normalized, now)).toBe(false);
    expect(isReminderAllowed({category: 'task'}, normalized, now)).toBe(false);
    expect(buildNativeTaskPayloads(taskContext, normalized, now, GENERAL_CHANNEL_ID, true)).toEqual([]);
  });

  it('master off still blocks when DND is off and quiet hours disabled', () => {
    const clean = makePrefs({global_enabled: false, dnd_enabled: false, quiet_hours: {enabled: false, start: '22:00', end: '06:00'}});
    expect(isPrayerEventAllowed({} as never, clean, now)).toBe(false);
    expect(isReminderAllowed({category: 'goal'}, clean, now)).toBe(false);
  });
});
