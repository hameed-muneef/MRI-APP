package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.Notification;
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

/** Simulated Android runtime (Robolectric), not a physical device. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class NativeReminderQueueTest {
    private static final long DAY = 24L * 3600 * 1000;
    private Context ctx;

    private static String items(long... atAndId) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < atAndId.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append("{\"id\":").append(atAndId[i + 1]).append(",\"at\":").append(atAndId[i])
              .append(",\"title\":\"t").append(atAndId[i + 1]).append("\",\"body\":\"b\",\"channelId\":\"al-rabbani-general\"}");
        }
        return sb.append(']').toString();
    }

    @Before public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        NativeReminderQueue.clearAll(ctx);
    }

    private List<ShadowAlarmManager.ScheduledAlarm> queued() {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        List<ShadowAlarmManager.ScheduledAlarm> out = new ArrayList<>();
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms()) {
            if (a.operation != null && NativeReminderQueue.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) out.add(a);
        }
        return out;
    }

    @Test public void parseDropsMalformedRowsAndNeverThrows() {
        assertEquals(0, NativeReminderQueue.parse("not json").size());
        assertEquals(0, NativeReminderQueue.parse(null).size());
        assertEquals(1, NativeReminderQueue.parse("[{\"id\":1,\"at\":5,\"title\":\"x\"},{\"id\":2},{\"at\":3,\"title\":\"y\"}]").size());
    }

    @Test public void dueKeepsOnlyTheWindowAndOrdersEarliestFirst() {
        long now = 1_000_000_000_000L;
        List<NativeReminderQueue.Item> p = NativeReminderQueue.parse(items(now + 3 * DAY, 3, now + DAY, 1, now + 20 * DAY, 9, now - 5, 8));
        List<NativeReminderQueue.Item> d = NativeReminderQueue.due(p, now, 7 * DAY, 10);
        assertEquals(2, d.size());
        assertEquals(1, d.get(0).id);
        assertEquals(3, d.get(1).id);
        assertEquals(1, NativeReminderQueue.due(p, now, 7 * DAY, 1).size());
    }

    @Test public void setQueueArmsOnlyDueItemsAndKeepsTheRestStored() {
        long now = System.currentTimeMillis();
        int armed = NativeReminderQueue.setQueue(ctx, "reminder", items(now + DAY, 1, now + 2 * DAY, 2, now + 20 * DAY, 3));
        assertEquals(2, armed);
        assertEquals(2, queued().size());
        assertTrue(NativeReminderQueue.hasItems(ctx));
        // the daily keep-alive is armed so the far item is promoted later with no app open
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        boolean keep = false;
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms())
            if (a.operation != null && NativeAdhanKeepAlive.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) keep = true;
        assertTrue(keep);
    }

    @Test public void replacingAKindCancelsItsOldAlarmsAndLeavesOtherKinds() {
        long now = System.currentTimeMillis();
        NativeReminderQueue.setQueue(ctx, "reminder", items(now + DAY, 1));
        NativeReminderQueue.setQueue(ctx, "task", items(now + 2 * DAY, 2));
        assertEquals(2, queued().size());
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertEquals(1, queued().size());
        NativeReminderQueue.clearAll(ctx);
        assertEquals(0, queued().size());
        assertFalse(NativeReminderQueue.hasItems(ctx));
    }

    @Test public void promoteIsIdempotentAndPromotesNewlyDueItems() {
        long now = System.currentTimeMillis();
        NativeReminderQueue.setQueue(ctx, "review", items(now + 3 * DAY, 1, now + 9 * DAY, 2));
        assertEquals(1, queued().size());
        NativeReminderQueue.promote(ctx);
        assertEquals(1, queued().size());
    }

    @Test public void firingPostsTheStoredNotificationWithOpenIntent() {
        NativeReminderQueue.onFire(ctx, 77, "عنوان", "نص", "al-rabbani-general");
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        android.service.notification.StatusBarNotification[] a = shadowOf(nm).getActiveNotifications();
        assertEquals(1, a.length);
        Notification n = a[0].getNotification();
        assertEquals("عنوان", n.extras.getString(Notification.EXTRA_TITLE));
        assertTrue(n.contentIntent != null);
    }

    @Test public void silentChannelFiresWithoutSoundOrCrashOnBadInput() {
        NativeReminderQueue.onFire(ctx, 78, "x", "y", NativeReminderQueue.SILENT_REMINDER_CHANNEL_ID);
        NativeReminderQueue.onFire(ctx, 79, null, null, null);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        assertEquals(1, shadowOf(nm).getActiveNotifications().length);
        assertEquals(null, nm.getNotificationChannel(NativeReminderQueue.SILENT_REMINDER_CHANNEL_ID).getSound());
    }
}
