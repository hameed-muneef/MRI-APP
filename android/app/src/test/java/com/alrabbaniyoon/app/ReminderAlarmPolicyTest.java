package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import org.junit.Test;

/** قواعد وضع المنبه — منطق خالص بلا جهاز. */
public class ReminderAlarmPolicyTest {
    private static final long LATE = ScreenKeyStopPolicy.GRACE_MS + 1;

    @Test public void onlyRowsMarkedByTheAppRingAsAlarms() {
        assertTrue(ReminderAlarmPolicy.isAlarmMode(true));
        assertFalse(ReminderAlarmPolicy.isAlarmMode(false));
        assertTrue(ReminderAlarmPolicy.loopsSound(true));
        assertFalse(ReminderAlarmPolicy.loopsSound(false));
    }

    @Test public void alarmRowsUseTheirOwnChannelAndNormalRowsKeepTheirs() {
        assertEquals(ReminderAlarmPolicy.CHANNEL_ID, ReminderAlarmPolicy.channelFor(true, "al-rabbani-general-v2"));
        assertEquals(ReminderAlarmPolicy.CHANNEL_ID, ReminderAlarmPolicy.channelFor(true, null));
        assertEquals("al-rabbani-general-v2", ReminderAlarmPolicy.channelFor(false, "al-rabbani-general-v2"));
        assertEquals(NativeReminderQueue.GENERAL_CHANNEL_ID, ReminderAlarmPolicy.channelFor(false, ""));
        assertEquals(NativeReminderQueue.GENERAL_CHANNEL_ID, ReminderAlarmPolicy.channelFor(false, null));
    }

    @Test public void theAlarmIsBoundedToSixtySeconds() {
        assertEquals(60_000L, ReminderAlarmPolicy.ringDurationMs());
        // لا يرنّ أبدًا أطول من مدة الإشعار الذي يُسكته زر الإيقاف أو مفتاح الطاقة
        assertTrue(ReminderAlarmPolicy.ringDurationMs() <= NativeReminderQueue.RINGING_TTL_MS);
    }

    @Test public void powerKeyRuleMatchesTheAdhan() {
        assertTrue(ReminderAlarmPolicy.stopOnScreenEvent(Intent.ACTION_SCREEN_OFF, true, LATE));
        assertTrue(ReminderAlarmPolicy.stopOnScreenEvent(Intent.ACTION_SCREEN_ON, false, LATE));
        assertFalse(ReminderAlarmPolicy.stopOnScreenEvent(Intent.ACTION_SCREEN_ON, true, LATE));
        assertFalse(ReminderAlarmPolicy.stopOnScreenEvent(Intent.ACTION_SCREEN_OFF, true, 500));
        assertFalse(ReminderAlarmPolicy.stopOnScreenEvent(null, true, LATE));
    }

    @Test public void theScreenListenerNeverOutlivesTheRingingRecord() {
        assertTrue(ReminderAlarmPolicy.isWithinTtl(0));
        assertTrue(ReminderAlarmPolicy.isWithinTtl(NativeReminderQueue.RINGING_TTL_MS));
        assertFalse(ReminderAlarmPolicy.isWithinTtl(NativeReminderQueue.RINGING_TTL_MS + 1));
        assertFalse(ReminderAlarmPolicy.isWithinTtl(-1));
    }
}
