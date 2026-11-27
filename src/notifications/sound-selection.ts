// اختيار الصوت المناسب لكل حدث (نطاق عمل خالص قابل للاختبار بلا تشغيل فعلي)

import type {AudioResource, NotificationPreference} from './types';
import type {PrayerEvent} from './prayer-planner';

let customAlarmUrl: string | undefined;
const customSoundUrls = new Map<string, string>();
export function setCustomAlarmUrl(url: string | undefined) { customAlarmUrl = url; }
export function getCustomAlarmUrl() { return customAlarmUrl; }
export function setCustomSoundUrl(id: string, url: string | undefined) {
  if (!id) return;
  if (url) customSoundUrls.set(id, url);
  else customSoundUrls.delete(id);
}
export function getCustomSoundUrl(id: string): string | undefined {
  return customSoundUrls.get(id);
}
export function clearCustomSoundUrls(): void {
  customSoundUrls.clear();
}

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
  'alafasy': '/sounds/adhan/adhan_alafasy.ogg',
  'adhan:alafasy': '/sounds/adhan/adhan_alafasy.ogg',
  'adhan_alafasy': '/sounds/adhan/adhan_alafasy.ogg',
  'qatami': '/sounds/adhan/adhan_qatami.ogg',
  'adhan:qatami': '/sounds/adhan/adhan_qatami.ogg',
  'adhan_qatami': '/sounds/adhan/adhan_qatami.ogg',
  'hamathani': '/sounds/adhan/adhan_hamathani.ogg',
  'adhan:hamathani': '/sounds/adhan/adhan_hamathani.ogg',
  'adhan_hamathani': '/sounds/adhan/adhan_hamathani.ogg',
  'hadrawi': '/sounds/adhan/adhan_hadrawi.ogg',
  'adhan:hadrawi': '/sounds/adhan/adhan_hadrawi.ogg',
  'adhan_hadrawi': '/sounds/adhan/adhan_hadrawi.ogg',
  'zubaidi': '/sounds/adhan/adhan_zubaidi.ogg',
  'adhan:zubaidi': '/sounds/adhan/adhan_zubaidi.ogg',
  'adhan_zubaidi': '/sounds/adhan/adhan_zubaidi.ogg',
  'aqsa': '/sounds/adhan/adhan_aqsa.ogg',
  'adhan:aqsa': '/sounds/adhan/adhan_aqsa.ogg',
  'adhan_aqsa': '/sounds/adhan/adhan_aqsa.ogg',
};

const BUNDLED_TAKBEER_URLS: Record<string, string> = {
  'eid': '/sounds/adhan/takbeerat_eid.ogg',
  'takbeer:eid': '/sounds/adhan/takbeerat_eid.ogg',
  'takbeerat_eid': '/sounds/adhan/takbeerat_eid.ogg',
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
  const localCustomUrl = customSoundUrls.get(id);
  if (localCustomUrl) {
    return {mode: 'file', id, url: localCustomUrl};
  }
  if (id in BUNDLED_ADHAN_URLS) {
    return {mode: 'file', id, url: BUNDLED_ADHAN_URLS[id]};
  }
  if (id in BUNDLED_TAKBEER_URLS) {
    return {mode: 'file', id, url: BUNDLED_TAKBEER_URLS[id]};
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
