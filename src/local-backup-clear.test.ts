import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLocalData } from './local-backup';

// «حذف البيانات المحلية» في الإعدادات يجب أن يمسح كل ما تشمله النسخة الاحتياطية،
// لا حالة التطبيق وحدها: المنبهات وتفضيلات الإشعارات والمظهر وسجل الإشعارات والتقدم.

function installMockWindow(seed: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed));
  const mockLocalStorage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: mockLocalStorage };
  return store;
}

describe('clearLocalData', () => {
  beforeEach(() => {
    installMockWindow({});
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('removes every rabbani- key the backup covers', () => {
    const store = installMockWindow({
      'rabbani-v1': '{"tasks":[]}',
      'rabbani-notif-reminders-v1': '[]',
      'rabbani-notif-prefs-v1': '{}',
      'rabbani-theme-v1': 'dark',
      'rabbani-local-notifications-v1': '[]',
      'rabbani-mastery-v1': '{}',
    });

    const removed = clearLocalData();

    expect(store.size).toBe(0);
    expect(removed.sort()).toEqual([
      'rabbani-local-notifications-v1',
      'rabbani-mastery-v1',
      'rabbani-notif-prefs-v1',
      'rabbani-notif-reminders-v1',
      'rabbani-theme-v1',
      'rabbani-v1',
    ]);
  });

  it('keeps the offline Quran content cache and unrelated keys', () => {
    const store = installMockWindow({
      'rabbani-v1': '{}',
      'quran-content-cache-v1:ar': '{"surah":1}',
      'someone-else': 'x',
    });

    clearLocalData();

    expect(store.has('rabbani-v1')).toBe(false);
    expect(store.get('quran-content-cache-v1:ar')).toBe('{"surah":1}');
    expect(store.get('someone-else')).toBe('x');
  });

  it('does nothing when there is no window storage', () => {
    delete (globalThis as unknown as { window?: unknown }).window;
    expect(clearLocalData()).toEqual([]);
  });
});
