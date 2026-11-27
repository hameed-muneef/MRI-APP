package com.alrabbaniyoon.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Logger;

/**
 * وضع المنبه: تشغيل صوت التذكير في حلقة لستين ثانية مع إشعار «إيقاف» و«تأجيل».
 *
 * Modelled on {@link AdhanPlaybackService}: bounded media-playback foreground service, audio focus with
 * {@link AudioAttributes#USAGE_ALARM}, a partial wake lock, the same power-key rule through
 * {@link ScreenKeyStopPolicy}, and it always terminates by itself. It stops on Stop, on Snooze, on the screen key,
 * on a swipe of the notification (where the platform allows it) and when the ringing record expires.
 * No full-screen intent and no permission beyond the ones the app already holds.
 */
public class ReminderAlarmService extends Service {

    public static final String ACTION_START = "com.alrabbaniyoon.app.action.START_REMINDER_ALARM";
    public static final String ACTION_STOP = "com.alrabbaniyoon.app.action.STOP_REMINDER_ALARM";

    private static volatile boolean ringing = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable watchdogStop = this::stopAlarm;

    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private boolean hasAudioFocus = false;
    private boolean screenReceiverRegistered = false;
    private boolean startedInteractive = true;
    private long startedAt = 0L;

    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent != null ? intent.getAction() : null;
            long elapsed = SystemClock.elapsedRealtime() - startedAt;
            if (!ReminderAlarmPolicy.isWithinTtl(elapsed)) {
                unregisterScreenReceiver();
                return;
            }
            if (ReminderAlarmPolicy.stopOnScreenEvent(action, startedInteractive, elapsed)) {
                stopAlarm();
            }
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = focusChange -> {
        if (focusChange == AudioManager.AUDIOFOCUS_LOSS || focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            stopAlarm();
        }
    };

    public static boolean isRinging() {
        return ringing;
    }

    /** Starts the alarm for one reminder row. Returns false when the platform refuses, so the caller can fall back. */
    public static boolean start(Context context, int notificationId, String title, String body, int snoozeMinutes) {
        try {
            Intent intent = new Intent(context, ReminderAlarmService.class);
            intent.setAction(ACTION_START);
            intent.putExtra(ReminderActionReceiver.EXTRA_ID, notificationId);
            intent.putExtra(ReminderActionReceiver.EXTRA_TITLE, title == null ? "" : title);
            intent.putExtra(ReminderActionReceiver.EXTRA_BODY, body == null ? "" : body);
            intent.putExtra(ReminderActionReceiver.EXTRA_SNOOZE_MINUTES, snoozeMinutes);
            ContextCompat.startForegroundService(context, intent);
            return true;
        } catch (Throwable t) {
            Logger.error("ReminderAlarmService", "Could not start the alarm service", null);
            return false;
        }
    }

    /** Stops whatever alarm is ringing. Safe to call from a receiver, and safe when nothing is ringing. */
    public static void stop(Context context) {
        try {
            if (context == null) return;
            context.stopService(new Intent(context, ReminderAlarmService.class));
        } catch (Throwable ignored) {
            // Stopping must never crash the caller.
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action) || intent == null) {
            stopAlarm();
            return START_NOT_STICKY;
        }

        int id = intent.getIntExtra(ReminderActionReceiver.EXTRA_ID, 0);
        String title = intent.getStringExtra(ReminderActionReceiver.EXTRA_TITLE);
        if (title == null || title.isEmpty()) title = "تذكير";
        String body = intent.getStringExtra(ReminderActionReceiver.EXTRA_BODY);
        if (body == null) body = "";
        int snoozeMinutes = intent.getIntExtra(ReminderActionReceiver.EXTRA_SNOOZE_MINUTES, ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES);

        // Must enter foreground before anything else on API 26+/34+, exactly like the adhan service.
        NativeReminderQueue.ensureChannel(this, ReminderAlarmPolicy.CHANNEL_ID);
        Notification notification = buildAlarmNotification(id, title, body, snoozeMinutes);
        int fgsType = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            : 0;
        try {
            ServiceCompat.startForeground(this, id, notification, fgsType);
        } catch (Throwable t) {
            Logger.error("ReminderAlarmService", "startForeground refused", null);
            stopAlarm();
            return START_NOT_STICKY;
        }

        startRinging();
        return START_NOT_STICKY;
    }

    private Notification buildAlarmNotification(int id, String title, String body, int snoozeMinutes) {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(
            this, id, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent stopIntent = new Intent(this, ReminderAlarmService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent deletePi = PendingIntent.getService(
            this, id, stopIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, ReminderAlarmPolicy.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_icon_config_sample)
            .setColor(Color.parseColor("#D4B678"))
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setContentIntent(contentPi)
            .setDeleteIntent(deletePi);
        builder.addAction(0, "إيقاف", ReminderActionReceiver.actionIntent(
            this, ReminderActionReceiver.ACTION_STOP, id, title, body, ReminderAlarmPolicy.CHANNEL_ID, 0));
        builder.addAction(0, "تأجيل " + NativeReminderQueue.arabicDigits(snoozeMinutes) + " د", ReminderActionReceiver.actionIntent(
            this, ReminderActionReceiver.ACTION_SNOOZE, id, title, body, ReminderAlarmPolicy.CHANNEL_ID, snoozeMinutes));
        return builder.build();
    }

    private void startRinging() {
        releasePlayerAndLocks();
        int resId = getResources().getIdentifier(ReminderAlarmPolicy.RAW_SOUND, "raw", getPackageName());
        if (resId == 0) {
            Logger.warn("ReminderAlarmService", "No bundled alarm tone; the channel notification is all that rings.");
            handler.postDelayed(watchdogStop, ReminderAlarmPolicy.ringDurationMs());
            return;
        }
        acquireWakeLock();
        requestAudioFocus();
        registerScreenReceiver();

        handler.removeCallbacks(watchdogStop);
        handler.postDelayed(watchdogStop, ReminderAlarmPolicy.ringDurationMs());

        Uri uri = Uri.parse("android.resource://" + getPackageName() + "/raw/" + ReminderAlarmPolicy.RAW_SOUND);
        MediaPlayer player = new MediaPlayer();
        mediaPlayer = player;
        ringing = true;
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            player.setAudioAttributes(attrs);
            player.setVolume(1.0f, 1.0f);
            player.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
            player.setLooping(ReminderAlarmPolicy.loopsSound(true));
            player.setDataSource(getApplicationContext(), uri);
            player.setOnErrorListener((mp, what, extra) -> {
                Logger.error("ReminderAlarmService", "MediaPlayer error what=" + what + " extra=" + extra, null);
                stopAlarm();
                return true;
            });
            player.prepare();
            player.start();
        } catch (Exception ex) {
            Logger.error("ReminderAlarmService", "Failed starting the alarm tone", ex);
            stopAlarm();
        }
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "alrabbaniyoon:reminder_alarm");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(ReminderAlarmPolicy.ringDurationMs() + 5_000L);
    }

    private void requestAudioFocus() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener(focusChangeListener, handler)
                .build();
            hasAudioFocus = audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            @SuppressWarnings("deprecation")
            int res = audioManager.requestAudioFocus(
                focusChangeListener, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            hasAudioFocus = res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
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

    private void registerScreenReceiver() {
        if (screenReceiverRegistered) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        startedInteractive = pm == null || pm.isInteractive();
        startedAt = SystemClock.elapsedRealtime();
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(Intent.ACTION_SCREEN_ON);
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
        screenReceiverRegistered = true;
    }

    private void unregisterScreenReceiver() {
        if (!screenReceiverRegistered) return;
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        screenReceiverRegistered = false;
    }

    private void releasePlayerAndLocks() {
        handler.removeCallbacks(watchdogStop);
        ringing = false;
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
            } catch (Exception ignored) {}
            try { mediaPlayer.release(); } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        unregisterScreenReceiver();
        abandonAudioFocus();
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception ignored) {}
        }
        wakeLock = null;
    }

    private void stopAlarm() {
        releasePlayerAndLocks();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        releasePlayerAndLocks();
        super.onDestroy();
    }
}
