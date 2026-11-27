package com.alrabbaniyoon.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

/**
 * مفتاح الطاقة يوقف الرنين: يُسكت أي تنبيه أو منبه أو تذكير ما زال يرنّ عند تغيّر حالة الشاشة.
 *
 * Android does not deliver SCREEN_ON / SCREEN_OFF to receivers declared in the manifest, so this receiver is
 * registered at runtime, on the application context, each time an alert is posted, and removed after a few
 * minutes. It lives as long as the app process does; if Android kills the process the stop is lost (then the
 * notification Stop button and swipe still work). The rule for what counts as a side-key press is
 * {@link ScreenKeyStopPolicy}. A screen that turns off by timeout looks the same as the key and also stops the
 * sound. Only alerts posted in the last few minutes are touched, see {@link NativeReminderQueue#stopRinging}.
 */
public class ScreenOffStopReceiver extends BroadcastReceiver {
    private static final long LIFETIME_MS = NativeReminderQueue.RINGING_TTL_MS;
    private static final Handler HANDLER = new Handler(Looper.getMainLooper());
    private static ScreenOffStopReceiver active;
    private static Runnable expiry;

    private final boolean startedInteractive;
    private final long startedAt;

    private ScreenOffStopReceiver(boolean startedInteractive) {
        this.startedInteractive = startedInteractive;
        this.startedAt = SystemClock.elapsedRealtime();
    }

    /** Arms (or re-arms) the screen listener for the next few minutes. Never throws. */
    public static synchronized void arm(Context context) {
        try {
            if (context == null) return;
            Context app = context.getApplicationContext();
            if (app == null) return;
            disarm(app);
            PowerManager pm = (PowerManager) app.getSystemService(Context.POWER_SERVICE);
            boolean interactive = pm == null || pm.isInteractive();
            ScreenOffStopReceiver receiver = new ScreenOffStopReceiver(interactive);
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_SCREEN_OFF);
            filter.addAction(Intent.ACTION_SCREEN_ON);
            app.registerReceiver(receiver, filter);
            active = receiver;
            final Context appCtx = app;
            expiry = () -> disarm(appCtx);
            HANDLER.postDelayed(expiry, LIFETIME_MS);
        } catch (Throwable ignored) {
            // Arming must never crash the notifier.
        }
    }

    private static synchronized void disarm(Context app) {
        if (expiry != null) {
            HANDLER.removeCallbacks(expiry);
            expiry = null;
        }
        if (active != null) {
            try { app.unregisterReceiver(active); } catch (Throwable ignored) {}
            active = null;
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        long elapsed = SystemClock.elapsedRealtime() - startedAt;
        if (!ScreenKeyStopPolicy.shouldStop(intent.getAction(), startedInteractive, elapsed)) return;
        try {
            NativeReminderQueue.stopRinging(context);
        } catch (Throwable ignored) {
            // A failing stop must never crash the receiver.
        }
        // The sound is silenced: stop listening instead of waiting for the expiry timer.
        disarm(context.getApplicationContext() != null ? context.getApplicationContext() : context);
    }
}
