package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** المدة المكتوبة على زر «تأجيل» يجب أن تطابق ما في الإعدادات، وضمن الحدود المسموحة. */
public class NativeReminderQueueSnoozeTest {

    @Test public void keepsAReasonableDelay() {
        assertEquals(10, NativeReminderQueue.clampSnoozeMinutes(10));
        assertEquals(1, NativeReminderQueue.clampSnoozeMinutes(1));
        assertEquals(120, NativeReminderQueue.clampSnoozeMinutes(120));
    }

    @Test public void fallsBackToTenForNonsense() {
        assertEquals(ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES, NativeReminderQueue.clampSnoozeMinutes(0));
        assertEquals(ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES, NativeReminderQueue.clampSnoozeMinutes(-5));
        assertEquals(120, NativeReminderQueue.clampSnoozeMinutes(9999));
    }

    @Test public void writesTheDelayInArabicIndicDigits() {
        assertEquals("١٠", NativeReminderQueue.arabicDigits(10));
        assertEquals("١٢٠", NativeReminderQueue.arabicDigits(120));
        assertEquals("٥", NativeReminderQueue.arabicDigits(5));
    }
}
