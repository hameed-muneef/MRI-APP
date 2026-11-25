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
import java.util.TimeZone;

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

    @Test public void sharedBudgetLeavesRoomForAdhanAndRegisteredAlarms() {
        assertEquals(100, NativeReminderQueue.allowed(0));
        assertEquals(100, NativeReminderQueue.allowed(350));
        assertEquals(30, NativeReminderQueue.allowed(420));
        assertEquals(0, NativeReminderQueue.allowed(450));
        assertEquals(0, NativeReminderQueue.allowed(900));
        assertEquals(0, NativeReminderQueue.allowed(-1));
        // never more than 450 in total even in the worst case
        for (int others = 0; others < 700; others++) assertTrue(others + NativeReminderQueue.allowed(others) <= Math.max(others, 450));
    }

    @Test public void promoteNeverExceedsTheBudgetAndKeepsTheEarliestFirst() {
        long now = System.currentTimeMillis();
        long[] a = new long[80];
        for (int i = 0; i < 40; i++) { a[2 * i] = now + (i + 1) * 3600_000L; a[2 * i + 1] = 100 + i; }
        NativeReminderQueue.setQueue(ctx, "reminder", items(a));
        assertEquals(30, NativeReminderQueue.promote(ctx, 420));
        assertEquals(30, queued().size());
        long latest = 0;
        for (ShadowAlarmManager.ScheduledAlarm al : queued()) latest = Math.max(latest, al.triggerAtTime);
        assertTrue(latest <= now + 31 * 3600_000L);
        // budget shrinks when other alarms grow: queue alarms are released, never the other way round
        assertEquals(0, NativeReminderQueue.promote(ctx, 460));
        assertEquals(0, queued().size());
        assertTrue(NativeReminderQueue.hasItems(ctx));
        // and they come back when room returns
        assertEquals(40, NativeReminderQueue.promote(ctx, 10));
        assertEquals(40, queued().size());
    }

    @Test public void firedNotificationMatchesLocalNotificationsLook() {
        NativeReminderQueue.onFire(ctx, 90, "t", "b", "al-rabbani-general");
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification n = shadowOf(nm).getActiveNotifications()[0].getNotification();
        assertEquals(Notification.PRIORITY_HIGH, n.priority);
        assertEquals(Notification.VISIBILITY_PRIVATE, n.visibility);
        assertEquals("al-rabbani-general", n.getChannelId());
        assertTrue((n.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        assertTrue((n.flags & Notification.FLAG_ONLY_ALERT_ONCE) != 0);
        assertEquals(null, n.category);
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, nm.getNotificationChannel("al-rabbani-general").getImportance());
        assertTrue(nm.getNotificationChannel("al-rabbani-general").shouldVibrate());
        NativeReminderQueue.onFire(ctx, 91, "t", "b", NativeReminderQueue.SILENT_REMINDER_CHANNEL_ID); // creates the silent channel
        assertEquals(NotificationManager.IMPORTANCE_LOW, nm.getNotificationChannel(NativeReminderQueue.SILENT_REMINDER_CHANNEL_ID).getImportance());
    }

    @Test public void suspendReleasesSlotsButKeepsTheQueueAndPromoteRestoresThem() {
        long now = System.currentTimeMillis();
        NativeReminderQueue.setQueue(ctx, "task", items(now + DAY, 1, now + 2 * DAY, 2));
        assertEquals(2, queued().size());
        NativeReminderQueue.suspend(ctx);
        assertEquals(0, queued().size());
        assertTrue(NativeReminderQueue.hasItems(ctx));
        assertEquals(2, NativeReminderQueue.promote(ctx));
        assertEquals(2, queued().size());
    }

    @Test public void adhanRefreshReleasesAndThenRestoresTheQueue() {
        long now = System.currentTimeMillis();
        NativeReminderQueue.setQueue(ctx, "review", items(now + DAY, 1));
        assertEquals(1, queued().size());
        NativeAdhanRecompute.refresh(ctx, "test"); // no spec: nothing to add, queue must still end up armed
        assertEquals(1, queued().size());
    }

    // ---- time zone / DST re-resolution (wall-clock kinds only) ----
    private static NativeReminderQueue.Item wallItem(int id, int[] wall, String zone) {
        TimeZone tz = TimeZone.getTimeZone(zone);
        return new NativeReminderQueue.Item(id, NativeReminderQueue.instantOf(wall, tz), "t" + id, "b", "al-rabbani-general", wall, zone);
    }

    @Test public void zoneChangeKeepsTheLocalWallClockTime() {
        int[] wall = {2026, 12, 3, 7, 30, 0};
        NativeReminderQueue.Item cairo = wallItem(1, wall, "Africa/Cairo");
        List<NativeReminderQueue.Item> out = NativeReminderQueue.reresolve(java.util.Collections.singletonList(cairo), TimeZone.getTimeZone("Asia/Riyadh"));
        assertEquals(1, out.size());
        assertEquals(NativeReminderQueue.instantOf(wall, TimeZone.getTimeZone("Asia/Riyadh")), out.get(0).atMs);
        assertEquals("Asia/Riyadh", out.get(0).zone);
        assertEquals(1, out.get(0).id);
        assertEquals("t1", out.get(0).title);
        // 07:30 local in both zones: the instants differ by exactly the offset difference, so quiet-hours outcome (a wall-clock rule) is unchanged.
        assertEquals(7, NativeReminderQueue.wallOf(out.get(0).atMs, TimeZone.getTimeZone("Asia/Riyadh"))[3]);
        assertEquals(30, NativeReminderQueue.wallOf(out.get(0).atMs, TimeZone.getTimeZone("Asia/Riyadh"))[4]);
    }

    @Test public void sameZoneAndAbsoluteItemsAreLeftAlone() {
        NativeReminderQueue.Item a = wallItem(1, new int[] {2026, 12, 3, 7, 30, 0}, "Africa/Cairo");
        NativeReminderQueue.Item abs = new NativeReminderQueue.Item(2, 123456789000L, "p", "b", "c");
        List<NativeReminderQueue.Item> in = new ArrayList<>();
        in.add(a); in.add(abs);
        List<NativeReminderQueue.Item> out = NativeReminderQueue.reresolve(in, TimeZone.getTimeZone("Africa/Cairo"));
        assertEquals(a.atMs, out.get(0).atMs);
        assertEquals(123456789000L, out.get(1).atMs);
        out = NativeReminderQueue.reresolve(in, TimeZone.getTimeZone("Asia/Riyadh"));
        assertEquals(123456789000L, out.get(1).atMs); // prayer-style absolute instants never move
    }

    @Test public void dstGapMovesForwardAndOverlapTakesTheFirstOccurrence() {
        TimeZone ny = TimeZone.getTimeZone("America/New_York");
        // 2026-03-08 02:30 does not exist in New York (clocks jump 02:00 -> 03:00).
        long gap = NativeReminderQueue.instantOf(new int[] {2026, 3, 8, 2, 30, 0}, ny);
        int[] gw = NativeReminderQueue.wallOf(gap, ny);
        assertEquals(3, gw[3]);
        // 2026-11-01 01:30 happens twice; the first is EDT (UTC-4) = 05:30Z.
        long overlap = NativeReminderQueue.instantOf(new int[] {2026, 11, 1, 1, 30, 0}, ny);
        assertEquals(1793511000000L, overlap);
    }

    @Test public void setQueueStampsWallClockForReviewOnly() {
        long now = System.currentTimeMillis();
        NativeReminderQueue.setQueue(ctx, "review", items(now + DAY, 1));
        NativeReminderQueue.setQueue(ctx, "prayer", items(now + DAY, 2));
        NativeReminderQueue.setQueue(ctx, "task", items(now + DAY, 4));
        NativeReminderQueue.setQueue(ctx, "reminder", items(now + DAY, 5));
        List<NativeReminderQueue.Item> task = NativeReminderQueue.parse(ctx.getSharedPreferences("RABBANI_NATIVE_REMINDER_QUEUE_V1", Context.MODE_PRIVATE).getString("q_review", null));
        List<NativeReminderQueue.Item> prayer = NativeReminderQueue.parse(ctx.getSharedPreferences("RABBANI_NATIVE_REMINDER_QUEUE_V1", Context.MODE_PRIVATE).getString("q_prayer", null));
        assertTrue(task.get(0).wall != null && task.get(0).zone != null);
        assertEquals(null, prayer.get(0).wall);
        for (String k : new String[] {"task", "reminder"}) {
            assertEquals(null, NativeReminderQueue.parse(ctx.getSharedPreferences("RABBANI_NATIVE_REMINDER_QUEUE_V1", Context.MODE_PRIVATE).getString("q_" + k, null)).get(0).wall);
        }
    }

    @Test public void zoneChangeMovesReviewItemsOnPromoteWithoutResurrectingOrAdding() {
        TimeZone saved = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("Africa/Cairo"));
            long now = System.currentTimeMillis();
            NativeReminderQueue.setQueue(ctx, "review", items(now + DAY, 1, now + 2 * DAY, 2));
            NativeReminderQueue.setQueue(ctx, "prayer", items(now + DAY, 3));
            // the app later replaced the review queue with only item 2 (item 1 was completed): it must stay gone
            NativeReminderQueue.setQueue(ctx, "review", items(now + 2 * DAY, 2));
            NativeReminderQueue.setQueue(ctx, "task", items(now + 3 * DAY, 4)); // task items stay absolute
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Kiritimati")); // +14:00, far from Cairo
            assertEquals(3, NativeReminderQueue.promote(ctx));
            long taskAt = -1, prayerAt = -1, absTaskAt = -1;
            for (ShadowAlarmManager.ScheduledAlarm a : queued()) {
                int id = shadowOf(a.operation).getSavedIntent().getIntExtra("id", -1);
                if (id == 2) taskAt = a.triggerAtTime;
                if (id == 3) prayerAt = a.triggerAtTime;
                if (id == 4) absTaskAt = a.triggerAtTime;
                assertTrue(id != 1);
            }
            assertEquals(now + DAY, prayerAt);
            assertEquals(now + 3 * DAY, absTaskAt);
            int[] w = NativeReminderQueue.wallOf(taskAt, TimeZone.getTimeZone("Pacific/Kiritimati"));
            int[] was = NativeReminderQueue.wallOf(now + 2 * DAY, TimeZone.getTimeZone("Africa/Cairo"));
            assertEquals(java.util.Arrays.toString(was), java.util.Arrays.toString(w));
        } finally {
            TimeZone.setDefault(saved);
        }
    }
}
