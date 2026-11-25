import {describe, expect, it} from 'vitest';
import {buildNativeReviewPayloads, GENERAL_CHANNEL_ID} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE, type NotificationPreference} from './types';
import type {MemorizationPassage} from '../quran/types';

function makePrefs(patch: Partial<NotificationPreference> = {}): NotificationPreference {
  return {...structuredClone(DEFAULT_NOTIFICATION_PREFERENCE), ...patch};
}

function passage(dueDate: string, extra: Partial<MemorizationPassage> = {}): MemorizationPassage {
  return {
    id: `p-${dueDate}-${extra.surah ?? 'x'}`,
    contentType: 'quran',
    surah: 1,
    ayahStart: 1,
    ayahEnd: 7,
    state: 'review',
    ease: 2.5,
    intervalDays: 3,
    dueDate,
    reviewCount: 2,
    lapses: 0,
    createdAt: '',
    updatedAt: '',
    ...extra,
  } as MemorizationPassage;
}

// الأربعاء 2026-11-25
const NOW = new Date(2026, 10, 25, 10, 0, 0);

describe('buildNativeReviewPayloads', () => {
  it('schedules a future due review at 9:00 local on its due date', () => {
    const out = buildNativeReviewPayloads([passage('2026-11-27')], makePrefs(), NOW);
    expect(out).toHaveLength(1);
    const at = out[0].schedule.at;
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(10);
    expect(at.getDate()).toBe(27);
    expect(at.getHours()).toBe(9);
    expect(at.getMinutes()).toBe(0);
    expect(out[0].channelId).toBe(GENERAL_CHANNEL_ID);
    expect(out[0].extra?.rabbaniKind).toBe('review');
  });

  it('schedules a review due today before 9am for today at 9am', () => {
    const early = new Date(2026, 10, 25, 7, 30, 0);
    const out = buildNativeReviewPayloads([passage('2026-11-25')], makePrefs(), early);
    expect(out).toHaveLength(1);
    expect(out[0].schedule.at.getDate()).toBe(25);
    expect(out[0].schedule.at.getHours()).toBe(9);
  });

  it('catches up an overdue review at the next 9am instead of firing instantly', () => {
    const out = buildNativeReviewPayloads([passage('2026-11-20')], makePrefs(), NOW);
    expect(out).toHaveLength(1);
    const at = out[0].schedule.at;
    expect(at.getDate()).toBe(26);
    expect(at.getHours()).toBe(9);
    expect(at.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('never schedules in the past and skips reviews beyond the horizon', () => {
    const out = buildNativeReviewPayloads([passage('2026-12-20')], makePrefs(), NOW);
    expect(out).toHaveLength(0);
  });

  it('skips invalid due dates instead of crashing the sync', () => {
    const broken = passage('not-a-date');
    const out = buildNativeReviewPayloads([broken], makePrefs(), NOW);
    expect(out).toHaveLength(0);
  });

  it('respects global kill-switch, DND, the reminder category; a legacy in_app channel still schedules a device alarm', () => {
    const p = passage('2026-11-26');
    expect(buildNativeReviewPayloads([p], makePrefs({global_enabled: false}), NOW)).toHaveLength(0);
    expect(buildNativeReviewPayloads([p], makePrefs({dnd_enabled: true}), NOW)).toHaveLength(0);
    const noCategory = makePrefs();
    noCategory.categories = {...noCategory.categories, reminder: false};
    expect(buildNativeReviewPayloads([p], noCategory, NOW)).toHaveLength(0);
    const inApp = makePrefs();
    inApp.reminder_settings = {...inApp.reminder_settings, default_channel: 'in_app'};
    expect(buildNativeReviewPayloads([p], inApp, NOW)).not.toHaveLength(0);
  });

  it('does not schedule a review during quiet hours', () => {
    const quiet = makePrefs();
    quiet.quiet_hours = {enabled: true, start: '06:00', end: '10:00'};
    expect(buildNativeReviewPayloads([passage('2026-11-26')], quiet, NOW)).toHaveLength(0);
    quiet.quiet_hours = {enabled: true, start: '22:00', end: '08:00'};
    expect(buildNativeReviewPayloads([passage('2026-11-26')], quiet, NOW)).toHaveLength(1);
  });

  it('uses stable ids and the same Arabic title as the in-app engine', () => {
    const [a] = buildNativeReviewPayloads([passage('2026-11-26', {surah: 2, ayahStart: 255, ayahEnd: 255})], makePrefs(), NOW);
    const [b] = buildNativeReviewPayloads([passage('2026-11-26', {surah: 2, ayahStart: 255, ayahEnd: 255})], makePrefs(), NOW);
    expect(a.id).toBe(b.id);
    expect(a.title).toContain('سورة 2');
    expect(a.title).toContain('مراجعة حفظ');
  });

  it('marks payloads exact when the exact-alarm permission is granted', () => {
    const [exact] = buildNativeReviewPayloads([passage('2026-11-26')], makePrefs(), NOW, GENERAL_CHANNEL_ID, true);
    const [inexact] = buildNativeReviewPayloads([passage('2026-11-26')], makePrefs(), NOW, GENERAL_CHANNEL_ID, false);
    expect(exact.isExactNotification).toBe(true);
    expect(inexact.isExactNotification).toBe(false);
  });
});
