import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addLocalNotification,
  clearAllLocalNotifications,
  expireLocalNotifications,
  listLocalNotifications,
  markAllLocalNotificationsRead,
  markLocalNotificationRead,
  unreadLocalNotificationCount,
} from './local-inbox';

function installMockWindow() {
  const store = new Map<string, string>();
  const events: string[] = [];
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
    clear() {
      store.clear();
    },
  };
  const mockWindow = {
    localStorage: mockLocalStorage,
    dispatchEvent(ev: Event) {
      events.push(ev.type);
      return true;
    },
  };
  vi.stubGlobal('window', mockWindow);
  return { store, events };
}

describe('local-inbox', () => {
  beforeEach(() => {
    installMockWindow();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds, reads, marks all read, and clears notifications in localStorage', () => {
    const a = addLocalNotification('prayer', 'أذان الفجر', 'حان الآن وقت صلاة الفجر', 'day');
    const b = addLocalNotification('system', 'تذكير', 'تم حفظ بياناتك محليًا', 'settings');

    expect(unreadLocalNotificationCount()).toBe(2);
    expect(listLocalNotifications()).toHaveLength(2);

    markLocalNotificationRead(a.notification_id);
    expect(unreadLocalNotificationCount()).toBe(1);

    markAllLocalNotificationsRead();
    expect(unreadLocalNotificationCount()).toBe(0);
    expect(listLocalNotifications().find(r => r.notification_id === b.notification_id)?.read_at).not.toBeNull();

    clearAllLocalNotifications();
    expect(listLocalNotifications()).toHaveLength(0);
    expect(unreadLocalNotificationCount()).toBe(0);
  });

  it('auto-expires unread notifications older than 30 minutes', () => {
    const row = addLocalNotification('task', 'مهمة يومية', 'قراءة ورد القرآن');
    const futureMs = Date.parse(row.created_at) + 31 * 60 * 1000;
    const rows = expireLocalNotifications(futureMs);
    expect(rows[0]?.read_at).not.toBeNull();
  });
});
