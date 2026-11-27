package com.alrabbaniyoon.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;

/**
 * Actions on reminder/task/alarm notifications: Stop and Snooze.
 *
 * Stop  - dismisses the notification (which also silences the channel sound) and drops any
 *         snooze this notification still has pending.
 * Snooze - dismisses it and re-arms the same notification ten minutes later through the same
 *         QueuedReminderReceiver path the queue already uses, so a snoozed alert survives the
 *         app being closed.
 *
 * Pattern follows AdhanPlaybackService (ACTION_STOP + PendingIntent.getService): one explicit
 * action per button, immutable PendingIntents, and a request code derived from the notification
 * id so two reminders never share an action slot.
 */
public class ReminderActionReceiver extends BroadcastReceiver {

    public static final String ACTION_STOP = "com.alrabbaniyoon.app.action.STOP_REMINDER";
    public static final String ACTION_SNOOZE = "com.alrabbaniyoon.app.action.SNOOZE_REMINDER";

    public static final String EXTRA_ID = "id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_CHANNEL_ID = "channelId";
    public static final String EXTRA_SNOOZE_MINUTES = "snoozeMinutes";
    public static final String EXTRA_SOUND_KEY = "soundKey";
    public static final String EXTRA_RAW_SOUND = "rawSound";

    /** Matches the app's own "تأجيل ١٠ د" button on a personal reminder. */
    public static final int DEFAULT_SNOOZE_MINUTES = 10;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        int id = intent.getIntExtra(EXTRA_ID, 0);
        try {
            NotificationManagerCompat.from(context).cancel(id);
        } catch (Throwable ignored) {
            // Cancelling must never crash the receiver.
        }
        NativeReminderQueue.forgetRinging(context, id);
        NativeReminderQueue.cancelSnoozed(context, id);
        // وضع المنبه يشغّل الصوت بنفسه: إلغاء الإشعار لا يكفي، فتُوقف الخدمة أيضًا.
        ReminderAlarmService.stop(context);
        if (!ACTION_SNOOZE.equals(action)) return;
        String title = intent.getStringExtra(EXTRA_TITLE);
        if (title == null || title.isEmpty()) return;
        int minutes = intent.getIntExtra(EXTRA_SNOOZE_MINUTES, DEFAULT_SNOOZE_MINUTES);
        String channelId = intent.getStringExtra(EXTRA_CHANNEL_ID);
        // تأجيل منبّه يبقى منبّهًا: الوضع يُستنتج من قناة الإشعار الذي ضُغط زرّه.
        boolean alarmMode = ReminderAlarmPolicy.CHANNEL_ID.equals(channelId);
        NativeReminderQueue.armSnoozed(
            context,
            id,
            title,
            intent.getStringExtra(EXTRA_BODY),
            channelId,
            minutes,
            alarmMode
        );
    }

    /**
     * The PendingIntent behind one notification button. Request codes are derived from the
     * notification id (modulo keeps them positive and unique per button) so Stop and Snooze of
     * the same notification never collide, and two reminders never share a slot.
     */
    static PendingIntent actionIntent(
        Context context,
        String action,
        int notificationId,
        String title,
        String body,
        String channelId,
        int snoozeMinutes
    ) {
        return actionIntent(context, action, notificationId, title, body, channelId, snoozeMinutes, null, null);
    }

    /** نفس الزرّ، مع صوت الصفّ المخصص حتى يبقى التأجيل بصوت المستخدم. */
    static PendingIntent actionIntent(
        Context context,
        String action,
        int notificationId,
        String title,
        String body,
        String channelId,
        int snoozeMinutes,
        String soundKey,
        String rawSound
    ) {
        Intent intent = new Intent(context, ReminderActionReceiver.class);
        intent.setAction(action);
        intent.putExtra(EXTRA_ID, notificationId);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_BODY, body == null ? "" : body);
        intent.putExtra(EXTRA_CHANNEL_ID, channelId == null ? "" : channelId);
        intent.putExtra(EXTRA_SNOOZE_MINUTES, snoozeMinutes);
        intent.putExtra(EXTRA_SOUND_KEY, soundKey == null ? "" : soundKey);
        intent.putExtra(EXTRA_RAW_SOUND, rawSound == null ? "" : rawSound);
        int slot = Math.abs(notificationId % 1_000_000);
        int requestCode = slot * 10 + (ACTION_SNOOZE.equals(action) ? 2 : 1);
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
