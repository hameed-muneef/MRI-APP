import { soundExtra, soundFieldsOf, type NativeNotificationPayload } from './native-prayer-scheduler';
import { isReminderAllowed } from './rules';
import type { NotificationPreference, Reminder } from './types';

/**
 * A daily or weekly custom reminder, described for the device so it can keep computing the next occurrences after the
 * app's own planning window ends. The device port (NativeReminderRules.java) reproduces nextDueDate in scheduler.ts for
 * exactly these two kinds, including its quirks: the wall time is the base instant read in the CURRENT time zone and the
 * weekly weekday is the base instant's weekday in the current zone. It is verified against the real builders by
 * scripts/gen-recurrence-parity.cjs and NativeReminderRulesParityTest.
 */
export interface NativeRecurrenceRule {
  rid: string;
  title: string;
  body: string;
  channelId: string;
  /** True when the reminder rings as an alarm; the device posts its occurrences on the alarm channel. */
  alarmMode: boolean;
  /** Imported sound file copied to the phone ("<key>.<ext>"), or a bundled raw name for an alarm. Absent = the normal sound. */
  soundKey?: string;
  rawSound?: string;
  kind: 'daily' | 'weekly';
  baseMs: number;
  /** YYYY-MM-DD or null. */
  start: string | null;
  end: string | null;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  /** 0 when not snoozed. */
  snoozeMs: number;
  /** The device only generates occurrences strictly after this instant (the last one already planned by the app). */
  frontierMs: number;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Pure. Rules for the reminders whose occurrences the app already planned in `extended` (near and far). Same gates as
 * buildNativeReminderPayloads: master switch, do not disturb, enabled, category. Reminders whose dates the device port
 * cannot reproduce exactly (a start date that is not a plain date) get no rule and keep only the planned occurrences.
 */
export function buildNativeRecurrenceRules(
  reminders: readonly Reminder[],
  prefs: NotificationPreference,
  now: Date,
  extended: readonly NativeNotificationPayload[],
  channelId: string,
  soundKeys?: ReadonlyMap<string, string>,
): NativeRecurrenceRule[] {
  if (!prefs.global_enabled || prefs.dnd_enabled) return [];
  const nowMs = now.getTime();
  const lastPlanned = new Map<string, number>();
  for (const p of extended) {
    const id = (p.extra as { reminderId?: string } | undefined)?.reminderId;
    if (!id) continue;
    lastPlanned.set(id, Math.max(lastPlanned.get(id) ?? 0, p.schedule.at.getTime()));
  }
  const out: NativeRecurrenceRule[] = [];
  for (const r of reminders) {
    if (r.id === 'quran-mastery-daily-review') continue;
    if (!r.enabled) continue;
    if (r.recurrence !== 'daily' && r.recurrence !== 'weekly') continue;
    if (!isReminderAllowed(r, { ...prefs, quiet_hours: { ...prefs.quiet_hours, enabled: false } }, now)) continue;
    const baseMs = new Date(r.scheduled_at).getTime();
    if (Number.isNaN(baseMs)) continue;
    const cfg = r.recurrence_config ?? {};
    let start: string | null = null;
    if (cfg.start_date) {
      if (!DATE_ONLY.test(cfg.start_date.trim())) continue;
      start = cfg.start_date.trim();
    }
    // endOfLocalDay ignores an end date that is not a plain date, so the rule does too.
    const end = cfg.end_date && DATE_ONLY.test(cfg.end_date.trim()) ? cfg.end_date.trim() : null;
    const snooze = r.snooze_until ? new Date(r.snooze_until).getTime() : 0;
    out.push({
      rid: r.id,
      title: r.title,
      body: r.description || 'تذكير مخصص',
      channelId,
      alarmMode: r.alarm_mode === true,
      ...soundFieldsOf({extra: soundExtra(r.sound_id ?? prefs.reminder_settings?.default_sound_id, r.alarm_mode === true)}, soundKeys),
      kind: r.recurrence,
      baseMs,
      start,
      end,
      quietOn: Boolean(prefs.quiet_hours?.enabled),
      quietStart: prefs.quiet_hours?.start ?? '',
      quietEnd: prefs.quiet_hours?.end ?? '',
      snoozeMs: Number.isNaN(snooze) ? 0 : snooze,
      frontierMs: Math.max(lastPlanned.get(r.id) ?? 0, nowMs),
    });
  }
  return out;
}
