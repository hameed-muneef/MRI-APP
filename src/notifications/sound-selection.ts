// اختيار الصوت المناسب لكل حدث (نطاق عمل خالص قابل للاختبار بلا تشغيل فعلي)

import type {AudioResource, NotificationPreference} from './types';
import type {PrayerEvent} from './prayer-planner';

let customAlarmUrl: string | undefined;
export function setCustomAlarmUrl(url: string | undefined) { customAlarmUrl = url; }
export function getCustomAlarmUrl() { return customAlarmUrl; }

export const SILENT_SOUND = 'builtin:silent';
const DEFAULT_AT_SOUND = 'builtin:chime';
const DEFAULT_REMINDER_SOUND = 'builtin:soft';

// Self-contained map of bundled offline Adhan OGG recordings (excludes Eid Takbeerat).
const BUNDLED_ADHAN_URLS: Record<string, string> = {
  'almulla': '/sounds/adhan/adhan_almulla.ogg',
  'adhan:almulla': '/sounds/adhan/adhan_almulla.ogg',
  'adhan_almulla': '/sounds/adhan/adhan_almulla.ogg',
  'ahmad': '/sounds/adhan/adhan_ahmad.ogg',
  'adhan:ahmad': '/sounds/adhan/adhan_ahmad.ogg',
  'adhan_ahmad': '/sounds/adhan/adhan_ahmad.ogg',
  'madinah': '/sounds/adhan/adhan_madinah.ogg',
  'adhan:madinah': '/sounds/adhan/adhan_madinah.ogg',
  'adhan_madinah': '/sounds/adhan/adhan_madinah.ogg',
  'madinah2': '/sounds/adhan/adhan_madinah2.ogg',
  'adhan:madinah2': '/sounds/adhan/adhan_madinah2.ogg',
  'adhan_madinah2': '/sounds/adhan/adhan_madinah2.ogg',
  'mohammed': '/sounds/adhan/adhan_mohammed.ogg',
  'adhan:mohammed': '/sounds/adhan/adhan_mohammed.ogg',
  'adhan_mohammed': '/sounds/adhan/adhan_mohammed.ogg',
  'hamad': '/sounds/adhan/adhan_hamad.ogg',
  'adhan:hamad': '/sounds/adhan/adhan_hamad.ogg',
  'adhan_hamad': '/sounds/adhan/adhan_hamad.ogg',
};

export type SoundPlan =
  | {mode: 'none'}
  | {mode: 'tone'; id: string}
  | {mode: 'file'; id: string; url: string};

/** يحوّل معرّف الصوت المختار إلى خطة تشغيل؛ المعرّف المجهول أو المفقود يعود إلى نغمة افتراضية بدل الصمت */
export function planSound(soundId: string | undefined, library: readonly Pick<AudioResource, 'id' | 'url'>[], fallbackTone: string): SoundPlan {
  const id = soundId || fallbackTone;
  if (id === SILENT_SOUND) return {mode: 'none'};
  if (id === 'custom:alarm') {
    const url = getCustomAlarmUrl();
    if (url) return {mode: 'file', id, url};
    return {mode: 'tone', id: fallbackTone};
  }
  if (id in BUNDLED_ADHAN_URLS) {
    return {mode: 'file', id, url: BUNDLED_ADHAN_URLS[id]};
  }
  if (id.startsWith('builtin:')) return {mode: 'tone', id};
  const found = library.find(item => item.id === id);
  if (found?.url && (/^https:\/\//i.test(found.url) || found.url.startsWith('/sounds/'))) {
    return {mode: 'file', id, url: found.url};
  }
  return {mode: 'tone', id: fallbackTone};
}

export function soundPlanForPrayer(event: PrayerEvent, prefs: NotificationPreference, library: readonly Pick<AudioResource, 'id' | 'url'>[]): SoundPlan {
  const settings = prefs.prayer_settings?.[event.prayer];
  if (!settings || settings.adhan_type === 'silent') return {mode: 'none'};
  return planSound(settings.sound_id, library, event.kind === 'at' ? DEFAULT_AT_SOUND : DEFAULT_REMINDER_SOUND);
}

export function soundPlanForReminder(soundId: string | undefined, prefs: NotificationPreference, library: readonly Pick<AudioResource, 'id' | 'url'>[]): SoundPlan {
  return planSound(soundId || prefs.reminder_settings?.default_sound_id, library, DEFAULT_REMINDER_SOUND);
}

export function soundPlanForTask(soundId: string | undefined, prefs: NotificationPreference, library: readonly Pick<AudioResource, 'id' | 'url'>[]): SoundPlan {
  return planSound(
    soundId || prefs.reminder_settings?.task_notifications?.sound_id || prefs.reminder_settings?.default_sound_id,
    library,
    DEFAULT_REMINDER_SOUND,
  );
}
