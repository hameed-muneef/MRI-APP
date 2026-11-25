package com.alrabbaniyoon.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Daily keep-alive: runs the guarded recompute (which re-arms the next keep-alive when a spec exists). */
public class DailyRefreshReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        NativeAdhanRecompute.refresh(context, "daily_keepalive");
    }
}
