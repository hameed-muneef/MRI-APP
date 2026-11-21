package com.alrabbaniyoon.app;

import android.content.Context;
import android.content.Intent;

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
        Context context = getContext();
        JSArray queue = call.getArray("queue");
        if (queue == null || queue.length() == 0) {
            call.reject("queue must be non-empty");
            return;
        }
        int startIndex = call.getInt("startIndex", 0);
        String category = call.getString("category", "quran");

        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_PLAY_QUEUE);
        intent.putExtra(BackgroundAudioService.EXTRA_QUEUE_JSON, queue.toString());
        intent.putExtra(BackgroundAudioService.EXTRA_START_INDEX, startIndex);
        intent.putExtra(BackgroundAudioService.EXTRA_CATEGORY, category);
        ContextCompat.startForegroundService(context, intent);
        call.resolve(new JSObject().put("started", true));
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

    private void sendSimpleAction(String action) {
        Context context = getContext();
        Intent intent = new Intent(context, BackgroundAudioService.class);
        intent.setAction(action);
        try {
            context.startService(intent);
        } catch (Exception ignored) {}
    }
}
