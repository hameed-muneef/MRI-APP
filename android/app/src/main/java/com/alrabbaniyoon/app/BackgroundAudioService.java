package com.alrabbaniyoon.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Logger;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Foreground MediaPlayback Service for continuous background audio across:
 * - Quran recitation (Surah / Ayah / Hifz queue)
 * - Azkar category audio queue
 * - Haramain Live channels (Quran TV & Sunnah TV HLS audio streams)
 *
 * Uses standard Android MediaPlayer + MediaSession + Notification.MediaStyle
 * with PARTIAL_WAKE_LOCK, WifiLock, AudioFocus, and noisy-headset pause handling.
 */
public class BackgroundAudioService extends Service {

    public static final String ACTION_PLAY_QUEUE = "com.alrabbaniyoon.app.action.BG_PLAY_QUEUE";
    public static final String ACTION_PAUSE = "com.alrabbaniyoon.app.action.BG_PAUSE";
    public static final String ACTION_RESUME = "com.alrabbaniyoon.app.action.BG_RESUME";
    public static final String ACTION_TOGGLE = "com.alrabbaniyoon.app.action.BG_TOGGLE";
    public static final String ACTION_NEXT = "com.alrabbaniyoon.app.action.BG_NEXT";
    public static final String ACTION_PREV = "com.alrabbaniyoon.app.action.BG_PREV";
    public static final String ACTION_SEEK = "com.alrabbaniyoon.app.action.BG_SEEK";
    public static final String ACTION_STOP = "com.alrabbaniyoon.app.action.BG_STOP";

    public static final String EXTRA_QUEUE_JSON = "queue_json";
    public static final String EXTRA_START_INDEX = "start_index";
    public static final String EXTRA_CATEGORY = "category";
    public static final String EXTRA_SEEK_MS = "seek_ms";

    private static final String MEDIA_CHANNEL_ID = "al-rabbani-media-playback-v1";
    private static final int MEDIA_NOTIF_ID = 90120;
    private static final long MAX_WAKELOCK_MS = 4 * 60 * 60 * 1000L; // 4-hour safety cap per acquire

    public interface StateListener {
        void onStateChanged(JSONObject state);
    }

    public static final class AudioTrackItem {
        public final String id;
        public final String title;
        public final String subtitle;
        public final String url;
        public final String category;
        public final boolean isLive;

        public AudioTrackItem(String id, String title, String subtitle, String url, String category, boolean isLive) {
            this.id = id;
            this.title = title;
            this.subtitle = subtitle;
            this.url = url;
            this.category = category;
            this.isLive = isLive;
        }

        public JSONObject toJson() {
            JSONObject obj = new JSONObject();
            try {
                obj.put("id", id);
                obj.put("title", title);
                obj.put("subtitle", subtitle);
                obj.put("url", url);
                obj.put("category", category);
                obj.put("isLive", isLive);
            } catch (JSONException ignored) {}
            return obj;
        }

        public static AudioTrackItem fromJson(JSONObject obj, String fallbackCategory) {
            if (obj == null) return null;
            String url = obj.optString("url", "").trim();
            if (url.isEmpty()) return null;
            String id = obj.optString("id", url);
            String title = obj.optString("title", "الربانيون");
            String subtitle = obj.optString("subtitle", "");
            String cat = obj.optString("category", fallbackCategory);
            boolean live = obj.optBoolean("isLive", false);
            return new AudioTrackItem(id, title, subtitle, url, cat, live);
        }
    }

    private static volatile StateListener stateListener;
    private static volatile JSONObject lastSnapshot = defaultIdleSnapshot();

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<AudioTrackItem> queue = new ArrayList<>();
    private int currentIndex = -1;
    private String currentCategory = null;
    private String status = "idle"; // idle | loading | playing | paused | error
    private String lastError = null;
    private int prepareGeneration = 0;

    private MediaPlayer mediaPlayer;
    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean hasAudioFocus = false;
    private boolean resumeOnFocusGain = false;
    private boolean noisyReceiverRegistered = false;
    private Bitmap appIconBitmap;

    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            if ("playing".equals(status) && mediaPlayer != null) {
                emitState();
                handler.postDelayed(this, 1000L);
            }
        }
    };

    private final BroadcastReceiver noisyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(intent != null ? intent.getAction() : null)) {
                pausePlayback();
            }
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
            resumeOnFocusGain = false;
            pausePlayback();
        } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            if ("playing".equals(status) || "loading".equals(status)) {
                resumeOnFocusGain = true;
                pausePlayback();
            }
        } else if (focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            if (mediaPlayer != null) {
                try { mediaPlayer.setVolume(0.25f, 0.25f); } catch (Exception ignored) {}
            }
        } else if (focusChange == AudioManager.AUDIOFOCUS_GAIN) {
            if (mediaPlayer != null) {
                try { mediaPlayer.setVolume(1.0f, 1.0f); } catch (Exception ignored) {}
            }
            if (resumeOnFocusGain) {
                resumeOnFocusGain = false;
                resumePlayback();
            }
        }
    };

    public static void setStateListener(StateListener listener) {
        stateListener = listener;
    }

    public static JSONObject getLastSnapshot() {
        return lastSnapshot != null ? lastSnapshot : defaultIdleSnapshot();
    }

    private static JSONObject defaultIdleSnapshot() {
        JSONObject obj = new JSONObject();
        try {
            obj.put("status", "idle");
            obj.put("category", JSONObject.NULL);
            obj.put("currentIndex", -1);
            obj.put("currentTrack", JSONObject.NULL);
            obj.put("currentTime", 0);
            obj.put("duration", 0);
            obj.put("error", JSONObject.NULL);
            obj.put("queueLength", 0);
        } catch (JSONException ignored) {}
        return obj;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        try {
            appIconBitmap = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
        } catch (Exception ignored) {}

        mediaSession = new MediaSession(this, "RabbaniBackgroundAudio");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                resumePlayback();
            }

            @Override
            public void onPause() {
                pausePlayback();
            }

            @Override
            public void onSkipToNext() {
                playNext();
            }

            @Override
            public void onSkipToPrevious() {
                playPrevious();
            }

            @Override
            public void onStop() {
                stopAllAndSelf();
            }

            @Override
            public void onSeekTo(long pos) {
                seekToMs((int) Math.max(0L, pos));
            }
        });
        mediaSession.setActive(true);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopAllAndSelf();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_STOP.equals(action)) {
            stopAllAndSelf();
            return START_NOT_STICKY;
        }

        ensureChannel();
        enterForegroundNow();

        if (!ACTION_PLAY_QUEUE.equals(action) && queue.isEmpty()) {
            stopAllAndSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_PLAY_QUEUE.equals(action)) {
            String queueJson = intent.getStringExtra(EXTRA_QUEUE_JSON);
            String category = intent.getStringExtra(EXTRA_CATEGORY);
            int startIndex = intent.getIntExtra(EXTRA_START_INDEX, 0);
            loadAndStartQueue(queueJson, startIndex, category);
        } else if (ACTION_PAUSE.equals(action)) {
            resumeOnFocusGain = false;
            pausePlayback();
        } else if (ACTION_RESUME.equals(action)) {
            resumePlayback();
        } else if (ACTION_TOGGLE.equals(action)) {
            if ("playing".equals(status) || "loading".equals(status)) {
                resumeOnFocusGain = false;
                pausePlayback();
            } else {
                resumePlayback();
            }
        } else if (ACTION_NEXT.equals(action)) {
            playNext();
        } else if (ACTION_PREV.equals(action)) {
            playPrevious();
        } else if (ACTION_SEEK.equals(action)) {
            long seekMs = intent.getLongExtra(EXTRA_SEEK_MS, 0L);
            seekToMs((int) Math.max(0L, seekMs));
        } else {
            if (queue.isEmpty()) {
                stopAllAndSelf();
            }
        }

        return START_NOT_STICKY;
    }

    private void enterForegroundNow() {
        Notification notification = buildMediaNotification();
        int fgsType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            : 0;
        ServiceCompat.startForeground(this, MEDIA_NOTIF_ID, notification, fgsType);
    }

    private void loadAndStartQueue(String queueJson, int startIndex, String category) {
        List<AudioTrackItem> parsed = new ArrayList<>();
        if (queueJson != null && !queueJson.isEmpty()) {
            try {
                JSONArray arr = new JSONArray(queueJson);
                for (int i = 0; i < arr.length(); i++) {
                    AudioTrackItem item = AudioTrackItem.fromJson(arr.optJSONObject(i), category != null ? category : "quran");
                    if (item != null) parsed.add(item);
                }
            } catch (JSONException ex) {
                Logger.error("BackgroundAudioService", "Invalid queue JSON", ex);
            }
        }

        if (parsed.isEmpty()) {
            lastError = "لا توجد مقاطع صوتية صالحة للتشغيل.";
            status = "error";
            emitState();
            stopAllAndSelf();
            return;
        }

        queue.clear();
        queue.addAll(parsed);
        currentCategory = category != null ? category : parsed.get(0).category;
        int clamped = Math.max(0, Math.min(startIndex, queue.size() - 1));
        lastError = null;
        startTrackAt(clamped);
    }

    private void startTrackAt(int index) {
        if (index < 0 || index >= queue.size()) {
            stopAllAndSelf();
            return;
        }

        currentIndex = index;
        AudioTrackItem track = queue.get(currentIndex);
        currentCategory = track.category;
        lastError = null;
        status = "loading";

        releasePlayerOnly();
        acquireLocks();
        registerNoisyReceiver();
        if (!requestAudioFocus()) {
            status = "paused";
            updateMediaSessionAndNotification();
            emitState();
            return;
        }

        final int gen = ++prepareGeneration;
        MediaPlayer mp = new MediaPlayer();
        mediaPlayer = mp;

        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build();
            mp.setAudioAttributes(attrs);
            mp.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            mp.setDataSource(track.url);
            mp.setOnPreparedListener(player -> {
                if (gen != prepareGeneration || mediaPlayer != player) return;
                try {
                    player.start();
                    status = "playing";
                    updateMediaSessionAndNotification();
                    startProgressTicker();
                    emitState();
                } catch (Exception e) {
                    handlePlaybackError("تعذر بدء التشغيل الصوتي.");
                }
            });
            mp.setOnCompletionListener(player -> {
                if (gen != prepareGeneration || mediaPlayer != player) return;
                if (track.isLive) {
                    // Re-buffer live stream if stream chunk ended cleanly
                    startTrackAt(currentIndex);
                } else if (currentIndex + 1 < queue.size()) {
                    startTrackAt(currentIndex + 1);
                } else {
                    stopAllAndSelf();
                }
            });
            mp.setOnErrorListener((player, what, extra) -> {
                if (gen != prepareGeneration || mediaPlayer != player) return true;
                Logger.error("BackgroundAudioService", "MediaPlayer error what=" + what + " extra=" + extra, null);
                handlePlaybackError("تعذر تشغيل الصوت. تحقق من الاتصال بالإنترنت.");
                return true;
            });
            mp.setOnInfoListener((player, what, extra) -> {
                if (gen != prepareGeneration || mediaPlayer != player) return false;
                if (what == MediaPlayer.MEDIA_INFO_BUFFERING_START) {
                    status = "loading";
                    updateMediaSessionAndNotification();
                    emitState();
                } else if (what == MediaPlayer.MEDIA_INFO_BUFFERING_END && player.isPlaying()) {
                    status = "playing";
                    updateMediaSessionAndNotification();
                    emitState();
                }
                return false;
            });

            updateMediaSessionAndNotification();
            emitState();
            mp.prepareAsync();
        } catch (Exception ex) {
            Logger.error("BackgroundAudioService", "Failed preparing track " + track.url, ex);
            handlePlaybackError("تعذر تحميل المقطع الصوتي.");
        }
    }

    private void handlePlaybackError(String msg) {
        stopProgressTicker();
        releasePlayerOnly();
        releaseLocks();
        lastError = msg;
        status = "error";
        updateMediaSessionAndNotification();
        emitState();
    }

    private void pausePlayback() {
        stopProgressTicker();
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.pause();
                }
            } catch (Exception ignored) {}
        }
        if ("playing".equals(status) || "loading".equals(status)) {
            status = "paused";
        }
        releaseLocks();
        updateMediaSessionAndNotification();
        emitState();
    }

    private void resumePlayback() {
        if (queue.isEmpty() || currentIndex < 0 || currentIndex >= queue.size()) {
            stopAllAndSelf();
            return;
        }
        AudioTrackItem track = queue.get(currentIndex);
        if (mediaPlayer == null || track.isLive || "error".equals(status)) {
            // Re-open live streams or failed tracks cleanly from scratch
            startTrackAt(currentIndex);
            return;
        }
        if (!requestAudioFocus()) return;
        acquireLocks();
        registerNoisyReceiver();
        try {
            mediaPlayer.start();
            status = "playing";
            lastError = null;
            updateMediaSessionAndNotification();
            startProgressTicker();
            emitState();
        } catch (Exception ex) {
            startTrackAt(currentIndex);
        }
    }

    private void playNext() {
        if (queue.isEmpty()) return;
        if (currentIndex + 1 < queue.size()) {
            startTrackAt(currentIndex + 1);
        }
    }

    private void playPrevious() {
        if (queue.isEmpty()) return;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.getCurrentPosition() > 4000) {
                    mediaPlayer.seekTo(0);
                    emitState();
                    return;
                }
            } catch (Exception ignored) {}
        }
        if (currentIndex > 0) {
            startTrackAt(currentIndex - 1);
        }
    }

    private void seekToMs(int ms) {
        if (mediaPlayer == null) return;
        AudioTrackItem track = getCurrentTrack();
        if (track == null || track.isLive) return;
        try {
            mediaPlayer.seekTo(ms);
            updateMediaSessionAndNotification();
            emitState();
        } catch (Exception ignored) {}
    }

    private void stopAllAndSelf() {
        stopProgressTicker();
        prepareGeneration++;
        releasePlayerOnly();
        unregisterNoisyReceiver();
        abandonAudioFocus();
        releaseLocks();

        queue.clear();
        currentIndex = -1;
        currentCategory = null;
        status = "idle";
        lastError = null;
        resumeOnFocusGain = false;

        if (mediaSession != null) {
            try {
                PlaybackState pb = new PlaybackState.Builder()
                    .setState(PlaybackState.STATE_STOPPED, 0, 0f)
                    .build();
                mediaSession.setPlaybackState(pb);
            } catch (Exception ignored) {}
        }

        emitState();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private AudioTrackItem getCurrentTrack() {
        if (currentIndex >= 0 && currentIndex < queue.size()) {
            return queue.get(currentIndex);
        }
        return null;
    }

    private void startProgressTicker() {
        handler.removeCallbacks(progressTicker);
        AudioTrackItem track = getCurrentTrack();
        if (track != null && !track.isLive) {
            handler.postDelayed(progressTicker, 1000L);
        }
    }

    private void stopProgressTicker() {
        handler.removeCallbacks(progressTicker);
    }

    private void acquireLocks() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alrabbaniyoon:bg_audio");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) {
            try { wakeLock.acquire(MAX_WAKELOCK_MS); } catch (Exception ignored) {}
        }

        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                wifiLock = wm.createWifiLock(mode, "alrabbaniyoon:bg_audio_wifi");
                wifiLock.setReferenceCounted(false);
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) {
            try { wifiLock.acquire(); } catch (Exception ignored) {}
        }
    }

    private void releaseLocks() {
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        if (wifiLock != null && wifiLock.isHeld()) {
            try { wifiLock.release(); } catch (Exception ignored) {}
        }
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        }
        if (audioManager == null) return true;
        if (hasAudioFocus) return true;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener(focusChangeListener, handler)
                .build();
            hasAudioFocus = audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            @SuppressWarnings("deprecation")
            int res = audioManager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN
            );
            hasAudioFocus = res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return hasAudioFocus;
    }

    private void abandonAudioFocus() {
        if (audioManager == null || !hasAudioFocus) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
            @SuppressWarnings("deprecation")
            int ignored = audioManager.abandonAudioFocus(focusChangeListener);
        }
        hasAudioFocus = false;
        focusRequest = null;
    }

    private void registerNoisyReceiver() {
        if (noisyReceiverRegistered) return;
        IntentFilter filter = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        ContextCompat.registerReceiver(this, noisyReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        noisyReceiverRegistered = true;
    }

    private void unregisterNoisyReceiver() {
        if (!noisyReceiverRegistered) return;
        try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
        noisyReceiverRegistered = false;
    }

    private void releasePlayerOnly() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
            } catch (Exception ignored) {}
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(MEDIA_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            MEDIA_CHANNEL_ID,
            "التشغيل الصوتي في الخلفية",
            NotificationManager.IMPORTANCE_LOW
        );
        ch.setDescription("أدوات التحكم بتلاوة القرآن والأذكار والبث المباشر أثناء إغلاق الشاشة");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    private PendingIntent serviceActionPi(String action, int requestCode) {
        Intent intent = new Intent(this, BackgroundAudioService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void updateMediaSessionAndNotification() {
        AudioTrackItem track = getCurrentTrack();
        if (mediaSession != null && track != null) {
            long posMs = 0L;
            long durMs = 0L;
            if (!track.isLive && mediaPlayer != null) {
                try {
                    posMs = Math.max(0, mediaPlayer.getCurrentPosition());
                    int d = mediaPlayer.getDuration();
                    durMs = d > 0 ? d : 0L;
                } catch (Exception ignored) {}
            }

            MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, track.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, track.subtitle.isEmpty() ? categoryLabel(track.category) : track.subtitle)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "الربانيون");
            if (!track.isLive && durMs > 0) {
                metaBuilder.putLong(MediaMetadata.METADATA_KEY_DURATION, durMs);
            }
            if (appIconBitmap != null) {
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, appIconBitmap);
            }
            mediaSession.setMetadata(metaBuilder.build());

            int pbState;
            switch (status) {
                case "playing": pbState = PlaybackState.STATE_PLAYING; break;
                case "loading": pbState = PlaybackState.STATE_BUFFERING; break;
                case "paused": pbState = PlaybackState.STATE_PAUSED; break;
                case "error": pbState = PlaybackState.STATE_ERROR; break;
                default: pbState = PlaybackState.STATE_STOPPED; break;
            }
            long actions = PlaybackState.ACTION_PLAY
                | PlaybackState.ACTION_PAUSE
                | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_STOP;
            if (!track.isLive && queue.size() > 1) {
                actions |= PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            }
            if (!track.isLive && durMs > 0) {
                actions |= PlaybackState.ACTION_SEEK_TO;
            }
            PlaybackState.Builder pbBuilder = new PlaybackState.Builder()
                .setActions(actions)
                .setState(pbState, posMs, "playing".equals(status) ? 1.0f : 0f);
            if ("error".equals(status) && lastError != null) {
                pbBuilder.setErrorMessage(lastError);
            }
            mediaSession.setPlaybackState(pbBuilder.build());
        }

        if (!"idle".equals(status)) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(MEDIA_NOTIF_ID, buildMediaNotification());
            }
        }
    }

    private Notification buildMediaNotification() {
        AudioTrackItem track = getCurrentTrack();
        String title = track != null ? track.title : "الربانيون";
        String sub = track != null && !track.subtitle.isEmpty()
            ? track.subtitle
            : (track != null ? categoryLabel(track.category) : "التشغيل الصوتي في الخلفية");
        if ("loading".equals(status)) {
            sub = "جارٍ التحميل… • " + sub;
        } else if ("error".equals(status) && lastError != null) {
            sub = lastError;
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
            this,
            MEDIA_NOTIF_ID,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, MEDIA_CHANNEL_ID)
            : new Notification.Builder(this);

        builder
            .setSmallIcon(R.drawable.ic_stat_icon_config_sample)
            .setColor(Color.parseColor("#173F35"))
            .setContentTitle(title)
            .setContentText(sub)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing("playing".equals(status) || "loading".equals(status))
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPi)
            .setDeleteIntent(serviceActionPi(ACTION_STOP, MEDIA_NOTIF_ID + 5));

        if (appIconBitmap != null) {
            builder.setLargeIcon(appIconBitmap);
        }

        boolean isPlayingOrLoading = "playing".equals(status) || "loading".equals(status);
        boolean hasMulti = track != null && !track.isLive && queue.size() > 1;

        if (hasMulti) {
            builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                "السابق",
                serviceActionPi(ACTION_PREV, MEDIA_NOTIF_ID + 1)
            ).build());
        }

        builder.addAction(new Notification.Action.Builder(
            Icon.createWithResource(
                this,
                isPlayingOrLoading ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play
            ),
            isPlayingOrLoading ? "إيقاف مؤقت" : "تشغيل",
            serviceActionPi(ACTION_TOGGLE, MEDIA_NOTIF_ID + 2)
        ).build());

        if (hasMulti) {
            builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_next),
                "التالي",
                serviceActionPi(ACTION_NEXT, MEDIA_NOTIF_ID + 3)
            ).build());
        }

        builder.addAction(new Notification.Action.Builder(
            Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
            "إغلاق",
            serviceActionPi(ACTION_STOP, MEDIA_NOTIF_ID + 4)
        ).build());

        Notification.MediaStyle style = new Notification.MediaStyle();
        if (mediaSession != null) {
            style.setMediaSession(mediaSession.getSessionToken());
        }
        if (hasMulti) {
            style.setShowActionsInCompactView(0, 1, 2);
        } else {
            style.setShowActionsInCompactView(0, 1);
        }
        builder.setStyle(style);

        return builder.build();
    }

    private String categoryLabel(String cat) {
        if ("azkar".equals(cat)) return "أذكار المسلم";
        if ("haramain".equals(cat)) return "بث الحرمين المباشر";
        return "القرآن الكريم";
    }

    private void emitState() {
        JSONObject snapshot = new JSONObject();
        try {
            AudioTrackItem track = getCurrentTrack();
            double currentSec = 0;
            double durationSec = 0;
            if (track != null && !track.isLive && mediaPlayer != null) {
                try {
                    currentSec = Math.max(0, mediaPlayer.getCurrentPosition()) / 1000.0;
                    int d = mediaPlayer.getDuration();
                    durationSec = d > 0 ? d / 1000.0 : 0;
                } catch (Exception ignored) {}
            }
            snapshot.put("status", status);
            snapshot.put("category", currentCategory != null ? currentCategory : JSONObject.NULL);
            snapshot.put("currentIndex", currentIndex);
            snapshot.put("currentTrack", track != null ? track.toJson() : JSONObject.NULL);
            snapshot.put("currentTime", currentSec);
            snapshot.put("duration", durationSec);
            snapshot.put("error", lastError != null ? lastError : JSONObject.NULL);
            snapshot.put("queueLength", queue.size());
        } catch (JSONException ignored) {}

        lastSnapshot = snapshot;
        StateListener listener = stateListener;
        if (listener != null) {
            listener.onStateChanged(snapshot);
        }
    }

    @Override
    public void onDestroy() {
        stopProgressTicker();
        prepareGeneration++;
        releasePlayerOnly();
        unregisterNoisyReceiver();
        abandonAudioFocus();
        releaseLocks();
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {}
            mediaSession = null;
        }
        super.onDestroy();
    }
}
