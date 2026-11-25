package com.alrabbaniyoon.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Posts a queued reminder (see NativeReminderQueue) when its alarm fires. */
public class QueuedReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        NativeReminderQueue.onFire(
            context,
            intent.getIntExtra("id", 0),
            intent.getStringExtra("title"),
            intent.getStringExtra("body"),
            intent.getStringExtra("channelId")
        );
    }
}
