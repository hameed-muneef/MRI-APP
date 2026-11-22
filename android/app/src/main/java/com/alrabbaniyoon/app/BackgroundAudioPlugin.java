package com.alrabbaniyoon.app;

import android.provider.Settings;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        BackgroundAudioService.setStateListener(this::dispatchState);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        BackgroundAudioService.setStateListener(this::dispatchState);
        dispatchState(BackgroundAudioService.getLastSnapshot());
    }

    @Override
    protected void handleOnDestroy() {
        BackgroundAudioService.setStateListener(null);
        super.handleOnDestroy();
    }

    private void dispatchState(JSONObject state) {
        if (state == null) return;
        try {
            JSObject js = JSObject.fromJSONObject(state);
            notifyListeners("stateChange", js);
        } catch (JSONException ignored) {}
    }

    @PluginMethod
    public void playQueue(PluginCall call) {
        JSArray queue = call.getArray("queue");
        if (queue == null || queue.length() == 0) {
            call.reject("queue must be non-empty");
            return;
        }
        int startIndex = call.getInt("startIndex", 0);
        String category = call.getString("category", "quran");
        startPlaybackService(queue.toString(), startIndex, category);
        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void playSingle(PluginCall call) {
        JSObject trackObj = call.getObject("track");
        if (trackObj == null) {
            trackObj = call.getData();
        }
        if (trackObj == null || trackObj.optString("url", "").trim().isEmpty()) {
            call.reject("track url must be non-empty");
            return;
        }
        String category = trackObj.optString("category", "quran");
        JSArray queue = new JSArray();
        queue.put(trackObj);
        startPlaybackService(queue.toString(), 0, category);
        call.resolve(new JSObject().put("started", true));
    }

    private void startPlaybackService(String queueJson, int startIndex, String category) {
        Context context = getContext();
        BackgroundAudioService.setPendingQueueJson(queueJson);
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_PLAY_QUEUE);
        intent.putExtra(BackgroundAudioService.EXTRA_USE_PENDING, true);
        intent.putExtra(BackgroundAudioService.EXTRA_START_INDEX, startIndex);
        intent.putExtra(BackgroundAudioService.EXTRA_CATEGORY, category);
        ContextCompat.startForegroundService(context, intent);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        sendSimpleAction(BackgroundAudioService.ACTION_PAUSE);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        sendSimpleAction(BackgroundAudioService.ACTION_RESUME);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_STOP);
        try {
            context.startService(intent);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void next(PluginCall call) {
        sendSimpleAction(BackgroundAudioService.ACTION_NEXT);
        call.resolve();
    }

    @PluginMethod
    public void previous(PluginCall call) {
        sendSimpleAction(BackgroundAudioService.ACTION_PREV);
        call.resolve();
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        double posSec = call.getDouble("positionSec", 0.0);
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_SEEK);
        intent.putExtra(BackgroundAudioService.EXTRA_SEEK_MS, Math.round(Math.max(0.0, posSec) * 1000.0));
        try {
            context.startService(intent);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(BackgroundAudioService.getLastSnapshot()));
        } catch (JSONException e) {
            call.resolve(new JSObject().put("status", "idle"));
        }
    }

    @PluginMethod
    public void setSleepTimer(PluginCall call) {
        int minutes = call.getInt("minutes", 0);
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_SLEEP_TIMER);
        intent.putExtra(BackgroundAudioService.EXTRA_SLEEP_MS, minutes > 0 ? (long) minutes * 60 * 1000L : 0L);
        try { context.startService(intent); } catch (Exception ignored) {}
        call.resolve(new JSObject().put("minutes", minutes));
    }

    /** شاشة تشخيصية: حالة المشغل الحالية (مستوى الصوت، التحضير، الخطأ). */
    @PluginMethod
    public void diagnosticInfo(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(BackgroundAudioService.getLastSnapshot()));
        } catch (JSONException e) {
            call.resolve(new JSObject().put("status", "idle").put("engine", "native"));
        }
    }

    /** محرّك تشغيل الأذان — اختبار Web على واجهة المستخدم. */
    @PluginMethod
    public void testWebAdhanPlayback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    /** إرسال إشعار أذان للتجربة (بعد محول حوافز شبكة موجودة). */
    @PluginMethod
    public void testAdhanNotification(PluginCall call) {
        Context context = getContext();
        String raw = NativeAdhanStore.DEFAULT_ADHAN_RAW;
        String channelId = NativeAdhanStore.ensureAdhanNotificationChannel(context, raw, null);
        final Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try { Thread.sleep(800); } catch (InterruptedException ignored) {}
            AdhanAlarmReceiver.postChannelNotification(
                appContext, 9001, channelId, "تجربة الأذان", "صوت تجريبي لاختبار الإشعار");
        }).start();
        call.resolve(new JSObject().put("scheduled", true));
    }

    /** الحفر على إعدادات قناة الأذان — بكر تجريبي لزر on my phone. */
    @PluginMethod
    public void openAdhanChannelSettings(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Context context = getContext();
            Intent intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .setData(Uri.parse("package:" + context.getPackageName() + "/" + NativeAdhanStore.channelIdForRaw(NativeAdhanStore.DEFAULT_ADHAN_RAW)));
            context.startActivity(intent);
            ret.put("opened", true);
        } catch (Exception e) {
            ret.put("opened", false);
            ret.put("error", e.getMessage() != null ? e.getMessage() : "unknown");
        }
        call.resolve(ret);
    }

    private void sendSimpleAction(String action) {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(action);
        try {
            context.startService(intent);
        } catch (Exception ignored) {}
    }
}
