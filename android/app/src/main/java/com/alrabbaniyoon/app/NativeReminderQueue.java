package com.alrabbaniyoon.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Device-level renewal for reminders that the app computes beyond its normal scheduling window
 * (custom reminders, task reminders, review reminders, far prayer before/after reminders).
 *
 * JS builds the exact same payloads it already schedules (same builders, same settings, same text) over a longer
 * window and stores only the part that is NOT already registered with LocalNotifications. This class keeps that
 * queue per kind and, on every refresh (daily keep-alive, boot, time/zone change, app update, an earlier queued
 * alarm firing, or the app), arms an AlarmManager alarm for every queued item due in the next WINDOW_MS.
 * Content is never recomputed here, so there is nothing to drift from the TypeScript builders.
 *
 * Limits: queue contents are only refreshed when the app is opened (that is when settings or data can change);
 * a force-stop or OEM kill stops all alarms until the next app open or boot event.
 * Never cancels alarms registered by LocalNotifications or by the adhan path.
 */
public final class NativeReminderQueue {
    private NativeReminderQueue() {}

    public static final String ACTION = "com.alrabbaniyoon.app.ACTION_QUEUED_REMINDER";
    public static final String SILENT_REMINDER_CHANNEL_ID = "al-rabbani-reminder-silent-v1";
    public static final String GENERAL_CHANNEL_ID = "al-rabbani-general";
    static final long WINDOW_MS = 7L * 24 * 60 * 60 * 1000;
    static final int MAX_ARMED = 150;
    static final int MAX_ITEMS_PER_KIND = 400;
    private static final String PREFS = "RABBANI_NATIVE_REMINDER_QUEUE_V1";
    private static final String KEY_ARMED = "armed";

    /** One queued reminder. */
    public static final class Item {
        public final int id;
        public final long atMs;
        public final String title;
        public final String body;
        public final String channelId;
        Item(int id, long atMs, String title, String body, String channelId) {
            this.id = id; this.atMs = atMs; this.title = title; this.body = body; this.channelId = channelId;
        }
    }

    /** Pure: parse a JSON array of items, dropping malformed rows. Never throws. */
    public static List<Item> parse(String json) {
        List<Item> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length() && out.size() < MAX_ITEMS_PER_KIND; i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                long at = o.optLong("at", 0);
                String title = o.optString("title", "");
                if (at <= 0 || title.isEmpty() || !o.has("id")) continue;
                String ch = o.optString("channelId", GENERAL_CHANNEL_ID);
                if (ch.isEmpty()) ch = GENERAL_CHANNEL_ID;
                out.add(new Item(o.optInt("id"), at, title, o.optString("body", ""), ch));
            }
        } catch (JSONException ignored) {}
        return out;
    }

    /** Pure: items due strictly after now+1s and no later than now+WINDOW_MS, earliest first, at most max. */
    public static List<Item> due(List<Item> items, long nowMs, long windowMs, int max) {
        List<Item> out = new ArrayList<>();
        for (Item it : items) if (it.atMs > nowMs + 1000 && it.atMs <= nowMs + windowMs) out.add(it);
        out.sort((x, y) -> Long.compare(x.atMs, y.atMs));
        return out.size() > max ? new ArrayList<>(out.subList(0, max)) : out;
    }

    /** Pure: drops items already in the past so storage does not grow. */
    public static List<Item> prune(List<Item> items, long nowMs) {
        List<Item> out = new ArrayList<>();
        for (Item it : items) if (it.atMs > nowMs) out.add(it);
        return out;
    }

    private static String key(String kind) { return "q_" + kind; }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static PendingIntent pending(Context c, Item it, int flags) {
        Intent i = new Intent(c, QueuedReminderReceiver.class).setAction(ACTION);
        i.putExtra("id", it.id);
        i.putExtra("title", it.title);
        i.putExtra("body", it.body);
        i.putExtra("channelId", it.channelId);
        return PendingIntent.getBroadcast(c, requestCode(it.id), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Distinct from the ids LocalNotifications/adhan use for the same payload id space. */
    static int requestCode(int id) { return 0x51000000 ^ id; }

    /** Replaces the queue of one kind ("reminder","task","review","prayer"): cancels its armed alarms, stores, arms due ones. */
    public static synchronized int setQueue(Context c, String kind, String itemsJson) {
        try {
            cancelArmedOfKind(c, kind);
            List<Item> items = prune(parse(itemsJson), System.currentTimeMillis());
            JSONArray stored = new JSONArray();
            for (Item it : items) {
                JSONObject o = new JSONObject();
                o.put("id", it.id); o.put("at", it.atMs); o.put("title", it.title); o.put("body", it.body); o.put("channelId", it.channelId);
                stored.put(o);
            }
            SharedPreferences.Editor e = prefs(c).edit();
            if (stored.length() == 0) e.remove(key(kind)); else e.putString(key(kind), stored.toString());
            e.commit();
            int armed = promote(c);
            refreshKeepAlive(c);
            return armed;
        } catch (Throwable t) {
            return 0;
        }
    }

    public static synchronized void clearAll(Context c) {
        try {
            for (String k : KINDS) cancelArmedOfKind(c, k);
            SharedPreferences.Editor e = prefs(c).edit();
            for (String k : KINDS) e.remove(key(k));
            e.commit();
            refreshKeepAlive(c);
        } catch (Throwable ignored) {}
    }

    static final String[] KINDS = {"reminder", "task", "review", "prayer"};

    public static boolean hasItems(Context c) {
        try {
            long now = System.currentTimeMillis();
            for (String k : KINDS) if (!prune(parse(prefs(c).getString(key(k), null)), now).isEmpty()) return true;
        } catch (Throwable ignored) {}
        return false;
    }

    /** Arms every queued item due in the window. Idempotent (same request code replaces). Never throws. */
    public static synchronized int promote(Context c) {
        int armed = 0;
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return 0;
            long now = System.currentTimeMillis();
            boolean exact = NativeAdhanStore.canScheduleExact(c);
            JSONArray record = new JSONArray();
            int budget = MAX_ARMED;
            for (String kind : KINDS) {
                List<Item> all = prune(parse(prefs(c).getString(key(kind), null)), now);
                for (Item it : due(all, now, WINDOW_MS, budget)) {
                    try {
                        PendingIntent pi = pending(c, it, PendingIntent.FLAG_UPDATE_CURRENT);
                        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, it.atMs, pi);
                        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, it.atMs, pi);
                        JSONObject r = new JSONObject();
                        r.put("kind", kind); r.put("id", it.id); r.put("at", it.atMs);
                        r.put("title", it.title); r.put("body", it.body); r.put("channelId", it.channelId);
                        record.put(r);
                        armed++; budget--;
                    } catch (Throwable ignored) {}
                    if (budget <= 0) break;
                }
                if (budget <= 0) break;
            }
            prefs(c).edit().putString(KEY_ARMED, record.toString()).commit();
        } catch (Throwable ignored) {}
        return armed;
    }

    private static void cancelArmedOfKind(Context c, String kind) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            JSONArray rec = new JSONArray(prefs(c).getString(KEY_ARMED, "[]"));
            JSONArray keep = new JSONArray();
            for (int i = 0; i < rec.length(); i++) {
                JSONObject r = rec.getJSONObject(i);
                if (kind.equals(r.optString("kind"))) {
                    Item it = new Item(r.optInt("id"), r.optLong("at"), r.optString("title"), r.optString("body"), r.optString("channelId", GENERAL_CHANNEL_ID));
                    PendingIntent pi = pending(c, it, PendingIntent.FLAG_NO_CREATE);
                    if (am != null && pi != null) { am.cancel(pi); pi.cancel(); }
                } else keep.put(r);
            }
            prefs(c).edit().putString(KEY_ARMED, keep.toString()).commit();
        } catch (Throwable ignored) {}
    }

    /** Keeps the daily keep-alive armed while there is anything to renew; the adhan path arms it too. */
    static void refreshKeepAlive(Context c) {
        if (hasItems(c)) NativeAdhanKeepAlive.schedule(c);
    }

    static void ensureChannel(Context c, String channelId) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(channelId) != null) return;
        if (SILENT_REMINDER_CHANNEL_ID.equals(channelId)) {
            NotificationChannel ch = new NotificationChannel(channelId, "تذكيرات الصلاة بدون صوت", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("تذكيرات قبل وبعد الصلاة الصامتة بدون صوت أو اهتزاز");
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        } else if (GENERAL_CHANNEL_ID.equals(channelId)) {
            NotificationChannel ch = new NotificationChannel(channelId, "تنبيهات عامة", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("تذكيرات وتنبيهات عامة");
            ch.enableVibration(true);
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
    }

    /** Alarm fired: post the stored notification, then top up the window. A failure here never throws. */
    public static void onFire(Context c, int id, String title, String body, String channelId) {
        try {
            if (title == null || title.isEmpty()) return;
            String ch = channelId == null || channelId.isEmpty() ? GENERAL_CHANNEL_ID : channelId;
            ensureChannel(c, ch);
            AdhanAlarmReceiver.postChannelNotification(c, id, ch, title, body == null ? "" : body, SILENT_REMINDER_CHANNEL_ID.equals(ch));
        } catch (Throwable ignored) {
            // A notification failure must never crash the receiver.
        }
        try { promote(c); } catch (Throwable ignored) {}
    }
}
