// أزرار «إيقاف» و«تأجيل» على التنبيهات الفورية (Capacitor LocalNotifications):
// تُعرَّف أنواع الأزرار مرة واحدة، وتُضاف إلى كل تنبيه فوري، ويُنفَّذ ما يختاره المستخدم.
import {localSnoozeMinutes} from './prefs-store';

export const ALERT_ACTION_TYPE_ID = 'RABBANI_ALERT';
export const ACTION_STOP = 'stop';
export const ACTION_SNOOZE = 'snooze';

export type AlertActionId = typeof ACTION_STOP | typeof ACTION_SNOOZE;

export interface AlertActionType {
  id: string;
  actions: Array<{id: string; title: string}>;
}

/** أزرار الإشعار بلغة الواجهة، ومدّة التأجيل فيها هي المدّة المحفوظة فعلًا. */
export function alertActionType(snoozeMinutes: number = localSnoozeMinutes()): AlertActionType {
  const minutes = Math.max(1, Math.min(120, Math.round(Number.isFinite(snoozeMinutes) ? snoozeMinutes : 10)));
  return {
    id: ALERT_ACTION_TYPE_ID,
    actions: [
      {id: ACTION_STOP, title: 'إيقاف'},
      {id: ACTION_SNOOZE, title: `تأجيل ${minutes} د`},
    ],
  };
}

export interface AlertActionPlan {
  /** يُلغى الإشعار الحالي (وهو ما يوقف صوته). */
  cancelId?: number;
  /** يُعاد جدولة التنبيه نفسه بعد هذا الوقت. */
  rescheduleAt?: number;
  /** يوقف الصوت داخل التطبيق أيضًا. */
  stopSound: boolean;
}

/**
 * يقرّر ما يفعله زرّ اختاره المستخدم. نقية كي تُختبر دون جهاز:
 * «إيقاف» يلغي الإشعار ويوقف الصوت، و«تأجيل» يلغي الحالي ويعيد جدولته بعد المدّة،
 * وأي زر آخر لا يفعل شيئًا.
 */
export function planAlertAction(
  actionId: string | undefined,
  notificationId: number | undefined,
  nowMs: number,
  snoozeMinutes: number = localSnoozeMinutes(),
): AlertActionPlan | null {
  if (!actionId) return null;
  const minutes = Math.max(1, Math.min(120, Math.round(Number.isFinite(snoozeMinutes) ? snoozeMinutes : 10)));
  if (actionId === ACTION_STOP) return {cancelId: notificationId, stopSound: true};
  if (actionId === ACTION_SNOOZE) {
    return {cancelId: notificationId, rescheduleAt: nowMs + minutes * 60_000, stopSound: true};
  }
  return null;
}

type NativeNotificationLike = {
  id?: number;
  title?: string;
  body?: string;
  channelId?: string;
  extra?: Record<string, unknown>;
};

let actionsRegistered = false;

/** يسجّل نوع الأزرار مرة واحدة لكل جلسة؛ يفشل بهدوء على الويب. */
export async function registerAlertActions(): Promise<boolean> {
  if (actionsRegistered) return true;
  try {
    const {LocalNotifications} = await import('@capacitor/local-notifications');
    await LocalNotifications.registerActionTypes({types: [alertActionType()] as never});
    actionsRegistered = true;
    return true;
  } catch {
    return false;
  }
}

async function applyAlertAction(plan: AlertActionPlan, notification: NativeNotificationLike | undefined): Promise<void> {
  try {
    const {LocalNotifications} = await import('@capacitor/local-notifications');
    if (plan.stopSound) {
      const {stopAudio} = await import('./audio');
      stopAudio();
    }
    if (plan.cancelId === undefined) return;
    await LocalNotifications.cancel({notifications: [{id: plan.cancelId}]});
    if (plan.rescheduleAt === undefined) return;
    await LocalNotifications.schedule({
      notifications: [{
        id: plan.cancelId,
        title: notification?.title ?? '',
        body: notification?.body ?? '',
        channelId: notification?.channelId,
        schedule: {at: new Date(plan.rescheduleAt), allowWhileIdle: true},
        foreground: true,
        actionTypeId: ALERT_ACTION_TYPE_ID,
        extra: notification?.extra ?? {},
      }] as never,
    });
  } catch {
    /* الأزرار لا يجب أن تُسقط التطبيق */
  }
}

/**
 * يستمع لاختيار المستخدم على أزرار الإشعار. يُركَّب مرة واحدة عند بدء التطبيق،
 * ويعيد دالة لفكّ الاستماع (للاختبارات ولإعادة التركيب).
 */
export function installAlertActionListener(onPlan?: (plan: AlertActionPlan) => void): () => void {
  let remove: (() => void) | null = null;
  let cancelled = false;
  void (async () => {
    try {
      const {LocalNotifications} = await import('@capacitor/local-notifications');
      const handle = await LocalNotifications.addListener('localNotificationActionPerformed', event => {
        const payload = event as unknown as {actionId?: string; notification?: NativeNotificationLike};
        const plan = planAlertAction(payload.actionId, payload.notification?.id, Date.now());
        if (!plan) return;
        onPlan?.(plan);
        void applyAlertAction(plan, payload.notification);
      });
      if (cancelled) void handle.remove();
      else remove = () => { void handle.remove(); };
    } catch {
      /* الويب بلا LocalNotifications */
    }
  })();
  return () => {
    cancelled = true;
    remove?.();
    remove = null;
  };
}
