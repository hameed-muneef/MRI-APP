import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface OpenSettingsResult {
  opened: boolean;
  error?: string;
  fallback?: string;
}

export interface AndroidEnvironmentStatus {
  sdkInt: number;
  canScheduleExactAlarms: boolean;
  ignoringBatteryOptimizations?: boolean;
  notificationsEnabled: boolean;
  hasAdhanRawSound: boolean;
  hasAllAdhanRawSounds?: boolean;
  isAdhanPlaying?: boolean;
  scheduledAdhanCount?: number;
}

export interface NativeRecomputeState {
  result: 'never_run' | 'no_spec' | 'ok' | 'unsupported' | 'invalid_spec' | 'failed' | string;
  lastRunMs: number;
  added: number;
  detail?: string;
}

export interface NativeAdhanAlarmInput {
  id: number;
  triggerAtMs: number;
  title: string;
  body: string;
  rawSound: string;
  soundTitle: string;
  adhanType: 'full' | 'short' | 'silent';
  prayerKey: string;
}

interface SettingsOpenerPlugin {
  openAppSettings(): Promise<OpenSettingsResult>;
  openBatterySettings(): Promise<OpenSettingsResult>;
  openExactAlarmSettings(): Promise<OpenSettingsResult>;
  getEnvironmentStatus(): Promise<AndroidEnvironmentStatus>;
  ensureNativeAdhanChannel(opts: { rawSound: string; soundTitle: string }): Promise<{ channelId: string }>;
  scheduleNativeAdhanAlarms(opts: { alarms: NativeAdhanAlarmInput[] }): Promise<{ scheduled: number; exact: boolean }>;
  cancelNativeAdhanAlarms(): Promise<{ cancelled: number }>;
  setNativeRecomputeSpec(opts: { spec: string }): Promise<void>;
  clearNativeRecomputeSpec(): Promise<void>;
  setNativeReminderQueue(opts: { kind: string; items: string }): Promise<{ armed: number }>;
  rebalanceNativeReminderQueue(): Promise<{ armed: number }>;
  setNativeReminderRules(opts: { rules: string }): Promise<void>;
  clearNativeReminderQueue(): Promise<void>;
  getNativeRecomputeState(): Promise<NativeRecomputeState>;
  runNativeRecomputeNow(): Promise<{ result: string }>;
  stopNativeAdhan(): Promise<{ stopped: boolean }>;
  addListener(eventName: 'appResumed', listenerFunc: () => void): Promise<PluginListenerHandle>;
}

const SettingsOpener = registerPlugin<SettingsOpenerPlugin>('SettingsOpener');

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return typeof cap?.isNativePlatform === 'function' && Boolean(cap.isNativePlatform());
}

export async function openAppSettings(): Promise<OpenSettingsResult> {
  if (!isNative()) return { opened: false, error: 'not-native' };
  try {
    return await SettingsOpener.openAppSettings();
  } catch (e) {
    return { opened: false, error: e instanceof Error ? e.message : 'plugin-error' };
  }
}

export async function openBatterySettings(): Promise<OpenSettingsResult> {
  if (!isNative()) return { opened: false, error: 'not-native' };
  try {
    return await SettingsOpener.openBatterySettings();
  } catch (e) {
    return { opened: false, error: e instanceof Error ? e.message : 'plugin-error' };
  }
}

export async function openExactAlarmSettings(): Promise<OpenSettingsResult> {
  if (!isNative()) return { opened: false, error: 'not-native' };
  try {
    return await SettingsOpener.openExactAlarmSettings();
  } catch (e) {
    return { opened: false, error: e instanceof Error ? e.message : 'plugin-error' };
  }
}

export async function getAndroidEnvironmentStatus(): Promise<AndroidEnvironmentStatus | null> {
  if (!isNative()) return null;
  try {
    return await SettingsOpener.getEnvironmentStatus();
  } catch {
    return null;
  }
}

export async function ensureNativeAdhanChannel(rawSound: string, soundTitle: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const res = await SettingsOpener.ensureNativeAdhanChannel({ rawSound, soundTitle });
    return res.channelId;
  } catch {
    return null;
  }
}

export async function scheduleNativeAdhanAlarms(alarms: NativeAdhanAlarmInput[]): Promise<{ scheduled: number; exact: boolean } | null> {
  if (!isNative()) return null;
  try {
    return await SettingsOpener.scheduleNativeAdhanAlarms({ alarms });
  } catch {
    return null;
  }
}

export async function cancelNativeAdhanAlarms(): Promise<number> {
  if (!isNative()) return 0;
  try {
    const res = await SettingsOpener.cancelNativeAdhanAlarms();
    return res.cancelled ?? 0;
  } catch {
    return 0;
  }
}

export async function setNativeRecomputeSpec(spec: object | null): Promise<boolean> {
  if (!isNative()) return false;
  try {
    if (spec) await SettingsOpener.setNativeRecomputeSpec({ spec: JSON.stringify(spec) });
    else await SettingsOpener.clearNativeRecomputeSpec();
    return true;
  } catch {
    return false;
  }
}

/** Stores reminders beyond the LocalNotifications window; native arms them as they come due (see NativeReminderQueue). */
export async function setNativeReminderQueue(
  kind: 'reminder' | 'task' | 'review' | 'prayer',
  items: ReadonlyArray<{ id: number; at: number; title: string; body: string; channelId: string }>,
): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await SettingsOpener.setNativeReminderQueue({ kind, items: JSON.stringify(items) });
    return true;
  } catch {
    return false;
  }
}

/** Daily and weekly custom reminders the device keeps expanding after the app's planning window (see NativeReminderRules). An empty list removes them. */
export async function setNativeReminderRules(rules: ReadonlyArray<object>): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await SettingsOpener.setNativeReminderRules({ rules: JSON.stringify(rules) });
    return true;
  } catch {
    return false;
  }
}

/** Re-applies the shared alarm budget after other alarms (prayer reminders) were registered. */
export async function rebalanceNativeReminderQueue(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await SettingsOpener.rebalanceNativeReminderQueue();
    return true;
  } catch {
    return false;
  }
}

export async function clearNativeReminderQueue(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    await SettingsOpener.clearNativeReminderQueue();
    return true;
  } catch {
    return false;
  }
}

export async function getNativeRecomputeState(): Promise<NativeRecomputeState | null> {
  if (!isNative()) return null;
  try {
    return await SettingsOpener.getNativeRecomputeState();
  } catch {
    return null;
  }
}

export async function stopNativeAdhan(): Promise<void> {
  if (!isNative()) return;
  try {
    await SettingsOpener.stopNativeAdhan();
  } catch { /* ignore */ }
}

export function addAppResumeListener(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  let active = true;
  let handle: PluginListenerHandle | null = null;
  const invoke = () => {
    if (active) cb();
  };
  const onVis = () => {
    if (document.visibilityState === 'visible') invoke();
  };
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('resume', invoke);
  if (isNative()) {
    void SettingsOpener.addListener('appResumed', invoke)
      .then((h) => {
        if (!active) void h.remove();
        else handle = h;
      })
      .catch(() => { /* ignore */ });
  }
  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('resume', invoke);
    if (handle) void handle.remove();
  };
}
