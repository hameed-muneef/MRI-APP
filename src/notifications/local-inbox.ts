// مخزن محلي للإشعارات داخل التطبيق (localStorage) — يعمل بالكامل دون اتصال أو خادم.
export type LocalNotificationRow = {
  notification_id: string;
  notification_kind: string;
  notification_title: string;
  notification_body: string;
  notification_link: string;
  notification_category: 'reminder' | 'system';
  read_at: string | null;
  created_at: string;
};

export const LOCAL_NOTIFICATIONS_KEY = 'rabbani-local-notifications-v1';
export const LOCAL_NOTIFICATIONS_EVENT = 'rabbani:local-notifications-updated';
const MAX_LOCAL_NOTIFICATIONS = 100;
const TTL_MS = 30 * 60 * 1000;

function categoryOf(kind: string): 'reminder' | 'system' {
  if (['prayer', 'reminder', 'worship', 'goal', 'task'].includes(kind)) return 'reminder';
  return 'system';
}

function dispatchUpdate(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCAL_NOTIFICATIONS_EVENT));
  }
}

function readRaw(): LocalNotificationRow[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(LOCAL_NOTIFICATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocalNotificationRow => (
      Boolean(item)
      && typeof item.notification_id === 'string'
      && typeof item.notification_title === 'string'
      && typeof item.created_at === 'string'
    ));
  } catch {
    return [];
  }
}

function writeRaw(rows: LocalNotificationRow[]): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LOCAL_NOTIFICATIONS_KEY, JSON.stringify(rows.slice(0, MAX_LOCAL_NOTIFICATIONS)));
  } catch { /* ignore quota errors */ }
}

export function expireLocalNotifications(nowMs = Date.now()): LocalNotificationRow[] {
  const rows = readRaw();
  let changed = false;
  const next = rows.map(row => {
    if (!row.read_at && (nowMs - Date.parse(row.created_at) > TTL_MS)) {
      changed = true;
      return {...row, read_at: new Date(nowMs).toISOString()};
    }
    return row;
  });
  if (changed) writeRaw(next);
  return next;
}

export function listLocalNotifications(): LocalNotificationRow[] {
  return expireLocalNotifications();
}

export function unreadLocalNotificationCount(): number {
  return expireLocalNotifications().filter(row => !row.read_at).length;
}

export function addLocalNotification(
  kind: string,
  title: string,
  body = '',
  link = '',
): LocalNotificationRow {
  const now = new Date().toISOString();
  const row: LocalNotificationRow = {
    notification_id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    notification_kind: kind,
    notification_title: title.slice(0, 200),
    notification_body: body.slice(0, 2000),
    notification_link: link,
    notification_category: categoryOf(kind),
    read_at: null,
    created_at: now,
  };
  const current = expireLocalNotifications();
  writeRaw([row, ...current]);
  dispatchUpdate();
  return row;
}

export function markLocalNotificationRead(id: string): void {
  const now = new Date().toISOString();
  const rows = readRaw();
  let changed = false;
  const next = rows.map(row => {
    if (row.notification_id === id && !row.read_at) {
      changed = true;
      return {...row, read_at: now};
    }
    return row;
  });
  if (changed) {
    writeRaw(next);
    dispatchUpdate();
  }
}

export function markAllLocalNotificationsRead(): void {
  const now = new Date().toISOString();
  const rows = readRaw();
  let changed = false;
  const next = rows.map(row => {
    if (!row.read_at) {
      changed = true;
      return {...row, read_at: now};
    }
    return row;
  });
  if (changed) {
    writeRaw(next);
    dispatchUpdate();
  }
}

export function clearAllLocalNotifications(): void {
  writeRaw([]);
  dispatchUpdate();
}

/** يضيف إشعارًا وصل من نظام الهاتف إلى السجل مرة واحدة فقط (المفتاح ثابت لكل إشعار). */
export function addNativeDeliveredNotification(nativeId: number | string, title: string, body: string, postedAtMs?: number): boolean {
  const id = `native-${nativeId}-${title}`.slice(0, 160);
  const rows = readRaw();
  if (rows.some(row => row.notification_id === id)) return false;
  const created = new Date(postedAtMs && Number.isFinite(postedAtMs) ? postedAtMs : Date.now()).toISOString();
  const row: LocalNotificationRow = {
    notification_id: id,
    notification_kind: 'reminder',
    notification_title: title.slice(0, 200),
    notification_body: body.slice(0, 2000),
    notification_link: '',
    notification_category: 'reminder',
    // وصلت للمستخدم على الهاتف بالفعل، فتدخل السجل مقروءة ولا تُظهر عدّادًا.
    read_at: created,
    created_at: created,
  };
  writeRaw([row, ...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)));
  return true;
}
