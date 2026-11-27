package com.alrabbaniyoon.app;

/**
 * قواعد وضع المنبه لكل تذكير: قناة عالية الأهمية، صوت متكرر لستين ثانية، وإسكات بمفتاح الطاقة.
 *
 * The JS side marks a queue row with {@code alarmMode: true} when the user wants that reminder to ring like an
 * alarm instead of a single notification sound. Everything here is pure so it can be unit-tested without a device.
 */
public final class ReminderAlarmPolicy {

    /** Separate channel from the normal reminder channels: importance max and the alarm audio usage. */
    public static final String CHANNEL_ID = "al-rabbani-reminder-alarm-v1";
    public static final String CHANNEL_NAME = "منبه التذكير (وضع المنبه)";
    public static final String CHANNEL_DESCRIPTION = "تذكيرات مشغّلة بوضع المنبه: صوت متكرر حتى الإيقاف أو ستين ثانية";

    /** The bundled tone the alarm channel and the looping service use. */
    public static final String RAW_SOUND = "reminder_tone";

    /** How long an alarm rings before it gives up on its own. */
    public static final long MAX_RING_MS = 60_000L;

    private ReminderAlarmPolicy() {}

    /** True only for rows the JS marked; every other row keeps the current single-sound behaviour. */
    public static boolean isAlarmMode(boolean rowAlarmMode) {
        return rowAlarmMode;
    }

    /**
     * The channel a row posts on. An alarm row ignores the channel the JS sent, because its sound comes from the
     * looping service rather than from a channel notification.
     */
    public static String channelFor(boolean alarmMode, String requestedChannel) {
        if (alarmMode) return CHANNEL_ID;
        if (requestedChannel == null || requestedChannel.isEmpty()) return NativeReminderQueue.GENERAL_CHANNEL_ID;
        return requestedChannel;
    }

    /** The looping sound is the whole point of the mode; a normal reminder plays its channel sound once. */
    public static boolean loopsSound(boolean alarmMode) {
        return alarmMode;
    }

    /** Bounded so a forgotten alarm cannot ring forever, and short enough not to fight a call or the adhan. */
    public static long ringDurationMs() {
        return MAX_RING_MS;
    }

    /** Same power-key rule as the adhan: the screen state is the only signal Android gives us. */
    public static boolean stopOnScreenEvent(String action, boolean startedInteractive, long elapsedMs) {
        return ScreenKeyStopPolicy.shouldStop(action, startedInteractive, elapsedMs);
    }

    /** The listener lives no longer than the ringing record, so it cannot silence a later, unrelated alert. */
    public static boolean isWithinTtl(long elapsedMs) {
        return elapsedMs >= 0 && elapsedMs <= NativeReminderQueue.RINGING_TTL_MS;
    }
}
