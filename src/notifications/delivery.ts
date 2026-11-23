// خدمة توصيل الإشعارات
// منفصلة عن المنطق التجاري؛ تُستدعى من خدمة الجدولة عند الموعد المحدد.
// تدعم المتصفح (إشعارات المتصفح، داخل التطبيق) ومستقبلاً التطبيقات الأصلية عبر محولات المنصة.

import {authClient} from '../auth';
import {addLocalNotification} from './local-inbox';
import type {Reminder, NotificationChannel, NotificationCategory} from './types';
import {resolveAudioUrlForWeb} from '../audio/url-resolver';
import {isNativePlatform} from '../lib/device-location';

let permissionState: NotificationPermission | null = null;

// ---------- إذن إشعارات النظام المركزي ----------
// طلب واحد مشترك لإذن الإشعارات: على الجوال يمر عبر إشعارات النظام المحلية حتى
// تصل التنبيهات والمنبهات والتطبيق مغلق، وعلى الويب عبر إذن المتصفح. يُسأل
// المستخدم مرة واحدة كحد أقصى تلقائيًا؛ إعادة الطلب تحتاج زرًا صريحًا.

const SYSTEM_NOTIF_ASKED_KEY = 'rabbani-system-notif-asked-v1';

export function hasAskedSystemNotificationPermission(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(SYSTEM_NOTIF_ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSystemNotificationAsked(): void {
  try {
    window.localStorage.setItem(SYSTEM_NOTIF_ASKED_KEY, '1');
  } catch { /* ignore */ }
}

let systemPermissionInFlight: Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> | null = null;

/**
 * يضمن إذن إشعارات النظام من مكان واحد. عند ask=false يكتفي بقراءة الحالة دون
 * إظهار أي نافذة. عند السؤال تلقائيًا (ask غير محدد) لا يعيد سؤال من رفض سابقًا.
 */
export function ensureSystemNotificationPermission(options?: { ask?: boolean }): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (systemPermissionInFlight) return systemPermissionInFlight;
  const task = (async (): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> => {
    if (isNativePlatform()) {
      try {
        const scheduler = await import('./native-prayer-scheduler');
        const current = await scheduler.checkPermissions();
        if (current.display === 'granted' || current.display === 'denied' || current.display === 'unsupported') {
          return current.display as 'granted' | 'denied' | 'unsupported';
        }
        if (options?.ask === false) return 'prompt';
        if (hasAskedSystemNotificationPermission()) return 'prompt';
        markSystemNotificationAsked();
        const requested = await scheduler.requestPermissions();
        return requested.display === 'granted' || requested.display === 'denied' ? requested.display : 'prompt';
      } catch {
        return 'unsupported';
      }
    }
    if (!isBrowserNotificationSupported()) return 'unsupported';
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Notification.permission;
    }
    if (options?.ask === false || hasAskedSystemNotificationPermission()) return 'prompt';
    markSystemNotificationAsked();
    const result = await requestBrowserPermission();
    return result === 'granted' || result === 'denied' ? result : 'prompt';
  })();
  systemPermissionInFlight = task.finally(() => {
    systemPermissionInFlight = null;
  });
  return systemPermissionInFlight;
}

// ---------- توجيه التسليم: الهاتف أولًا ثم المتصفح ----------

export type SystemDeliveryRoute = 'native' | 'browser';

export interface SystemDeliveryContext {
  isNative: boolean;
  nativePermission: 'granted' | 'denied' | 'prompt' | 'unsupported';
  browserSupported: boolean;
  browserPermission: NotificationPermission | null;
}

/**
 * قرار خالص: على الجوال لا يصل شيء خارج التطبيق إلا عبر إشعارات النظام، لذلك
 * لا نتراجع إلى إشعارات المتصفح داخل WebView (إما لا تعمل أو لا تصل عند الإغلاق).
 */
export function chooseSystemDeliveryRoute(ctx: SystemDeliveryContext): SystemDeliveryRoute | null {
  if (ctx.isNative) {
    return ctx.nativePermission === 'granted' ? 'native' : null;
  }
  if (ctx.browserSupported && ctx.browserPermission === 'granted') return 'browser';
  return null;
}

export async function getSystemDeliveryContext(): Promise<SystemDeliveryContext> {
  const isNative = isNativePlatform();
  let nativePermission: SystemDeliveryContext['nativePermission'] = 'unsupported';
  if (isNative) {
    try {
      const mod = await import('@capacitor/local-notifications');
      const p = await mod.LocalNotifications.checkPermissions();
      const display = (p as { display?: string }).display;
      nativePermission = display === 'granted' || display === 'denied' ? display : 'prompt';
    } catch {
      nativePermission = 'unsupported';
    }
  }
  return {
    isNative,
    nativePermission,
    browserSupported: isBrowserNotificationSupported(),
    browserPermission: getBrowserPermission(),
  };
}

/** تسليم فوري عبر إشعارات نظام الهاتف (يظهر حتى على شاشة القفل). */
async function deliverNativeImmediate(title: string, body: string, tag: string): Promise<boolean> {
  try {
    const [scheduler, mod, { prayerId }] = await Promise.all([
      import('./native-prayer-scheduler'),
      import('@capacitor/local-notifications'),
      import('../lib/prayer-schedule'),
    ]);
    await scheduler.ensureChannels();
    const id = prayerId('instant', `${tag}:${Date.now()}`);
    await mod.LocalNotifications.schedule({
      notifications: [{
        id,
        title: title.slice(0, 200),
        body: body.slice(0, 2000),
        schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
        channelId: scheduler.GENERAL_CHANNEL_ID,
        foreground: true,
        extra: { rabbaniKind: 'instant', tag },
      }] as never,
    });
    return true;
  } catch {
    return false;
  }
}

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserPermission(): NotificationPermission | null {
  if (!isBrowserNotificationSupported()) return null;
  permissionState = Notification.permission;
  return permissionState;
}

export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotificationSupported()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    permissionState = Notification.permission;
    return permissionState;
  }
  permissionState = await Notification.requestPermission();
  return permissionState;
}

export function showBrowserNotification(
  title: string,
  opts: {body?: string; icon?: string; tag?: string; requireInteraction?: boolean; link?: string},
): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  const icon = opts.icon ?? '/icons/icon-192.png';
  const badge = '/icons/icon-192.png';

  const fallbackWindowNotification = () => {
    try {
      const notification = new Notification(title, {
        body: opts.body,
        icon,
        tag: opts.tag,
        requireInteraction: opts.requireInteraction ?? false,
        silent: false,
      });
      const TTL_MS = 30 * 60 * 1000;
      window.setTimeout(() => { try { notification.close(); } catch {} }, TTL_MS);
      notification.addEventListener?.('close', () => { /* timer will no-op if already closed */ });
    } catch {
      // Some mobile browsers disallow `new Notification(...)` directly when SW is required.
    }
  };

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistration()
      .then((reg) => {
        if (reg && typeof reg.showNotification === 'function') {
          return reg.showNotification(title, {
            body: opts.body,
            icon,
            badge,
            tag: opts.tag,
            requireInteraction: opts.requireInteraction ?? false,
            dir: 'rtl',
            lang: 'ar',
            data: opts.link ? {link: opts.link} : undefined,
          });
        }
        fallbackWindowNotification();
        return undefined;
      })
      .catch(() => {
        fallbackWindowNotification();
      });
    return;
  }

  fallbackWindowNotification();
}

/** يسجّل إشعارًا ذاتيًا في مركز الإشعارات (محليًا عند عدم وجود حساب سحابي، أو عبر RPC). */
export async function recordNotification(kind: string, title: string, body = '', link = ''): Promise<boolean> {
  if (!authClient) {
    addLocalNotification(kind, title, body, link);
    return true;
  }
  try {
    const {error} = await authClient.rpc('notify_self', {p_kind: kind, p_title: title.slice(0, 200), p_body: body.slice(0, 2000), p_link: link});
    return !error;
  } catch {
    addLocalNotification(kind, title, body, link);
    return true;
  }
}

/**
 * يرسل إشعارًا عبر القنوات المتاحة (داخل التطبيق + متصفح إن أمكن).
 * يُسجّل الحدث في جدول notification_events عبر RPC إن توفّر.
 */
export async function deliverReminder(reminder: Reminder, channel: NotificationChannel = 'both'): Promise<void> {
  const title = reminder.title;
  const body = reminder.description || 'تذكير مخصص';

  // 1. إشعار داخل التطبيق (يظهر في مركز الإشعارات)
  if (channel === 'in_app' || channel === 'both') await recordNotification('reminder', title, body, 'settings');

  // 2. إشعار نظامي خارج التطبيق: الهاتف أولًا (يصل والتطبيق مغلق)، ثم المتصفح على الويب
  if (channel === 'system' || channel === 'both') {
    const ctx = await getSystemDeliveryContext();
    const route = chooseSystemDeliveryRoute(ctx);
    if (route === 'native') {
      await deliverNativeImmediate(title, body, `reminder:${reminder.id}`);
    } else if (!ctx.isNative && ctx.browserSupported) {
      const perm = await requestBrowserPermission();
      if (perm === 'granted') {
        showBrowserNotification(title, {body, tag: `reminder:${reminder.id}`, requireInteraction: true});
      }
    }
  }
}

/**
 * يُظهر إشعارًا فوريًا (لأي وحدة) عبر القنوات المتاحة.
 */
export async function deliverNotification(kind: string, title: string, body?: string, link?: string): Promise<void> {
  await recordNotification(kind, title, body ?? '', link ?? '');
  const ctx = await getSystemDeliveryContext();
  const route = chooseSystemDeliveryRoute(ctx);
  if (route === 'native') {
    await deliverNativeImmediate(title, body ?? '', `notification:${kind}:${Date.now()}`);
  } else if (!ctx.isNative && ctx.browserSupported) {
    const perm = await requestBrowserPermission();
    if (perm === 'granted') {
      showBrowserNotification(title, {body: body ?? '', tag: `notification:${kind}:${Date.now()}`});
    }
  }
}

// ---------- إدارة الصوت ----------

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  if (typeof window === 'undefined' || !(window as any).AudioContext && !(window as any).webkitAudioContext) return null;
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  audioCtx = new Ctx();
  return audioCtx;
}

export function resumeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume();
  }
}

export function playSound(url: string): void {
  const safeUrl = resolveAudioUrlForWeb(url);
  if (!safeUrl) return;
  const ctx = getAudioContext();
  if (!ctx) {
    // fallback: عنصر صوت بسيط
    const audio = new Audio(safeUrl);
    void audio.play().catch(() => {});
    return;
  }
  resumeAudioContext();
  fetch(safeUrl)
    .then(r => r.arrayBuffer())
    .then(buf => ctx!.decodeAudioData(buf))
    .then(buffer => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    })
    .catch(() => {
      // fallback إذا فشل الفك
      const audio = new Audio(safeUrl);
      void audio.play().catch(() => {});
    });
}

export function stopAllSounds(): void {
  const ctx = getAudioContext();
  if (ctx) ctx.close();
  audioCtx = null;
}

// ---------- تقييم تفضيلات الصوت ----------

export function shouldDeliverNow(channel: NotificationCategory, prefs: Record<string, boolean> | undefined): boolean {
  if (!prefs) return true;
  return prefs[channel] !== false;
}

export function isInQuietHours(prefs: {quiet_hours?: {enabled: boolean; start: string; end: string}} | null, now = new Date()): boolean {
  if (!prefs?.quiet_hours?.enabled) return false;
  const start = prefs.quiet_hours.start;
  const end = prefs.quiet_hours.end;
  const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}
