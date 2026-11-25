import {nativeMasteryReminders} from '../quran-mastery/reminders';
import {loadMasteryState} from '../quran-mastery/storage';
// src/notifications/native-prayer-scheduler.ts
// جدولة أذان الصلاة (AlarmManager + AdhanPlaybackService) والمنبهات عبر @capacitor/local-notifications (Android/iOS).
// تعمل فقط في بيئة Capacitor (native). في الويب تُتجاهل (no-op).
import {
  computePrayerSchedule,
  defaultMethodForCoordinates,
  mapAlAdhanMadhab,
  mapAlAdhanMethod,
  prayerId,
  prayerNameAr,
  type PrayerMadhab,
  type PrayerMethod,
} from '../lib/prayer-schedule';
import {
  cancelNativeAdhanAlarms,
  ensureNativeAdhanChannel,
  getAndroidEnvironmentStatus,
  scheduleNativeAdhanAlarms,
  setNativeRecomputeSpec,
  type NativeAdhanAlarmInput,
} from '../lib/settings-opener';
import type { PrayerLocation } from '../prayer-location';
import type { MemorizationPassage } from '../quran/types';
import {
  getSelectedDefaultAdhanId,
  resolvePrayerAdhan,
} from '../sounds/adhan-catalog';
import { buildNativeRecomputeSpec } from './native-recompute-spec';
import { isReminderAllowed } from './rules';
import { upcomingOccurrences } from './scheduler';
import { rebalanceNativeReminderQueue, setNativeReminderQueue } from '../lib/settings-opener';
import { dailyTaskEvents, type TaskScheduleContext } from './task-planner';
import {
  getTaskNotificationSettings,
  isQuietHoursActive,
  type NotificationPreference,
  type PrayerName,
  type Reminder,
} from './types';

export const ADHAN_CHANNEL_ID = 'al-rabbani-adhan-adhan_almulla-v1';
export const GENERAL_CHANNEL_ID = 'al-rabbani-general';
/** قناة تذكيرات الصلوات الصامتة: إشعار على الجهاز بلا صوت ولا اهتزاز. */
export const SILENT_REMINDER_CHANNEL_ID = 'al-rabbani-reminder-silent-v1';

export const NOTIFICATIONS_CHANGED_EVENT = 'rabbani:notifications-changed';
export const NATIVE_SCHEDULE_UPDATED_EVENT = 'rabbani:native-schedule-updated';

const PRAYER_IDS_STORAGE_KEY = 'rabbani-native-prayer-ids-v1';
const REMINDER_IDS_STORAGE_KEY = 'rabbani-native-reminder-ids-v1';
const TASK_IDS_STORAGE_KEY = 'rabbani-native-task-ids-v1';
const REVIEW_IDS_STORAGE_KEY = 'rabbani-native-review-ids-v1';
/** أفق جدولة الأذان بالأيام. يُحدَّث عند كل فتح للتطبيق (يوميًا)، فيبقى الأفق ≥ 29 يومًا بعد أي فتح. */
export const MAX_SCHEDULE_DAYS = 30;
export const DEFAULT_SCHEDULE_DAYS = 30;
const MAX_PRAYER_ALARMS = 350;
const MAX_REMINDER_ALARMS = 80;
const MAX_TASK_ALARMS = 80;
const MAX_REVIEW_ALARMS = 40;
/** أفق جدولة تنبيهات المراجعة على الهاتف (أيام). */
const REVIEW_HORIZON_DAYS = 7;
/** وقت تنبيه مراجعة الحفظ اليومي — يطابق محرك التسليم داخل التطبيق. */
const REVIEW_HOUR = 9;

/** Marker option: build the same payloads over the long "far queue" window (see syncFarQueue). */
export interface FarQueueExtent { far: true }
export const FAR_QUEUE: FarQueueExtent = { far: true };
export const FAR_QUEUE_DAYS = 30;
export const FAR_QUEUE_OCCURRENCES = 40;
export const FAR_QUEUE_MAX_ITEMS = 400;

/**
 * Pure: the payloads of the long window that LocalNotifications did not register, as plain queue rows.
 * Same ids, titles, bodies and channels as the registered ones, so nothing is duplicated or reworded.
 */
export function farQueueItems(
  extended: readonly NativeNotificationPayload[],
  registered: readonly NativeNotificationPayload[],
): Array<{ id: number; at: number; title: string; body: string; channelId: string }> {
  const have = new Set(registered.map((p) => p.id));
  return extended
    .filter((p) => !have.has(p.id))
    .map((p) => ({ id: p.id, at: p.schedule.at.getTime(), title: p.title, body: p.body, channelId: p.channelId ?? GENERAL_CHANNEL_ID }));
}

/**
 * Android 7.x (API 24-25) has no notification channels, and LocalNotifications then plays the configured sound and
 * vibrates for every notification, including silent-prayer reminders. The user decided silent means a device
 * notification without audio, so on those versions silent before/after reminders go through the native queue,
 * which posts them without sound or vibration. Android 8+ keeps using the channel (no sound) as before.
 */
export function splitSilentForLegacyAndroid<T extends { channelId?: string }>(
  payloads: readonly T[],
  sdkInt: number | undefined,
): { registered: T[]; queued: T[] } {
  if (typeof sdkInt !== 'number' || sdkInt >= 26) return { registered: [...payloads], queued: [] };
  return {
    registered: payloads.filter((p) => p.channelId !== SILENT_REMINDER_CHANNEL_ID),
    queued: payloads.filter((p) => p.channelId === SILENT_REMINDER_CHANNEL_ID),
  };
}

export interface NativeScheduleOptions {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number; // 7..30
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
}

export interface NativeScheduleResult {
  scheduled: number;
  cancelled: number;
  warning?: string;
  permission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  exactAlarm: 'granted' | 'denied' | 'unsupported';
  channelId?: string;
  soundMode?: 'adhan' | 'default';
}

export interface ActiveChannelInfo {
  adhanChannelId: string;
  soundFile: string;
  soundTitle: string;
  soundMode: 'adhan' | 'default';
}

export interface NativeNotificationPayload {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle: boolean };
  channelId: string;
  foreground?: boolean;
  isExactNotification?: boolean;
  extra?: Record<string, unknown>;
}

export function channelIdForRawSound(rawName: string): string {
  return `al-rabbani-adhan-${rawName}-v1`;
}

let cachedChannelInfo: ActiveChannelInfo = {
  adhanChannelId: ADHAN_CHANNEL_ID,
  soundFile: 'adhan_almulla.ogg',
  soundTitle: 'الملا',
  soundMode: 'adhan',
};

let syncQueue: Promise<unknown> = Promise.resolve();

function enqueueSync<T>(task: () => Promise<T>): Promise<T> {
  const next = syncQueue.catch(() => undefined).then(task);
  syncQueue = next.catch(() => undefined);
  return next;
}

export function notifyNativePrefsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
  }
}

export function getActiveAdhanChannelInfo(): ActiveChannelInfo {
  return cachedChannelInfo;
}

function isNative(): boolean {
  return typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform === 'function'
    && !!(window as unknown as { Capacitor: { isNativePlatform: () => boolean } }).Capacitor.isNativePlatform();
}

async function loadPlugin() {
  try {
    const mod = await import('@capacitor/local-notifications');
    // Returning the Capacitor plugin proxy from an async function makes the runtime look up `.then` on it, and
    // Capacitor rejects that with '"LocalNotifications.then()" is not implemented on android'. Hide `then` so the
    // plugin is handed back as a plain value.
    return new Proxy(mod.LocalNotifications, {
      get: (target, prop, receiver) => (prop === 'then' ? undefined : Reflect.get(target, prop, receiver)),
    });
  } catch {
    return null;
  }
}

function loadTrackedIds(storageKey: string): number[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is number => typeof x === 'number' && Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

function saveTrackedIds(storageKey: string, ids: number[]): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch { /* ignore */ }
}

function prayerNameFromKey(key: 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'): PrayerName {
  switch (key) {
    case 'Fajr': return 'الفجر';
    case 'Dhuhr': return 'الظهر';
    case 'Asr': return 'العصر';
    case 'Maghrib': return 'المغرب';
    case 'Isha': return 'العشاء';
  }
}

/**
 * Pure builder for main prayer Adhan alarms dispatched via native AlarmManager -> AdhanPlaybackService.
 * Only ordinary Adhan MP3 voices are resolved (Eid Takbeerat is strictly excluded).
 */
export function buildNativeAdhanAlarmInputs(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
  defaultAdhanId?: string;
}): NativeAdhanAlarmInput[] {
  const { prefs, location } = opts;
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.prayer === false) {
    return [];
  }

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const days = Math.max(7, Math.min(MAX_SCHEDULE_DAYS, opts.days ?? DEFAULT_SCHEDULE_DAYS));
  const method = opts.method ?? (location.method === undefined
    ? defaultMethodForCoordinates(location.latitude, location.longitude)
    : mapAlAdhanMethod(location.method));
  const madhab = opts.madhab ?? mapAlAdhanMadhab(location.school);
  const fallbackAdhanId = opts.defaultAdhanId ?? getSelectedDefaultAdhanId();

  const schedule = computePrayerSchedule(
    { latitude: location.latitude, longitude: location.longitude },
    now,
    days,
    method,
    madhab,
    {
      fajr: prefs.prayer_settings?.['الفجر']?.adjust_minutes,
      dhuhr: prefs.prayer_settings?.['الظهر']?.adjust_minutes,
      asr: prefs.prayer_settings?.['العصر']?.adjust_minutes,
      maghrib: prefs.prayer_settings?.['المغرب']?.adjust_minutes,
      isha: prefs.prayer_settings?.['العشاء']?.adjust_minutes,
    },
  );

  const alarms: NativeAdhanAlarmInput[] = [];
  for (const item of schedule) {
    const prayerName = prayerNameFromKey(item.prayer);
    const setting = prefs.prayer_settings?.[prayerName];
    if (!setting?.enabled) continue;
    const adhanType = setting.adhan_type ?? 'full';

    if (item.at.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, item.at)) {
      const adhan = resolvePrayerAdhan(setting.sound_id, fallbackAdhanId);
      alarms.push({
        id: prayerId(item.date, item.prayer),
        triggerAtMs: item.at.getTime(),
        title: `حان وقت صلاة ${prayerNameAr(item.prayer)}`,
        body: adhanType === 'silent' ? `وقت ${prayerNameAr(item.prayer)}: ${item.hhmm}` : `وقت ${prayerNameAr(item.prayer)}: ${item.hhmm} · ${adhan.name}`,
        rawSound: adhan.rawName,
        soundTitle: adhan.name,
        adhanType: adhanType === 'short' ? 'short' : adhanType === 'silent' ? 'silent' : 'full',
        prayerKey: `${item.date}:${item.prayer}`,
      });
    }
  }

  alarms.sort((a, b) => a.triggerAtMs - b.triggerAtMs);
  return alarms.slice(0, MAX_PRAYER_ALARMS);
}

/**
 * Pure builder for before/after prayer reminder notifications scheduled through @capacitor/local-notifications.
 */
export function buildNativeBeforeAfterPayloads(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
  generalChannelId?: string;
  exactAlarm?: boolean;
}): NativeNotificationPayload[] {
  const { prefs, location } = opts;
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.prayer === false) {
    return [];
  }

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const days = Math.max(7, Math.min(MAX_SCHEDULE_DAYS, opts.days ?? DEFAULT_SCHEDULE_DAYS));
  const method = opts.method ?? (location.method === undefined
    ? defaultMethodForCoordinates(location.latitude, location.longitude)
    : mapAlAdhanMethod(location.method));
  const madhab = opts.madhab ?? mapAlAdhanMadhab(location.school);
  const generalChannelId = opts.generalChannelId ?? GENERAL_CHANNEL_ID;
  const isExact = opts.exactAlarm !== false;

  const schedule = computePrayerSchedule(
    { latitude: location.latitude, longitude: location.longitude },
    now,
    days,
    method,
    madhab,
    {
      fajr: prefs.prayer_settings?.['الفجر']?.adjust_minutes,
      dhuhr: prefs.prayer_settings?.['الظهر']?.adjust_minutes,
      asr: prefs.prayer_settings?.['العصر']?.adjust_minutes,
      maghrib: prefs.prayer_settings?.['المغرب']?.adjust_minutes,
      isha: prefs.prayer_settings?.['العشاء']?.adjust_minutes,
    },
  );

  const notifications: NativeNotificationPayload[] = [];
  for (const item of schedule) {
    const prayerName = prayerNameFromKey(item.prayer);
    const setting = prefs.prayer_settings?.[prayerName];
    if (!setting?.enabled) continue;
    const adhanType = setting.adhan_type ?? 'full';
    // الصلاة الصامتة: تذكيرات قبل/بعد تصل إشعارًا على الجهاز عبر قناة بلا صوت ولا اهتزاز.
    const reminderChannelId = adhanType === 'silent' ? SILENT_REMINDER_CHANNEL_ID : generalChannelId;

    const before = setting.remind_before_minutes ?? 0;
    if (before > 0) {
      const beforeAt = new Date(item.at.getTime() - before * 60000);
      if (beforeAt.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, beforeAt)) {
        notifications.push({
          id: prayerId(item.date, `${item.prayer}-before`),
          title: `تذكير: ${prayerNameAr(item.prayer)} بعد ${before} دقيقة`,
          body: 'استعد للصلاة.',
          schedule: { at: beforeAt, allowWhileIdle: true },
          channelId: reminderChannelId,
          foreground: true,
          isExactNotification: isExact,
          extra: { rabbaniKind: 'prayer', prayer: item.prayer, date: item.date, eventType: 'before' },
        });
      }
    }

    const after = setting.remind_after_minutes ?? 0;
    if (after > 0) {
      const afterAt = new Date(item.at.getTime() + after * 60000);
      if (afterAt.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, afterAt)) {
        notifications.push({
          id: prayerId(item.date, `${item.prayer}-after`),
          title: `بعد أذان ${prayerNameAr(item.prayer)} · ${after} دقيقة`,
          body: 'اتبع الصلاة بالذكر والاستغفار.',
          schedule: { at: afterAt, allowWhileIdle: true },
          channelId: reminderChannelId,
          foreground: true,
          isExactNotification: isExact,
          extra: { rabbaniKind: 'prayer', prayer: item.prayer, date: item.date, eventType: 'after' },
        });
      }
    }
  }

  notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return notifications.slice(0, MAX_PRAYER_ALARMS);
}

/**
 * Unified pure builder for all prayer-related notification payloads (at + before + after).
 */
export function buildNativePrayerPayloads(opts: {
  location: PrayerLocation;
  prefs: NotificationPreference;
  days?: number;
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  now?: Date;
  adhanChannelId?: string;
  generalChannelId?: string;
  exactAlarm?: boolean;
  defaultAdhanId?: string;
}): NativeNotificationPayload[] {
  const isExact = opts.exactAlarm !== false;
  const fallbackAdhanId = opts.defaultAdhanId ?? getSelectedDefaultAdhanId();
  const defaultAdhan = resolvePrayerAdhan(undefined, fallbackAdhanId);
  const atAlarms = buildNativeAdhanAlarmInputs({ ...opts, defaultAdhanId: fallbackAdhanId });
  const beforeAfter = buildNativeBeforeAfterPayloads(opts);

  const atPayloads: NativeNotificationPayload[] = atAlarms.map((alarm) => {
    const [, prayer] = alarm.prayerKey.split(':') as [string, 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha'];
    const date = alarm.prayerKey.split(':')[0] ?? '';
    return {
      id: alarm.id,
      title: alarm.title,
      body: alarm.body,
      schedule: { at: new Date(alarm.triggerAtMs), allowWhileIdle: true },
      channelId: opts.adhanChannelId ?? channelIdForRawSound(alarm.rawSound || defaultAdhan.rawName),
      foreground: true,
      isExactNotification: isExact,
      extra: {
        rabbaniKind: 'prayer',
        prayer,
        date,
        eventType: 'at',
        rawSound: alarm.rawSound,
        soundTitle: alarm.soundTitle,
      },
    };
  });

  const combined = [...atPayloads, ...beforeAfter];
  combined.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return combined.slice(0, MAX_PRAYER_ALARMS);
}

/**
 * Pure builder for personal reminder notification payloads on Android.
 */
export function buildNativeReminderPayloads(
  reminders: readonly Reminder[],
  prefs: NotificationPreference,
  now = new Date(),
  generalChannelId = GENERAL_CHANNEL_ID,
  exactAlarm = true,
  ext?: FarQueueExtent,
): NativeNotificationPayload[] {
  if (!prefs.global_enabled || prefs.dnd_enabled) {
    return [];
  }

  const nowMs = now.getTime();
  const payloads: NativeNotificationPayload[] = [];

  for (const reminder of reminders) {
    // Mastery due-state is evaluated live; do not schedule a stale daily alert while closed.
    if(reminder.id==='quran-mastery-daily-review')continue;
    if (!reminder.enabled) continue;
    // Quiet hours are checked at each future occurrence, not at scheduling time.
    if (!isReminderAllowed(reminder, {...prefs,quiet_hours:{...prefs.quiet_hours,enabled:false}}, now)) continue;

    const snoozeAt = reminder.snooze_until ? new Date(reminder.snooze_until) : null;
    if (snoozeAt && !Number.isNaN(snoozeAt.getTime()) && snoozeAt.getTime() > nowMs + 1000 && !isQuietHoursActive(prefs, snoozeAt)) {
      payloads.push({
        id: prayerId('rem-snooze', `${reminder.id}:${snoozeAt.toISOString()}`),
        title: reminder.title,
        body: reminder.description || 'تذكير مؤجل',
        schedule: { at: snoozeAt, allowWhileIdle: true },
        channelId: generalChannelId,
        foreground: true,
        isExactNotification: exactAlarm,
        extra: { rabbaniKind: 'reminder', reminderId: reminder.id },
      });
    }

    const occurrences = upcomingOccurrences(reminder, now, ext ? FAR_QUEUE_OCCURRENCES : 5);
    for (const at of occurrences) {
      if (at.getTime() <= nowMs + 1000) continue;
      if (snoozeAt && at <= snoozeAt && snoozeAt.getTime()-at.getTime()<=60*60*1000) continue;
      if (isQuietHoursActive(prefs, at)) continue;
      payloads.push({
        id: prayerId('rem', `${reminder.id}:${at.toISOString()}`),
        title: reminder.title,
        body: reminder.description || 'تذكير مخصص',
        schedule: { at, allowWhileIdle: true },
        channelId: generalChannelId,
        foreground: true,
        isExactNotification: exactAlarm,
        extra: { rabbaniKind: 'reminder', reminderId: reminder.id },
      });
    }
  }

  payloads.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return payloads.slice(0, ext ? FAR_QUEUE_MAX_ITEMS : MAX_REMINDER_ALARMS);
}

/**
 * Pure builder for scheduled daily task push notification payloads on Android/iOS.
 */
export function buildNativeTaskPayloads(
  taskContext: TaskScheduleContext,
  prefs: NotificationPreference,
  now = new Date(),
  generalChannelId = GENERAL_CHANNEL_ID,
  exactAlarm = true,
  ext?: FarQueueExtent,
): NativeNotificationPayload[] {
  const settings = getTaskNotificationSettings(prefs);
  if (!prefs.global_enabled || prefs.dnd_enabled || prefs.categories?.task === false || !settings.enabled) {
    return [];
  }

  const nowMs = now.getTime();
  const events = dailyTaskEvents(taskContext, prefs, now, ext ? FAR_QUEUE_DAYS : 7);
  const payloads: NativeNotificationPayload[] = [];

  for (const event of events) {
    if (event.at.getTime() <= nowMs + 1000) continue;
    if (isQuietHoursActive(prefs, event.at)) continue;
    payloads.push({
      id: prayerId('task', event.key),
      title: event.title,
      body: event.body,
      schedule: { at: event.at, allowWhileIdle: true },
      channelId: generalChannelId,
      foreground: true,
      isExactNotification: exactAlarm,
      extra: {
        rabbaniKind: 'task',
        taskId: event.taskId,
        date: event.date,
        eventType: event.kind,
      },
    });
  }

  payloads.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return payloads.slice(0, ext ? FAR_QUEUE_MAX_ITEMS : MAX_TASK_ALARMS);
}

/**
 * Pure builder for Quran/Hadith memorization review notifications on the phone.
 * Mirrors the in-app engine: one notification per passage due date, at 9:00 local
 * (the first 9:00 at or after both now and the due date), within a 7-day horizon.
 */
export function buildNativeReviewPayloads(
  passages: readonly MemorizationPassage[],
  prefs: NotificationPreference,
  now = new Date(),
  generalChannelId = GENERAL_CHANNEL_ID,
  exactAlarm = true,
  ext?: FarQueueExtent,
): NativeNotificationPayload[] {
  if (!prefs.global_enabled || prefs.dnd_enabled) {
    return [];
  }
  if (prefs.categories?.['reminder'] === false) {
    return [];
  }

  const nowMs = now.getTime();
  const horizonMs = (ext ? FAR_QUEUE_DAYS : REVIEW_HORIZON_DAYS) * 24 * 60 * 60 * 1000;
  const payloads: NativeNotificationPayload[] = [];

  for (const passage of passages) {
    if (!passage || typeof passage.id !== 'string' || !passage.id) continue;
    if (typeof passage.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(passage.dueDate)) continue;
    const dueAt = new Date(`${passage.dueDate}T${String(REVIEW_HOUR).padStart(2, '0')}:00:00`);
    if (Number.isNaN(dueAt.getTime())) continue;
    let at = dueAt;
    if (at.getTime() <= nowMs + 1000) {
      at = new Date(now);
      at.setHours(REVIEW_HOUR, 0, 0, 0);
      if (at.getTime() <= nowMs + 1000) at.setDate(at.getDate() + 1);
    }
    if (at.getTime() - nowMs > horizonMs) continue;
    if (isQuietHoursActive(prefs, at)) continue;

    const surahName = passage.surah ? `سورة ${passage.surah}` : 'مقطع';
    const ayahRange = passage.ayahStart && passage.ayahEnd ? ` (آية ${passage.ayahStart}–${passage.ayahEnd})` : '';
    payloads.push({
      id: prayerId('review', `${passage.id}:${passage.dueDate}`),
      title: `مراجعة حفظ — ${surahName}${ayahRange}`,
      body: 'حان وقت مراجعة مقطعك المحفوظ. «وَذَكِّرْ فَإِنَّ الذِّكْرَىٰ تَنفَعُ الْمُؤْمِنِينَ»',
      schedule: { at, allowWhileIdle: true },
      channelId: generalChannelId,
      foreground: true,
      isExactNotification: exactAlarm,
      extra: { rabbaniKind: 'review', passageId: passage.id, dueDate: passage.dueDate },
    });
  }

  payloads.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  return payloads.slice(0, ext ? FAR_QUEUE_MAX_ITEMS : MAX_REVIEW_ALARMS);
}

export async function ensureChannels(): Promise<ActiveChannelInfo> {
  const defaultAdhan = resolvePrayerAdhan(undefined, getSelectedDefaultAdhanId());
  if (!isNative()) {
    cachedChannelInfo = {
      adhanChannelId: channelIdForRawSound(defaultAdhan.rawName),
      soundFile: defaultAdhan.fileName,
      soundTitle: defaultAdhan.name,
      soundMode: 'adhan',
    };
    return cachedChannelInfo;
  }

  const [env, nativeChannelId, LN] = await Promise.all([
    getAndroidEnvironmentStatus(),
    ensureNativeAdhanChannel(defaultAdhan.rawName, defaultAdhan.name),
    loadPlugin(),
  ]);

  if (LN) {
    try {
      const listed = await LN.listChannels();
      const existingChannels = (listed.channels ?? []) as Array<{ id: string }>;
      const hasGeneral = existingChannels.some((c) => c.id === GENERAL_CHANNEL_ID);
      if (!existingChannels.some((c) => c.id === SILENT_REMINDER_CHANNEL_ID)) {
        await LN.createChannel({
          id: SILENT_REMINDER_CHANNEL_ID,
          name: 'تذكيرات الصلاة بدون صوت',
          description: 'تذكيرات قبل وبعد الصلاة الصامتة بدون صوت أو اهتزاز',
          importance: 2,
          visibility: 1,
          vibration: false,
        });
      }
      if (!hasGeneral) {
        await LN.createChannel({
          id: GENERAL_CHANNEL_ID,
          name: 'تنبيهات عامة',
          description: 'تذكيرات وتنبيهات عامة',
          importance: 3,
          visibility: 1,
          vibration: true,
        });
      }
    } catch { /* ignore */ }
  }

  const hasAdhan = env?.hasAdhanRawSound ?? true;
  cachedChannelInfo = {
    adhanChannelId: nativeChannelId ?? channelIdForRawSound(defaultAdhan.rawName),
    soundFile: defaultAdhan.fileName,
    soundTitle: defaultAdhan.name,
    soundMode: hasAdhan ? 'adhan' : 'default',
  };
  return cachedChannelInfo;
}

export async function checkPermissions(): Promise<{ display: string; exact: string }> {
  if (!isNative()) return { display: 'unsupported', exact: 'unsupported' };
  const LN = await loadPlugin();
  if (!LN) return { display: 'unsupported', exact: 'unsupported' };
  let display = 'prompt';
  let exact = 'unsupported';
  try {
    const p = await LN.checkPermissions();
    display = p.display;
  } catch { /* ignore */ }
  try {
    const e = await LN.checkExactNotificationSetting();
    exact = e.exact_alarm;
  } catch { /* ignore */ }
  return { display, exact };
}

export async function requestPermissions(): Promise<{ display: string; exact: string }> {
  if (!isNative()) return { display: 'unsupported', exact: 'unsupported' };
  const LN = await loadPlugin();
  if (!LN) return { display: 'unsupported', exact: 'unsupported' };
  try {
    const p = await LN.requestPermissions();
    const display = (p as { display?: string }).display ?? 'prompt';
    let exact = 'unsupported';
    try {
      const e = await LN.checkExactNotificationSetting();
      exact = e.exact_alarm;
      if (display === 'granted' && exact !== 'granted') {
        try { await LN.changeExactNotificationSetting(); } catch { /* ignore */ }
        const e2 = await LN.checkExactNotificationSetting();
        exact = e2.exact_alarm;
      }
    } catch { /* ignore */ }
    return { display, exact };
  } catch {
    return { display: 'denied', exact: 'denied' };
  }
}

async function cancelScopedNotifications(
  LN: NonNullable<Awaited<ReturnType<typeof loadPlugin>>>,
  kind: 'prayer' | 'reminder' | 'task' | 'review',
  storageKey: string,
): Promise<number> {
  const tracked = new Set(loadTrackedIds(storageKey));
  try {
    const pending = await LN.getPending();
    for (const n of pending.notifications) {
      const extra = n.extra as { rabbaniKind?: string } | undefined;
      if (extra?.rabbaniKind === kind) {
        tracked.add(n.id);
      } else if (kind === 'prayer' && !extra?.rabbaniKind) {
        tracked.add(n.id);
      }
    }
  } catch { /* ignore */ }

  const ids = [...tracked];
  if (ids.length > 0) {
    try {
      await LN.cancel({ notifications: ids.map((id) => ({ id })) });
    } catch { /* ignore */ }
  }
  saveTrackedIds(storageKey, []);
  return ids.length;
}

export async function schedulePrayerNotifications(opts: NativeScheduleOptions): Promise<NativeScheduleResult> {
  return enqueueSync(async () => {
    if (!isNative()) {
      return {
        scheduled: 0,
        cancelled: 0,
        permission: 'unsupported',
        exactAlarm: 'unsupported',
        warning: 'المنبهات الأصلية غير متاحة (ويب).',
      };
    }
    const LN = await loadPlugin();
    if (!LN) {
      return {
        scheduled: 0,
        cancelled: 0,
        permission: 'unsupported',
        exactAlarm: 'unsupported',
        warning: 'إضافة الإشعارات المحلية غير متاحة.',
      };
    }

    const perms = await checkPermissions();
    const channelInfo = await ensureChannels();

    // Always clear both native AlarmManager Adhan alarms and Capacitor pending prayer notifications first.
    const [cancelledNative, cancelledReminders] = await Promise.all([
      cancelNativeAdhanAlarms(),
      cancelScopedNotifications(LN, 'prayer', PRAYER_IDS_STORAGE_KEY),
    ]);
    const cancelled = cancelledNative + cancelledReminders;

    if (perms.display !== 'granted') {
      await setNativeRecomputeSpec(null);
      await setNativeReminderQueue('prayer', []);
      return {
        scheduled: 0,
        cancelled,
        permission: perms.display as NativeScheduleResult['permission'],
        exactAlarm: perms.exact as NativeScheduleResult['exactAlarm'],
        channelId: channelInfo.adhanChannelId,
        soundMode: channelInfo.soundMode,
        warning: 'إذن الإشعارات غير ممنوح؛ لن تُعرض تنبيهات الأذان حتى تفعيل الإذن.',
      };
    }

    const exactGranted = perms.exact === 'granted' || perms.exact === 'unsupported';
    // Persist the recompute spec (or clear it when nothing should be scheduled) so native can top up the horizon.
    await setNativeRecomputeSpec(buildNativeRecomputeSpec({
      location: opts.location,
      prefs: opts.prefs,
      method: opts.method,
      madhab: opts.madhab,
    }));
    const adhanInputs = buildNativeAdhanAlarmInputs({
      location: opts.location,
      prefs: opts.prefs,
      days: opts.days,
      method: opts.method,
      madhab: opts.madhab,
      now: opts.now,
    });
    const allReminderPayloads = buildNativeBeforeAfterPayloads({
      location: opts.location,
      prefs: opts.prefs,
      days: opts.days,
      method: opts.method,
      madhab: opts.madhab,
      now: opts.now,
      generalChannelId: GENERAL_CHANNEL_ID,
      exactAlarm: exactGranted,
    });
    const legacySplit = splitSilentForLegacyAndroid(allReminderPayloads, (await getAndroidEnvironmentStatus())?.sdkInt);
    const reminderPayloads = legacySplit.registered;
    const legacyQueueItems = farQueueItems(legacySplit.queued, []);

    if (adhanInputs.length === 0 && reminderPayloads.length === 0 && legacyQueueItems.length === 0) {
      await setNativeReminderQueue('prayer', []);
      return {
        scheduled: 0,
        cancelled,
        permission: perms.display as NativeScheduleResult['permission'],
        exactAlarm: perms.exact as NativeScheduleResult['exactAlarm'],
        channelId: channelInfo.adhanChannelId,
        soundMode: channelInfo.soundMode,
      };
    }

    // Ensure every voice channel used across individual prayers exists on Android 8+.
    const uniqueVoices = new Map<string, string>();
    for (const input of adhanInputs) {
      if (!uniqueVoices.has(input.rawSound)) {
        uniqueVoices.set(input.rawSound, input.soundTitle);
      }
    }
    await Promise.all(
      [...uniqueVoices.entries()].map(([rawSound, soundTitle]) =>
        ensureNativeAdhanChannel(rawSound, soundTitle),
      ),
    );

    let scheduledCount = 0;
    let warning: string | undefined;

    try {
      if (adhanInputs.length > 0) {
        const nativeRes = await scheduleNativeAdhanAlarms(adhanInputs);
        scheduledCount += nativeRes?.scheduled ?? 0;
      }
      if (reminderPayloads.length > 0) {
        const res = await LN.schedule({ notifications: reminderPayloads as never });
        scheduledCount += res.notifications?.length ?? reminderPayloads.length;
        saveTrackedIds(PRAYER_IDS_STORAGE_KEY, reminderPayloads.map((p) => p.id));
        if (res.warning) {
          warning = res.warning.message;
        }
      }
      if (!warning && !exactGranted) {
        warning = 'منبهات الأذان الدقيقة غير مفعلة — تمت الجدولة كمنبه تقريبي وقد يتأخر الأذان قليلًا أو يكتفي بصوت الإشعار عندما يكون التطبيق مغلقًا.';
      }
    } catch (e) {
      warning = e instanceof Error ? e.message : 'فشل الجدولة';
    }

    await setNativeReminderQueue('prayer', legacyQueueItems);
    await rebalanceNativeReminderQueue();
    const latestPerms = await checkPermissions();
    const result: NativeScheduleResult = {
      scheduled: scheduledCount,
      cancelled,
      warning,
      permission: latestPerms.display as NativeScheduleResult['permission'],
      exactAlarm: latestPerms.exact as NativeScheduleResult['exactAlarm'],
      channelId: channelInfo.adhanChannelId,
      soundMode: channelInfo.soundMode,
    };

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NATIVE_SCHEDULE_UPDATED_EVENT, { detail: result }));
    }
    return result;
  });
}

export async function scheduleNativePersonalReminders(
  reminders: readonly Reminder[],
  prefs: NotificationPreference,
  now = new Date(),
): Promise<number> {
  return enqueueSync(async () => {
    if (!isNative()) return 0;
    const LN = await loadPlugin();
    if (!LN) return 0;

    const perms = await checkPermissions();
    await ensureChannels();
    await cancelScopedNotifications(LN, 'reminder', REMINDER_IDS_STORAGE_KEY);
    if (perms.display !== 'granted') { await setNativeReminderQueue('reminder', []); return 0; }

    const exactGranted = perms.exact === 'granted' || perms.exact === 'unsupported';
    const payloads = buildNativeReminderPayloads(nativeMasteryReminders(reminders,loadMasteryState(),now), prefs, now, GENERAL_CHANNEL_ID, exactGranted);
    const extended = buildNativeReminderPayloads(nativeMasteryReminders(reminders,loadMasteryState(),now), prefs, now, GENERAL_CHANNEL_ID, exactGranted, FAR_QUEUE);
    const farItems = farQueueItems(extended, payloads);
    if (payloads.length === 0) { await setNativeReminderQueue('reminder', farItems); return 0; }

    try {
      const res = await LN.schedule({ notifications: payloads as never });
      saveTrackedIds(REMINDER_IDS_STORAGE_KEY, payloads.map((p) => p.id));
      // Queue only after the registered ones exist, so the shared alarm budget sees them.
      await setNativeReminderQueue('reminder', farItems);
      return res.notifications?.length ?? payloads.length;
    } catch {
      // Registering failed (for example the OS alarm limit): hand everything to the native queue instead of losing it.
      await setNativeReminderQueue('reminder', farQueueItems(extended, []));
      return 0;
    }
  });
}

export async function scheduleNativeTaskNotifications(
  taskContext: TaskScheduleContext,
  prefs: NotificationPreference,
  now = new Date(),
): Promise<number> {
  return enqueueSync(async () => {
    if (!isNative()) return 0;
    const LN = await loadPlugin();
    if (!LN) return 0;

    const perms = await checkPermissions();
    await ensureChannels();
    await cancelScopedNotifications(LN, 'task', TASK_IDS_STORAGE_KEY);
    if (perms.display !== 'granted') { await setNativeReminderQueue('task', []); return 0; }

    const exactGranted = perms.exact === 'granted' || perms.exact === 'unsupported';
    const payloads = buildNativeTaskPayloads(taskContext, prefs, now, GENERAL_CHANNEL_ID, exactGranted);
    const extended = buildNativeTaskPayloads(taskContext, prefs, now, GENERAL_CHANNEL_ID, exactGranted, FAR_QUEUE);
    const farItems = farQueueItems(extended, payloads);
    if (payloads.length === 0) { await setNativeReminderQueue('task', farItems); return 0; }

    try {
      const res = await LN.schedule({ notifications: payloads as never });
      saveTrackedIds(TASK_IDS_STORAGE_KEY, payloads.map((p) => p.id));
      // Queue only after the registered ones exist, so the shared alarm budget sees them.
      await setNativeReminderQueue('task', farItems);
      return res.notifications?.length ?? payloads.length;
    } catch {
      // Registering failed (for example the OS alarm limit): hand everything to the native queue instead of losing it.
      await setNativeReminderQueue('task', farQueueItems(extended, []));
      return 0;
    }
  });
}

export async function scheduleNativeReviewNotifications(
  passages: readonly MemorizationPassage[],
  prefs: NotificationPreference,
  now = new Date(),
): Promise<number> {
  return enqueueSync(async () => {
    if (!isNative()) return 0;
    const LN = await loadPlugin();
    if (!LN) return 0;

    const perms = await checkPermissions();
    await ensureChannels();
    await cancelScopedNotifications(LN, 'review', REVIEW_IDS_STORAGE_KEY);
    if (perms.display !== 'granted') { await setNativeReminderQueue('review', []); return 0; }

    const exactGranted = perms.exact === 'granted' || perms.exact === 'unsupported';
    const payloads = buildNativeReviewPayloads(passages, prefs, now, GENERAL_CHANNEL_ID, exactGranted);
    const extended = buildNativeReviewPayloads(passages, prefs, now, GENERAL_CHANNEL_ID, exactGranted, FAR_QUEUE);
    const farItems = farQueueItems(extended, payloads);
    if (payloads.length === 0) { await setNativeReminderQueue('review', farItems); return 0; }

    try {
      const res = await LN.schedule({ notifications: payloads as never });
      saveTrackedIds(REVIEW_IDS_STORAGE_KEY, payloads.map((p) => p.id));
      // Queue only after the registered ones exist, so the shared alarm budget sees them.
      await setNativeReminderQueue('review', farItems);
      return res.notifications?.length ?? payloads.length;
    } catch {
      // Registering failed (for example the OS alarm limit): hand everything to the native queue instead of losing it.
      await setNativeReminderQueue('review', farQueueItems(extended, []));
      return 0;
    }
  });
}

export async function cancelAllPrayerNotifications(): Promise<void> {
  await enqueueSync(async () => {
    if (!isNative()) return;
    await cancelNativeAdhanAlarms();
    await setNativeRecomputeSpec(null);
    await setNativeReminderQueue('prayer', []);
    const LN = await loadPlugin();
    if (LN) {
      await cancelScopedNotifications(LN, 'prayer', PRAYER_IDS_STORAGE_KEY);
    }
  });
}

export async function syncAllNativeNotifications(opts: {
  location?: PrayerLocation;
  prefs: NotificationPreference;
  reminders?: readonly Reminder[];
  taskContext?: TaskScheduleContext;
  passages?: readonly MemorizationPassage[];
}): Promise<NativeScheduleResult | null> {
  if (!isNative()) return null;
  let prayerResult: NativeScheduleResult | null = null;
  if (opts.location) {
    prayerResult = await schedulePrayerNotifications({
      location: opts.location,
      prefs: opts.prefs,
      days: DEFAULT_SCHEDULE_DAYS,
    });
  } else {
    await cancelAllPrayerNotifications();
  }
  if (opts.reminders) {
    await scheduleNativePersonalReminders(opts.reminders, opts.prefs);
  }
  if (opts.taskContext) {
    await scheduleNativeTaskNotifications(opts.taskContext, opts.prefs);
  }
  if (opts.passages) {
    await scheduleNativeReviewNotifications(opts.passages, opts.prefs);
  }
  return prayerResult;
}

export function isNativePlatform(): boolean {
  return isNative();
  }
