package com.alrabbaniyoon.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * Once-a-day inexact refresh trigger. It re-runs the guarded native recompute so the adhan horizon is
 * topped up even when no adhan alarm is armed (for example every prayer was suppressed by quiet hours
 * or the horizon was pruned). Limits, stated plainly:
 *  - It is an inexact allow-while-idle alarm, so the OS may delay it.
 *  - It does NOT survive a user/OEM force-stop: until the app is opened again or a boot/time/package
 *    event arrives, no alarm of this app (including this one) will fire.
 *  - Any refresh re-arms it; a cleared spec cancels it.
 */
public final class NativeAdhanKeepAlive {
    public static final String ACTION = "com.alrabbaniyoon.app.ACTION_DAILY_REFRESH";
    static final int REQUEST_CODE = 7101;
    static final int HOUR = 3;
    static final int MINUTE = 30;

    private NativeAdhanKeepAlive() {}

    /** Next local 03:30 strictly after {@code nowMs} in {@code tz} (pure, unit-tested). */
    public static long nextTriggerMs(long nowMs, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(nowMs);
        c.set(Calendar.HOUR_OF_DAY, HOUR);
        c.set(Calendar.MINUTE, MINUTE);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        if (c.getTimeInMillis() <= nowMs) c.add(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }

    private static PendingIntent pending(Context c, int flags) {
        Intent i = new Intent(c, DailyRefreshReceiver.class).setAction(ACTION);
        return PendingIntent.getBroadcast(c, REQUEST_CODE, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Idempotent: replaces any pending keep-alive with the next 03:30 trigger. Never throws. */
    public static void schedule(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            long at = nextTriggerMs(System.currentTimeMillis(), TimeZone.getDefault());
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending(c, PendingIntent.FLAG_UPDATE_CURRENT));
        } catch (Throwable ignored) {
            // Never let the keep-alive break the refresh path.
        }
    }

    public static void cancel(Context c) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = pending(c, PendingIntent.FLAG_NO_CREATE);
            if (am != null && pi != null) { am.cancel(pi); pi.cancel(); }
        } catch (Throwable ignored) {}
    }
}
