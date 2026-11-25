package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;

import androidx.test.core.app.ApplicationProvider;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

/**
 * Real production classes (NativeAdhanStore, NativeAdhanRecompute, NativeAdhanKeepAlive, receivers) on a
 * simulated Android runtime. This is NOT a physical device: OEM battery policies and force-stop are not covered.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class NativeAdhanLifecycleRobolectricTest {
    private Context ctx;
    private TimeZone originalTz;

    private static String prayer(String key, String ar, boolean enabled, String type) {
        return "\"" + key + "\":{\"enabled\":" + enabled + ",\"type\":\"" + type + "\",\"raw\":\"adhan_almulla\",\"sound\":\"x\",\"nameAr\":\"" + ar + "\"}";
    }

    private static String spec(boolean enabled, String type) {
        return "{\"v\":1,\"lat\":30.0,\"lon\":31.0,\"method\":\"Egyptian\",\"hanafi\":false,"
            + "\"adjust\":{\"Fajr\":0,\"Dhuhr\":0,\"Asr\":0,\"Maghrib\":0,\"Isha\":0},"
            + "\"quiet\":{\"enabled\":false,\"start\":\"22:00\",\"end\":\"06:00\"},\"prayers\":{"
            + prayer("Fajr", "الفجر", enabled, type) + "," + prayer("Dhuhr", "الظهر", enabled, type) + "," + prayer("Asr", "العصر", enabled, type) + ","
            + prayer("Maghrib", "المغرب", enabled, type) + "," + prayer("Isha", "العشاء", enabled, type) + "}}";
    }

    @Before public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        originalTz = TimeZone.getDefault();
        NativeAdhanRecompute.cancelAllAndClearSpec(ctx);
    }

    @After public void tearDown() { TimeZone.setDefault(originalTz); }

    private List<ShadowAlarmManager.ScheduledAlarm> keepAlives() {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        List<ShadowAlarmManager.ScheduledAlarm> out = new ArrayList<>();
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms()) {
            if (a.operation != null && NativeAdhanKeepAlive.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) out.add(a);
        }
        return out;
    }

    private int otherAlarms() {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return shadowOf(am).getScheduledAlarms().size() - keepAlives().size();
    }

    private static void assertLocal0330(long ms, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(ms);
        assertEquals(3, c.get(Calendar.HOUR_OF_DAY));
        assertEquals(30, c.get(Calendar.MINUTE));
    }

    @Test public void noSpecNeverArmsAnything() {
        assertEquals("no_spec", NativeAdhanRecompute.refresh(ctx, "t"));
        assertEquals(0, keepAlives().size());
        assertEquals(0, otherAlarms());
    }

    @Test public void specArmsAdhanAlarmsAndExactlyOneIdempotentKeepAlive() {
        NativeAdhanRecompute.saveSpec(ctx, spec(true, "full"));
        assertEquals("ok", NativeAdhanRecompute.refresh(ctx, "t1"));
        assertTrue(otherAlarms() > 0);
        assertEquals(1, keepAlives().size());
        long now = System.currentTimeMillis();
        long at = keepAlives().get(0).triggerAtTime;
        assertTrue(at > now && at - now <= 25L * 3600_000L);
        assertLocal0330(at, TimeZone.getDefault());
        int armed = otherAlarms();
        assertEquals("ok", NativeAdhanRecompute.refresh(ctx, "t2"));
        assertEquals(1, keepAlives().size());
        assertEquals("refresh is add-only and idempotent", armed, otherAlarms());
    }

    @Test public void zeroArmedSetKeepsTheDailyRefreshAlive() {
        NativeAdhanRecompute.saveSpec(ctx, spec(false, "full")); // every prayer disabled
        assertEquals("ok", NativeAdhanRecompute.refresh(ctx, "t"));
        assertEquals(0, otherAlarms());
        assertEquals(1, keepAlives().size());
        // Enabling later is picked up by the next daily refresh without the app being opened.
        NativeAdhanRecompute.saveSpec(ctx, spec(true, "full"));
        assertEquals("ok", NativeAdhanRecompute.refresh(ctx, "daily_keepalive"));
        assertTrue(otherAlarms() > 0);
    }

    @Test public void cancelAndClearRemovesAlarmsAndKeepAlive() {
        NativeAdhanRecompute.saveSpec(ctx, spec(true, "full"));
        NativeAdhanRecompute.refresh(ctx, "t");
        assertTrue(otherAlarms() > 0 && keepAlives().size() == 1);
        NativeAdhanRecompute.cancelAllAndClearSpec(ctx);
        assertEquals(0, otherAlarms());
        assertEquals(0, keepAlives().size());
        assertEquals("a stale refresh after cancel must not re-arm", "no_spec", NativeAdhanRecompute.refresh(ctx, "late"));
        assertEquals(0, otherAlarms());
        assertEquals(0, keepAlives().size());
    }

    @Test public void keepAliveFollowsTimezoneChanges() {
        NativeAdhanRecompute.saveSpec(ctx, spec(true, "full"));
        for (String id : new String[]{"Pacific/Auckland", "America/New_York", "Africa/Cairo"}) {
            TimeZone tz = TimeZone.getTimeZone(id);
            TimeZone.setDefault(tz);
            NativeAdhanRecompute.refresh(ctx, "tz_changed");
            assertEquals(1, keepAlives().size());
            assertLocal0330(keepAlives().get(0).triggerAtTime, tz);
        }
    }

    /** Context whose AlarmManager is unavailable (permission or OEM failure). */
    private Context noAlarmService() {
        return new ContextWrapper(ctx) {
            @Override public Object getSystemService(String name) {
                return Context.ALARM_SERVICE.equals(name) ? null : super.getSystemService(name);
            }
        };
    }

    @Test public void alarmServiceFailureNeverCrashesRefreshOrReceivers() {
        NativeAdhanRecompute.saveSpec(ctx, spec(true, "full"));
        Context broken = noAlarmService();
        NativeAdhanKeepAlive.schedule(broken);
        NativeAdhanKeepAlive.cancel(broken);
        assertNotNull(NativeAdhanRecompute.refresh(broken, "t")); // returns a result code, never throws
        new DailyRefreshReceiver().onReceive(broken, new Intent(NativeAdhanKeepAlive.ACTION));
        new DailyRefreshReceiver().onReceive(null, null);
    }

    @Test public void silentAlarmPostsANotificationOnAChannelWithoutSoundOrVibration() {
        Intent i = new Intent(ctx, AdhanAlarmReceiver.class)
            .putExtra(AdhanAlarmReceiver.EXTRA_ALARM_ID, 4242)
            .putExtra(AdhanAlarmReceiver.EXTRA_TITLE, "t")
            .putExtra(AdhanAlarmReceiver.EXTRA_BODY, "b")
            .putExtra(AdhanAlarmReceiver.EXTRA_ADHAN_TYPE, "silent")
            .putExtra(AdhanAlarmReceiver.EXTRA_PRAYER_KEY, "2026-11-25:fajr");
        new AdhanAlarmReceiver().onReceive(ctx, i);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        assertTrue(shadowOf(nm).size() >= 1);
        NotificationChannel ch = nm.getNotificationChannel(NativeAdhanStore.SILENT_CHANNEL_ID);
        assertNotNull(ch);
        assertNull(ch.getSound());
        assertFalse(ch.shouldVibrate());
    }

    @Test public void garbageAlarmIntentNeverCrashes() {
        new AdhanAlarmReceiver().onReceive(ctx, new Intent());
        new AdhanAlarmReceiver().onReceive(noAlarmService(), new Intent());
    }
}
