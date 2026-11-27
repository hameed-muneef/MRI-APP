package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.Application;
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

import java.io.File;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** أصوات التذكير المخصصة: منطق خالص وكتابة ملفات على محاكاة أندرويد، لا على جهاز. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class CustomSoundsTest {
    private Context ctx;

    @Before public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        NativeReminderQueue.clearAll(ctx);
    }

    @Test public void acceptsOnlyTheAgreedKeysAndExtensions() {
        assertTrue(CustomSounds.isValidKey("abc"));
        assertTrue(CustomSounds.isValidKey("adhan_1-x"));
        StringBuilder sixtyFour = new StringBuilder();
        for (int i = 0; i < 64; i++) sixtyFour.append('a');
        assertTrue(CustomSounds.isValidKey(sixtyFour.toString()));
        assertFalse(CustomSounds.isValidKey(sixtyFour.toString() + "b"));
        assertFalse(CustomSounds.isValidKey("ABC"));
        assertFalse(CustomSounds.isValidKey("a.b"));
        assertFalse(CustomSounds.isValidKey("a/b"));
        assertFalse(CustomSounds.isValidKey(""));
        assertFalse(CustomSounds.isValidKey(null));

        for (String ext : Arrays.asList("mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm")) {
            assertTrue(ext, CustomSounds.isValidExt(ext));
            assertTrue(ext, CustomSounds.isValidExt(ext.toUpperCase()));
        }
        assertFalse(CustomSounds.isValidExt("pdf"));
        assertFalse(CustomSounds.isValidExt("mp3.exe"));
        assertFalse(CustomSounds.isValidExt(null));
        assertEquals("abc.mp3", CustomSounds.fileName("abc", "MP3"));
        assertNull(CustomSounds.fileName("ABC", "mp3"));
        assertNull(CustomSounds.fileName("abc", "pdf"));
    }

    @Test public void refusesTraversalAndUnknownNames() {
        assertTrue(CustomSounds.isSafeSoundKey("abc.mp3"));
        assertFalse(CustomSounds.isSafeSoundKey("../abc.mp3"));
        assertFalse(CustomSounds.isSafeSoundKey("/data/abc.mp3"));
        assertFalse(CustomSounds.isSafeSoundKey("abc"));
        assertFalse(CustomSounds.isSafeSoundKey("abc.pdf"));
        assertFalse(CustomSounds.isSafeSoundKey(""));
        assertEquals("abc", CustomSounds.keyOf("abc.ogg"));
        assertNull(CustomSounds.keyOf("abc"));
        assertNull(CustomSounds.keyOf("ABC.mp3"));
    }

    @Test public void refusesEmptyAndOversizeFiles() {
        assertFalse(CustomSounds.isValidSize(0));
        assertTrue(CustomSounds.isValidSize(1));
        assertTrue(CustomSounds.isValidSize(CustomSounds.MAX_BYTES));
        assertFalse(CustomSounds.isValidSize(CustomSounds.MAX_BYTES + 1));
    }

    @Test public void sanitisesRawNamesAndRejectsAnythingElse() {
        assertEquals("reminder_tone", CustomSounds.sanitizeRawSound("reminder_tone"));
        assertEquals("reminder_tone", CustomSounds.sanitizeRawSound("Reminder_Tone.ogg"));
        assertEquals("", CustomSounds.sanitizeRawSound("../secret"));
        assertEquals("", CustomSounds.sanitizeRawSound("a-b"));
        assertEquals("", CustomSounds.sanitizeRawSound(""));
        assertEquals("", CustomSounds.sanitizeRawSound(null));
    }

    @Test public void writesReadsOverwritesAndPrunes() {
        byte[] small = new byte[] {1, 2, 3};
        assertEquals("tone.mp3", CustomSounds.write(ctx, "tone", "mp3", small));
        String path = CustomSounds.pathFor(ctx, "tone.mp3");
        assertNotNull(path);
        assertEquals(3, new File(path).length());
        // الكتابة مرة أخرى تستبدل الملف
        assertEquals("tone.mp3", CustomSounds.write(ctx, "tone", "mp3", new byte[] {4, 5, 6, 7}));
        assertEquals(4, new File(CustomSounds.pathFor(ctx, "tone.mp3")).length());
        assertNull(CustomSounds.pathFor(ctx, "missing.mp3"));
        assertNull(CustomSounds.pathFor(ctx, "../tone.mp3"));

        assertEquals("other.ogg", CustomSounds.write(ctx, "other", "ogg", small));
        assertEquals(1, CustomSounds.prune(ctx, Arrays.asList("tone.mp3")));
        assertNotNull(CustomSounds.pathFor(ctx, "tone.mp3"));
        assertNull(CustomSounds.pathFor(ctx, "other.ogg"));
        assertEquals(1, CustomSounds.prune(ctx, new ArrayList<String>()));
        assertNull(CustomSounds.pathFor(ctx, "tone.mp3"));
    }

    @Test public void aRowWithACustomSoundPlaysThroughTheServiceOnTheSilentChannel() {
        long soon = System.currentTimeMillis() + 5 * 60_000L;
        NativeReminderQueue.setQueue(ctx, "reminder",
            "[{\"id\":31,\"at\":" + soon + ",\"title\":\"بصوتي\",\"body\":\"\",\"channelId\":\"al-rabbani-general-v2\","
                + "\"soundKey\":\"tone.mp3\"}]");
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        List<ShadowAlarmManager.ScheduledAlarm> armed = new ArrayList<>();
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms()) {
            if (a.operation != null && NativeReminderQueue.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) armed.add(a);
        }
        assertEquals(1, armed.size());
        Intent saved = shadowOf(armed.get(0).operation).getSavedIntent();
        assertEquals("tone.mp3", saved.getStringExtra("soundKey"));
        assertEquals("", saved.getStringExtra("rawSound"));

        NativeReminderQueue.onFire(ctx, 31, "بصوتي", "", "al-rabbani-general-v2", false, "tone.mp3", null);
        Intent started = shadowOf((Application) ctx).getNextStartedService();
        assertNotNull(started);
        assertEquals(ReminderAlarmService.class.getName(), started.getComponent().getClassName());
        assertFalse(started.getBooleanExtra(ReminderAlarmService.EXTRA_ALARM_MODE, true));
        assertEquals("tone.mp3", started.getStringExtra(ReminderAlarmService.EXTRA_SOUND_KEY));
        // القناة الصامتة أُنشئت، والإشعار نفسه تنشئه الخدمة لا الطابور
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        assertNotNull(nm.getNotificationChannel(CustomSounds.CUSTOM_CHANNEL_ID));
        assertEquals(0, shadowOf(nm).getActiveNotifications().length);
    }

    @Test public void aRowWithoutASoundKeepsTheOldNotification() {
        NativeReminderQueue.onFire(ctx, 32, "عادي", "نص", "al-rabbani-general-v2", false, null, null);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        assertEquals(1, shadowOf(nm).getActiveNotifications().length);
        assertNull(shadowOf((Application) ctx).getNextStartedService());
    }

    @Test public void alarmRowsWithAUserSoundStillRingAsAlarms() {
        NativeReminderQueue.onFire(ctx, 33, "منبه", "", "al-rabbani-general-v2", true, "tone.mp3", null);
        Intent started = shadowOf((Application) ctx).getNextStartedService();
        assertNotNull(started);
        assertTrue(started.getBooleanExtra(ReminderAlarmService.EXTRA_ALARM_MODE, false));
        assertEquals("tone.mp3", started.getStringExtra(ReminderAlarmService.EXTRA_SOUND_KEY));
    }
}
