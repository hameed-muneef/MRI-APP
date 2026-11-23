package com.alrabbaniyoon.app;

import android.os.Build;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();
    private final AtomicInteger downloadGeneration = new AtomicInteger(0);

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
    public void setPlaybackRate(PluginCall call) {
        double rate=call.getDouble("rate",1.0);
        if(Double.isNaN(rate)||Double.isInfinite(rate)||rate<0.5||rate>2.0){call.reject("Invalid playback rate");return;}
        Intent intent=new Intent(getContext(),BackgroundAudioService.class);
        intent.setAction(BackgroundAudioService.ACTION_RATE);
        intent.putExtra("playback_rate",(float)rate);
        try { getContext().startService(intent);call.resolve(); } catch(Exception ex){call.reject("Playback speed unavailable",ex);}
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

    /** تنزيل ملف صوتي للاستخدام الدائم دون إنترنت داخل التخزين الخاص للتطبيق. */
    @PluginMethod
    public void downloadOfflineAudio(PluginCall call) {
        String id = call.getString("id", "").trim();
        String urlStr = call.getString("url", "").trim();
        if (id.isEmpty() || urlStr.isEmpty()) {
            call.reject("id and url are required");
            return;
        }
        final int gen = downloadGeneration.get();
        final Context appContext = getContext().getApplicationContext();
        final File targetFile = BackgroundAudioService.offlineAudioFile(appContext, id);

        if (targetFile.isFile() && targetFile.length() > 128) {
            JSObject ret = new JSObject();
            ret.put("id", id);
            ret.put("bytes", targetFile.length());
            ret.put("alreadyExists", true);
            call.resolve(ret);
            return;
        }

        downloadExecutor.submit(() -> {
            HttpURLConnection conn = null;
            File tempFile = new File(targetFile.getParentFile(), targetFile.getName() + ".part");
            try {
                if (gen != downloadGeneration.get()) {
                    call.reject("cancelled");
                    return;
                }
                URL currentUrl = new URL(urlStr.replace(" ", "%20"));
                for (int hop = 0; hop <= 6; hop++) {
                    if (gen != downloadGeneration.get()) {
                        call.reject("cancelled");
                        return;
                    }
                    conn = (HttpURLConnection) currentUrl.openConnection();
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(45000);
                    conn.setRequestMethod("GET");
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") AppleWebKit/537.36 Mobile Safari/537.36");
                    conn.setRequestProperty("Accept", "audio/mpeg, audio/ogg, audio/mp4, audio/*;q=0.9, */*;q=0.8");

                    int code = conn.getResponseCode();
                    if (code == HttpURLConnection.HTTP_MOVED_PERM
                        || code == HttpURLConnection.HTTP_MOVED_TEMP
                        || code == HttpURLConnection.HTTP_SEE_OTHER
                        || code == 307
                        || code == 308) {
                        String loc = conn.getHeaderField("Location");
                        conn.disconnect();
                        conn = null;
                        if (loc == null || loc.trim().isEmpty()) {
                            throw new IOException("Redirect without Location (HTTP " + code + ")");
                        }
                        currentUrl = new URL(currentUrl, loc.trim());
                        continue;
                    }
                    if (code < 200 || code >= 300) {
                        throw new IOException("HTTP " + code);
                    }
                    String ct = conn.getContentType();
                    if (ct != null) {
                        String ctLower = ct.toLowerCase(Locale.US);
                        if (ctLower.startsWith("text/html") || ctLower.contains("application/json") || ctLower.contains("xml")) {
                            throw new IOException("Invalid audio content-type: " + ct);
                        }
                    }

                    long totalBytes = 0L;
                    try (InputStream in = conn.getInputStream();
                         FileOutputStream out = new FileOutputStream(tempFile)) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) != -1) {
                            if (gen != downloadGeneration.get()) {
                                throw new IOException("cancelled");
                            }
                            out.write(buf, 0, n);
                            totalBytes += n;
                        }
                        out.flush();
                    }

                    if (totalBytes <= 128) {
                        throw new IOException("Empty audio download");
                    }
                    if (targetFile.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        targetFile.delete();
                    }
                    if (!tempFile.renameTo(targetFile)) {
                        throw new IOException("Failed saving offline audio file");
                    }

                    JSObject ret = new JSObject();
                    ret.put("id", id);
                    ret.put("bytes", totalBytes);
                    ret.put("alreadyExists", false);
                    call.resolve(ret);
                    return;
                }
                throw new IOException("Too many redirects");
            } catch (Exception ex) {
                if (tempFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    tempFile.delete();
                }
                String msg = ex.getMessage() != null ? ex.getMessage() : "Download failed";
                call.reject(msg);
            } finally {
                if (conn != null) {
                    try { conn.disconnect(); } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void cancelOfflineDownloads(PluginCall call) {
        downloadGeneration.incrementAndGet();
        call.resolve(new JSObject().put("cancelled", true));
    }

    @PluginMethod
    public void deleteOfflineAudio(PluginCall call) {
        Context appContext = getContext().getApplicationContext();
        String id = call.getString("id", "").trim();
        String prefix = call.getString("prefix", "").trim();
        int deletedCount = 0;
        long freedBytes = 0L;

        if (!id.isEmpty()) {
            File target = BackgroundAudioService.offlineAudioFile(appContext, id);
            if (target.exists() && target.isFile()) {
                long len = target.length();
                if (target.delete()) {
                    deletedCount++;
                    freedBytes += len;
                }
            }
        } else if (!prefix.isEmpty()) {
            String safePrefix = BackgroundAudioService.sanitizeOfflineId(prefix);
            File dir = BackgroundAudioService.getOfflineAudioDir(appContext);
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    if (f.isFile() && f.getName().startsWith(safePrefix)) {
                        long len = f.length();
                        if (f.delete()) {
                            deletedCount++;
                            freedBytes += len;
                        }
                    }
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("deletedCount", deletedCount);
        ret.put("freedBytes", freedBytes);
        call.resolve(ret);
    }

    @PluginMethod
    public void listOfflineAudio(PluginCall call) {
        Context appContext = getContext().getApplicationContext();
        File dir = BackgroundAudioService.getOfflineAudioDir(appContext);
        File[] files = dir.listFiles();
        JSArray items = new JSArray();
        long totalBytes = 0L;
        if (files != null) {
            for (File f : files) {
                if (!f.isFile() || f.getName().endsWith(".part")) continue;
                long len = f.length();
                totalBytes += len;
                JSObject obj = new JSObject();
                obj.put("name", f.getName());
                obj.put("bytes", len);
                items.put(obj);
            }
        }
        JSObject ret = new JSObject();
        ret.put("totalBytes", totalBytes);
        ret.put("files", items);
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
