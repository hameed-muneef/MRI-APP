import {loadFromRaw, type State} from './app-state';
import {installAppearance} from './appearance';
import {notifyNativePrefsChanged} from './notifications/native-prayer-scheduler';
import {LOCAL_NOTIFICATIONS_EVENT} from './notifications/local-inbox';

const BACKUP_FORMAT_VERSION = 1;
const BACKUP_APP_ID = 'al-rabbaniyyun-local';
const KEY_PREFIXES = ['rabbani-', 'quran-content-cache-v1:'];

export type LocalBackupPayload = {
  version: number;
  app: string;
  exportedAt: string;
  storage: Record<string, string>;
};

export type LocalStorageSummary = {
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
  localKeysCount: number;
};

export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return null;
    if (typeof navigator.storage.persisted === 'function') {
      const already = await navigator.storage.persisted();
      if (already) return true;
    }
    if (typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
    return null;
  } catch {
    return null;
  }
}

export async function getLocalStorageSummary(): Promise<LocalStorageSummary> {
  let localKeysCount = 0;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
          localKeysCount += 1;
        }
      }
    }
  } catch { /* ignore */ }

  let persisted: boolean | null = null;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;

  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (typeof navigator.storage.persisted === 'function') {
        persisted = await navigator.storage.persisted();
      }
      if (typeof navigator.storage.estimate === 'function') {
        const estimate = await navigator.storage.estimate();
        usageBytes = typeof estimate.usage === 'number' ? estimate.usage : null;
        quotaBytes = typeof estimate.quota === 'number' ? estimate.quota : null;
      }
    }
  } catch { /* ignore */ }

  return {persisted, usageBytes, quotaBytes, localKeysCount};
}

export function exportLocalBackup(): LocalBackupPayload {
  const storage: Record<string, string> = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !KEY_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
      const value = window.localStorage.getItem(key);
      if (typeof value === 'string') storage[key] = value;
    }
  }
  return {
    version: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    storage,
  };
}

export function importLocalBackup(rawJson: string, activeStateKey = 'rabbani-v1'): State | null {
  const parsed = JSON.parse(rawJson) as Partial<LocalBackupPayload> | null;
  if (!parsed || typeof parsed !== 'object' || parsed.app !== BACKUP_APP_ID || typeof parsed.storage !== 'object' || !parsed.storage) {
    throw new Error('ملف النسخة الاحتياطية غير صالح أو لا يخص تطبيق الربانيون.');
  }

  const entries = Object.entries(parsed.storage).filter(
    ([key, val]) => typeof val === 'string' && KEY_PREFIXES.some(prefix => key.startsWith(prefix)),
  );
  if (entries.length === 0) {
    throw new Error('لم يُعثر على بيانات قابلة للاستيراد داخل الملف.');
  }

  for (const [key, value] of entries) {
    window.localStorage.setItem(key, value);
  }

  installAppearance();
  notifyNativePrefsChanged();
  window.dispatchEvent(new CustomEvent(LOCAL_NOTIFICATIONS_EVENT));

  const mainRaw = parsed.storage[activeStateKey] ?? parsed.storage['rabbani-v1'] ?? null;
  return mainRaw ? loadFromRaw(mainRaw) : null;
}

export function formatStorageBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'غير متاح';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}
