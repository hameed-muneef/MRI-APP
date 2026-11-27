package com.alrabbaniyoon.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * مفتاح الطاقة يوقف الرنين: عند إطفاء الشاشة يُسكت أي تنبيه أو منبه أو تذكير ما زال يرنّ.
 *
 * The power key turns the screen off, so a reminder/task/alarm notification that is still sounding is
 * cancelled here, which is what stops its channel sound. Only alerts this app posted in the last few
 * minutes are touched (see {@link NativeReminderQueue#stopRinging(Context)}), so older notifications in
 * the shade stay put. The adhan playback service keeps its own stop path and is not handled here.
 */
public class ScreenOffStopReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        if (!Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) return;
        try {
            NativeReminderQueue.stopRinging(context);
        } catch (Throwable ignored) {
            // A failing stop must never crash the receiver.
        }
    }
}
