package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

import java.util.ArrayList;
import java.util.List;

/** وضع المنبه داخل محاكاة أندرويد (Robolectric)، لا على جهاز حقيقي. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class ReminderAlarmModeTest {
    private Context ctx;

    @Before public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        NativeReminderQueue.clearAll(ctx);
    }

    private NotificationManager nm() {
        return (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private int activeNotifications() {
        return shadowOf(nm()).getActiveNotifications().length;
    }

    private List<ShadowAlarmManager.ScheduledAlarm> queueAlarms() {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        List<ShadowAlarmManager.ScheduledAlarm> out = new ArrayList<>();
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms()) {
            if (a.operation != null && NativeReminderQueue.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) out.add(a);
        }
        return out;
    }

    @Test public void theAlarmChannelIsMaxImportanceAndStaysSilentBecauseTheServicePlays() {
        NativeReminderQueue.ensureChannel(ctx, ReminderAlarmPolicy.CHANNEL_ID);
        NotificationChannel ch = nm().getNotificationChannel(ReminderAlarmPolicy.CHANNEL_ID);
        assertNotNull(ch);
        assertEquals(NotificationManager.IMPORTANCE_MAX, ch.getImportance());
        assertEquals(null, ch.getSound());
        assertTrue(ch.shouldVibrate());
    }

    @Test public void aMarkedRowStartsTheAlarmServiceInsteadOfPostingASoundOnceNotification() {
        NativeReminderQueue.onFire(ctx, 501, "عنوان", "نص", "al-rabbani-general-v2", true);
        Intent started = shadowOf((Application) ctx).getNextStartedService();
        assertNotNull(started);
        assertEquals(ReminderAlarmService.class.getName(), started.getComponent().getClassName());
        assertEquals(ReminderAlarmService.ACTION_START, started.getAction());
        assertEquals(501, started.getIntExtra(ReminderActionReceiver.EXTRA_ID, 0));
        assertEquals("عنوان", started.getStringExtra(ReminderActionReceiver.EXTRA_TITLE));
        // الإشعار تنشئه الخدمة نفسها، فلا يُنشر إشعار مزدوج من الطابور
        assertEquals(0, activeNotifications());
    }

    @Test public void anUnmarkedRowKeepsTheOldSingleSoundBehaviour() {
        NativeReminderQueue.onFire(ctx, 502, "عنوان", "نص", "al-rabbani-general-v2", false);
        assertEquals(1, activeNotifications());
        assertEquals(null, shadowOf((Application) ctx).getNextStartedService());
    }

    @Test public void parseAndStorageKeepTheFlagAndDefaultItToOff() {
        List<NativeReminderQueue.Item> rows = NativeReminderQueue.parse(
            "[{\"id\":1,\"at\":" + (System.currentTimeMillis() + 60000) + ",\"title\":\"a\",\"alarmMode\":true},"
                + "{\"id\":2,\"at\":" + (System.currentTimeMillis() + 60000) + ",\"title\":\"b\"}]");
        assertEquals(2, rows.size());
        assertTrue(rows.get(0).alarmMode);
        assertFalse(rows.get(1).alarmMode);

        long soon = System.currentTimeMillis() + 5 * 60_000L;
        NativeReminderQueue.setQueue(ctx, "reminder",
            "[{\"id\":7,\"at\":" + soon + ",\"title\":\"منبه\",\"body\":\"\",\"channelId\":\"al-rabbani-general-v2\",\"alarmMode\":true}]");
        List<ShadowAlarmManager.ScheduledAlarm> armed = queueAlarms();
        assertEquals(1, armed.size());
        Intent saved = shadowOf(armed.get(0).operation).getSavedIntent();
        assertTrue(saved.getBooleanExtra("alarmMode", false));
    }

    @Test public void snoozingAnAlarmReArmsItAsAnAlarm() {
        long before = System.currentTimeMillis();
        Intent tap = new Intent(ctx, ReminderActionReceiver.class)
            .setAction(ReminderActionReceiver.ACTION_SNOOZE)
            .putExtra(ReminderActionReceiver.EXTRA_ID, 611)
            .putExtra(ReminderActionReceiver.EXTRA_TITLE, "عنوان")
            .putExtra(ReminderActionReceiver.EXTRA_BODY, "نص")
            .putExtra(ReminderActionReceiver.EXTRA_CHANNEL_ID, ReminderAlarmPolicy.CHANNEL_ID)
            .putExtra(ReminderActionReceiver.EXTRA_SNOOZE_MINUTES, 10);
        new ReminderActionReceiver().onReceive(ctx, tap);

        List<ShadowAlarmManager.ScheduledAlarm> armed = queueAlarms();
        assertEquals(1, armed.size());
        Intent saved = shadowOf(armed.get(0).operation).getSavedIntent();
        assertTrue(saved.getBooleanExtra("alarmMode", false));
        assertTrue(armed.get(0).triggerAtTime >= before + 9 * 60_000L);
    }

    @Test public void stoppingAnAlarmNotificationAlsoStopsTheServiceAndAnySnooze() {
        Intent tap = new Intent(ctx, ReminderActionReceiver.class)
            .setAction(ReminderActionReceiver.ACTION_STOP)
            .putExtra(ReminderActionReceiver.EXTRA_ID, 612)
            .putExtra(ReminderActionReceiver.EXTRA_TITLE, "عنوان")
            .putExtra(ReminderActionReceiver.EXTRA_CHANNEL_ID, ReminderAlarmPolicy.CHANNEL_ID);
        new ReminderActionReceiver().onReceive(ctx, tap);
        assertEquals(0, queueAlarms().size());
        assertFalse(ReminderAlarmService.isRinging());
    }
}
