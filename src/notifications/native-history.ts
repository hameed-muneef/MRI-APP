// يُدخل في سجل التنبيهات ما أظهره نظام الهاتف فعليًا (الأذان والتذكيرات والمهام) حتى والتطبيق مغلق،
// لأن سجل التطبيق كان يمتلئ فقط بما يصل أثناء فتحه.
import {isNativePlatform} from '../lib/device-location';
import {addNativeDeliveredNotification, LOCAL_NOTIFICATIONS_EVENT} from './local-inbox';

export async function syncDeliveredNativeNotifications(): Promise<number> {
  if (!isNativePlatform()) return 0;
  try {
    const mod = await import('@capacitor/local-notifications');
    const res = await mod.LocalNotifications.getDeliveredNotifications();
    let added = 0;
    for (const n of (res.notifications ?? []) as Array<{id: number; title?: string; body?: string}>) {
      if (!n.title) continue;
      if (addNativeDeliveredNotification(n.id, n.title, n.body ?? '')) added += 1;
    }
    if (added > 0 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LOCAL_NOTIFICATIONS_EVENT));
    return added;
  } catch {
    return 0;
  }
}
