package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** Android 7.0 (API 24, no notification channels): sound and vibration come from the notification itself. Simulated runtime. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 24)
public class NativeReminderQueueLegacyTest {
    @Test public void silentReminderHasNoSoundOrVibrationOnApi24() {
        Context ctx = ApplicationProvider.getApplicationContext();
        NativeReminderQueue.onFire(ctx, 1, "t", "b", NativeReminderQueue.SILENT_REMINDER_CHANNEL_ID);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification n = shadowOf(nm).getAllNotifications().get(0);
        assertNull(n.sound);
        assertEquals(0, n.defaults & (Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE));
    }

    @Test public void generalReminderVibratesAndUsesTheConfiguredOrDefaultSoundOnApi24() {
        Context ctx = ApplicationProvider.getApplicationContext();
        NativeReminderQueue.onFire(ctx, 2, "t", "b", NativeReminderQueue.GENERAL_CHANNEL_ID);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        Notification n = shadowOf(nm).getAllNotifications().get(0);
        assertTrue((n.defaults & Notification.DEFAULT_VIBRATE) != 0);
        // either the bundled adhan_almulla raw sound, or the default sound when that resource is not bundled
        assertTrue(n.sound != null || (n.defaults & Notification.DEFAULT_SOUND) != 0);
    }
}
