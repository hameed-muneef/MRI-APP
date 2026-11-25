package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.Calendar;
import java.util.TimeZone;

import org.junit.Test;

/** Pure scheduling math of the daily keep-alive (no Android). */
public class NativeAdhanKeepAliveTest {
    private static long at(TimeZone tz, int y, int mo, int d, int h, int mi) {
        Calendar c = Calendar.getInstance(tz);
        c.clear(); c.set(y, mo - 1, d, h, mi, 0);
        return c.getTimeInMillis();
    }

    private static void assertLocal(TimeZone tz, long ms, int y, int mo, int d, int h, int mi) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(ms);
        assertEquals(y, c.get(Calendar.YEAR)); assertEquals(mo - 1, c.get(Calendar.MONTH)); assertEquals(d, c.get(Calendar.DAY_OF_MONTH));
        assertEquals(h, c.get(Calendar.HOUR_OF_DAY)); assertEquals(mi, c.get(Calendar.MINUTE));
    }

    @Test public void beforeTriggerSameDay() {
        TimeZone tz = TimeZone.getTimeZone("Africa/Cairo");
        assertLocal(tz, NativeAdhanKeepAlive.nextTriggerMs(at(tz, 2026, 11, 25, 1, 0), tz), 2026, 11, 25, 3, 30);
    }

    @Test public void afterTriggerNextDay() {
        TimeZone tz = TimeZone.getTimeZone("Africa/Cairo");
        assertLocal(tz, NativeAdhanKeepAlive.nextTriggerMs(at(tz, 2026, 11, 25, 15, 0), tz), 2026, 11, 26, 3, 30);
    }

    @Test public void exactlyAtTriggerMovesToNextDay() {
        TimeZone tz = TimeZone.getTimeZone("Africa/Cairo");
        long now = at(tz, 2026, 11, 25, 3, 30);
        long next = NativeAdhanKeepAlive.nextTriggerMs(now, tz);
        assertTrue(next > now);
        assertLocal(tz, next, 2026, 11, 26, 3, 30);
    }

    @Test public void staysLocalAcrossDstChanges() {
        TimeZone ny = TimeZone.getTimeZone("America/New_York");
        // US spring-forward on 2026-03-08: the day has 23 hours, trigger is still 03:30 local.
        assertLocal(ny, NativeAdhanKeepAlive.nextTriggerMs(at(ny, 2026, 3, 7, 12, 0), ny), 2026, 3, 8, 3, 30);
        // Fall-back on 2026-11-01.
        assertLocal(ny, NativeAdhanKeepAlive.nextTriggerMs(at(ny, 2026, 10, 31, 12, 0), ny), 2026, 11, 1, 3, 30);
    }

    @Test public void alwaysWithinOneDayAndInTheFuture() {
        TimeZone tz = TimeZone.getTimeZone("Asia/Riyadh");
        long now = at(tz, 2026, 6, 15, 12, 34);
        long next = NativeAdhanKeepAlive.nextTriggerMs(now, tz);
        assertTrue(next > now && next - now <= 25L * 3600_000L);
    }
}
