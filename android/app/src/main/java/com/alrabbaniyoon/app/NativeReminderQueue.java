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
import java.util.Calendar;
import java.util.List;
import java.util.TimeZone;

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
    public static final String GENERAL_CHANNEL_ID = "al-rabbani-general-v2";
    static final long WINDOW_MS = 7L * 24 * 60 * 60 * 1000;
    static final int MAX_ARMED = 100;
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
        /** Wall-clock fields {year, month(1-12), day, hour, minute, second} in {@link #zone}; null for absolute-instant items. */
        public final int[] wall;
        public final String zone;
        Item(int id, long atMs, String title, String body, String channelId) {
            this(id, atMs, title, body, channelId, null, null);
        }
        Item(int id, long atMs, String title, String body, String channelId, int[] wall, String zone) {
            this.id = id; this.atMs = atMs; this.title = title; this.body = body; this.channelId = channelId;
            this.wall = wall; this.zone = zone;
        }
    }

    /**
     * Kinds that the JS builders plan from the device's local wall clock, so an app open after a time zone change moves them
     * with the clock. Verified against the real builders in src/notifications/tz-semantics.test.ts: review reminders are
     * wall-clock. Custom reminders keep their instant of day instead, and prayer items follow the prayer instant, so both
     * stay absolute. Task items mix local times with prayer-relative times and are not verified, so they stay absolute too.
     */
    static boolean followsWallClock(String kind) { return "review".equals(kind); }

    /** Pure: the local wall-clock fields of an instant in a zone. */
    static int[] wallOf(long atMs, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.setTimeInMillis(atMs);
        return new int[] { c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH),
            c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), c.get(Calendar.SECOND) };
    }

    /** Pure: the instant of wall-clock fields in a zone. A time skipped by DST moves forward; a repeated time resolves to one of its two valid instants (java.util.Calendar picks the standard-time one). */
    static long instantOf(int[] w, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz);
        c.clear();
        c.setLenient(true);
        c.set(w[0], w[1] - 1, w[2], w[3], w[4], w[5]);
        return c.getTimeInMillis();
    }

    /**
     * Pure: re-resolves wall-clock items to the zone the device is in now. Items without wall fields (older queues, prayer) keep their instant.
     * Adds, removes and reorders nothing: only the instants and the stored zone change, so cancelled or completed reminders cannot come back.
     */
    public static List<Item> reresolve(List<Item> items, TimeZone now) {
        List<Item> out = new ArrayList<>();
        String id = now.getID();
        for (Item it : items) {
            if (it.wall == null || it.zone == null || it.zone.equals(id)) { out.add(it); continue; }
            out.add(new Item(it.id, instantOf(it.wall, now), it.title, it.body, it.channelId, it.wall, id));
        }
        return out;
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
                int[] wall = null;
                JSONArray wa = o.optJSONArray("wall");
                if (wa != null && wa.length() == 6) {
                    wall = new int[6];
                    for (int k = 0; k < 6; k++) wall[k] = wa.optInt(k);
                }
                String zone = o.optString("zone", "");
                if (wall == null || zone.isEmpty()) { wall = null; zone = null; }
                out.add(new Item(o.optInt("id"), at, title, o.optString("body", ""), ch, wall, zone));
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

    // ---------- مدة الغفوة: تأتي مع كل حمولة من الواجهة، فزر «تأجيل» يطابق ما في الإعدادات ----------

    private static final String KEY_SNOOZE = "snooze_minutes";

    /** Pure: the snooze minutes the settings screen promises, kept inside the range the JS settings allow. */
    static int clampSnoozeMinutes(int minutes) {
        if (minutes < 1) return ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES;
        return Math.min(120, minutes);
    }

    /** Reads the snooze minutes from the first row that carries them and remembers them for later alerts. */
    static void storeSnoozeMinutes(Context c, String itemsJson) {
        try {
            if (itemsJson == null || itemsJson.isEmpty()) return;
            JSONArray a = new JSONArray(itemsJson);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null || !o.has("snoozeMinutes")) continue;
                int minutes = clampSnoozeMinutes(o.optInt("snoozeMinutes", ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES));
                prefs(c).edit().putInt(KEY_SNOOZE, minutes).apply();
                return;
            }
        } catch (Throwable ignored) {
            // A malformed payload must never break the queue refresh.
        }
    }

    /** The snooze delay written on the notification buttons and used when the user taps one. */
    static int snoozeMinutes(Context c) {
        try {
            return clampSnoozeMinutes(prefs(c).getInt(KEY_SNOOZE, ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES));
        } catch (Throwable t) {
            return ReminderActionReceiver.DEFAULT_SNOOZE_MINUTES;
        }
    }

    /** Pure: Latin digits as the Arabic-Indic digits the rest of the interface uses. */
    static String arabicDigits(int value) {
        String digits = String.valueOf(Math.max(0, value));
        StringBuilder out = new StringBuilder(digits.length());
        for (int i = 0; i < digits.length(); i++) {
            char ch = digits.charAt(i);
            out.append(ch >= '0' && ch <= '9' ? (char) ('\u0660' + (ch - '0')) : ch);
        }
        return out.toString();
    }

    /** Replaces the queue of one kind ("reminder","task","review","prayer"): cancels its armed alarms, stores, arms due ones. */
    public static synchronized int setQueue(Context c, String kind, String itemsJson) {
        try {
            storeSnoozeMinutes(c, itemsJson);
            cancelArmedOfKind(c, kind);
            List<Item> items = prune(parse(itemsJson), System.currentTimeMillis());
            TimeZone tz = TimeZone.getDefault();
            JSONArray stored = new JSONArray();
            for (Item it : items) {
                putStored(stored, withWall(it, kind, tz));
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

    /** Pure: stamps a wall-clock item with the local fields of its instant in the zone the app planned it in (the device zone). */
    static Item withWall(Item it, String kind, TimeZone tz) {
        if (!followsWallClock(kind) || it.wall != null) return it;
        return new Item(it.id, it.atMs, it.title, it.body, it.channelId, wallOf(it.atMs, tz), tz.getID());
    }

    private static void putStored(JSONArray stored, Item it) throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", it.id); o.put("at", it.atMs); o.put("title", it.title); o.put("body", it.body); o.put("channelId", it.channelId);
        if (it.wall != null && it.zone != null) {
            JSONArray w = new JSONArray();
            for (int v : it.wall) w.put(v);
            o.put("wall", w); o.put("zone", it.zone);
        }
        stored.put(o);
    }

    /** Re-resolves every stored wall-clock item (review kind only) to the device's current zone (time zone change, boot, daily top-up). Never throws. */
    static synchronized void reresolveStored(Context c) {
        try {
            TimeZone tz = TimeZone.getDefault();
            long now = System.currentTimeMillis();
            SharedPreferences.Editor e = prefs(c).edit();
            boolean changed = false;
            for (String kind : KINDS) {
                if (!followsWallClock(kind)) continue;
                List<Item> before = parse(prefs(c).getString(key(kind), null));
                List<Item> after = prune(reresolve(before, tz), now);
                boolean same = before.size() == after.size();
                for (int i = 0; same && i < before.size(); i++) same = before.get(i).atMs == after.get(i).atMs && java.util.Objects.equals(before.get(i).zone, after.get(i).zone);
                if (same) continue;
                JSONArray stored = new JSONArray();
                for (Item it : after) putStored(stored, it);
                if (stored.length() == 0) e.remove(key(kind)); else e.putString(key(kind), stored.toString());
                changed = true;
            }
            if (changed) e.commit();
        } catch (Throwable ignored) {}
    }

    public static synchronized void clearAll(Context c) {
        try {
            for (String k : KINDS) cancelArmedOfKind(c, k);
            SharedPreferences.Editor e = prefs(c).edit();
            for (String k : KINDS) e.remove(key(k));
            e.commit();
            NativeReminderRules.clear(c);
            refreshKeepAlive(c);
        } catch (Throwable ignored) {}
    }

    static final String[] KINDS = {"reminder", "task", "review", "prayer"};

    public static boolean hasItems(Context c) {
        try {
            long now = System.currentTimeMillis();
            for (String k : KINDS) if (!prune(parse(prefs(c).getString(key(k), null)), now).isEmpty()) return true;
        } catch (Throwable ignored) {}
        return NativeReminderRules.hasRules(c);
    }

    /**
     * Android allows 500 concurrent alarms per app (AOSP AlarmManagerService DEFAULT_MAX_ALARMS_PER_UID = 500; going over
     * throws IllegalStateException). Adhan alarms, Capacitor-registered notifications and the daily keep-alive count against
     * the same budget and always have priority. The queue may only use what is left under SHARED_BUDGET, which keeps
     * a margin of 50 alarms free for them. When nothing is left the queue arms nothing and waits for the next app open.
     */
    static final int SHARED_BUDGET = 450;

    /** Pure: how many queue alarms may be armed given the number of alarms other components already hold. */
    public static int allowed(int others) {
        if (others < 0) return 0;
        return Math.max(0, Math.min(MAX_ARMED, SHARED_BUDGET - others));
    }

    /** Alarms held by the adhan path and by Capacitor LocalNotifications. On any failure assume the budget is used up. */
    static int othersCount(Context c) {
        try {
            int n = NativeAdhanStore.loadStored(c).size();
            n += new com.capacitorjs.plugins.localnotifications.NotificationStorage(c).getSavedNotificationIds().size();
            return n + 2; // daily keep-alive and spare
        } catch (Throwable t) {
            return Integer.MAX_VALUE / 2;
        }
    }

    /**
     * Releases every armed queue alarm (the queue itself stays stored). Called BEFORE adhan alarms are added or restored,
     * so the queue can never hold slots that higher-priority alarms need during the transition; promote() re-arms afterwards.
     */
    public static synchronized void suspend(Context c) {
        try { for (String k : KINDS) cancelArmedOfKind(c, k); } catch (Throwable ignored) {}
    }

    /** Arms the earliest queued items due in the window across all kinds, within the shared budget. Never throws. */
    public static synchronized int promote(Context c) {
        return promote(c, othersCount(c));
    }

    static synchronized int promote(Context c, int others) {
        int armed = 0;
        reresolveStored(c);
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return 0;
            long now = System.currentTimeMillis();
            boolean exact = NativeAdhanStore.canScheduleExact(c);
            int budget = allowed(others);
            List<Item> chosen = new ArrayList<>();
            List<String> kinds = new ArrayList<>();
            for (String kind : KINDS) {
                for (Item it : due(prune(parse(prefs(c).getString(key(kind), null)), now), now, WINDOW_MS, MAX_ITEMS_PER_KIND)) {
                    chosen.add(it); kinds.add(kind);
                }
            }
            // daily/weekly rules: occurrences after the app's last planned one (separate class and preference file)
            java.util.Set<Integer> have = new java.util.HashSet<>();
            for (Item it : chosen) have.add(it.id);
            for (Item it : NativeReminderRules.dueItems(c, now, WINDOW_MS)) {
                if (have.add(it.id)) { chosen.add(it); kinds.add("reminder"); }
            }
            // earliest first across kinds; stable pairing of item and kind
            Integer[] order = new Integer[chosen.size()];
            for (int i = 0; i < order.length; i++) order[i] = i;
            java.util.Arrays.sort(order, (x, y) -> Long.compare(chosen.get(x).atMs, chosen.get(y).atMs));
            // cancel every armed alarm first so a smaller budget really frees slots, then re-arm the chosen ones
            for (String k : KINDS) cancelArmedOfKind(c, k);
            JSONArray record = new JSONArray();
            for (int idx : order) {
                if (armed >= budget) break;
                Item it = chosen.get(idx);
                try {
                    PendingIntent pi = pending(c, it, PendingIntent.FLAG_UPDATE_CURRENT);
                    try {
                        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, it.atMs, pi);
                        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, it.atMs, pi);
                    } catch (SecurityException se) {
                        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, it.atMs, pi);
                    }
                    JSONObject r = new JSONObject();
                    r.put("kind", kinds.get(idx)); r.put("id", it.id); r.put("at", it.atMs);
                    r.put("title", it.title); r.put("body", it.body); r.put("channelId", it.channelId);
                    record.put(r);
                    armed++;
                } catch (IllegalStateException limit) {
                    break; // the OS says the per-app alarm limit is reached: stop, keep the rest queued
                } catch (Throwable ignored) {}
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
            NotificationChannel ch = new NotificationChannel(channelId, "تنبيهات عامة", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("تذكيرات وتنبيهات عامة بصوت");
            ch.enableVibration(true);
            int toneRes = c.getResources().getIdentifier("reminder_tone", "raw", c.getPackageName());
            if (toneRes != 0) {
                ch.setSound(android.net.Uri.parse("android.resource://" + c.getPackageName() + "/raw/reminder_tone"),
                    new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            }
            ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }
    }

    /** Alarm fired: post the stored notification like LocalNotifications does, then top up the window. Never throws. */
    public static void onFire(Context c, int id, String title, String body, String channelId) {
        try {
            if (title == null || title.isEmpty()) return;
            String ch = channelId == null || channelId.isEmpty() || "al-rabbani-general".equals(channelId) ? GENERAL_CHANNEL_ID : channelId; // old queued items used the retired silent-prone channel
            ensureChannel(c, ch);
            post(c, id, ch, title, body == null ? "" : body);
        } catch (Throwable ignored) {
            // A notification failure must never crash the receiver.
        }
        try { promote(c); } catch (Throwable ignored) {}
    }

    /**
     * Same look and behaviour as the Capacitor LocalNotifications notification this replaces: default priority,
     * private lock-screen visibility, auto-cancel, alert once, the app's status icon and colour, and a tap that opens the app.
     * Sound and vibration come from the channel (Android 8+); the silent channel has neither.
     */
    static void post(Context c, int id, String channelId, String title, String body) {
        if (!androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()) return;
        boolean silent = SILENT_REMINDER_CHANNEL_ID.equals(channelId);
        Intent open = new Intent(c, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        androidx.core.app.NotificationCompat.Builder b = new androidx.core.app.NotificationCompat.Builder(c, channelId)
            .setSmallIcon(R.drawable.ic_stat_icon_config_sample)
            .setColor(android.graphics.Color.parseColor("#D4B678"))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH) // LocalNotifications 8.3.1: HIGH when foreground=true, which every payload sets
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentPi);
        if (silent) {
            b.setSilent(true);
        } else {
            android.net.Uri sound = null;
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O) {
                // API 24-25 have no channels: LocalNotifications plays the configured sound (capacitor.config: adhan_almulla).
                try {
                    if (c.getResources().getIdentifier(NativeAdhanStore.DEFAULT_ADHAN_RAW, "raw", c.getPackageName()) != 0) {
                        sound = android.net.Uri.parse("android.resource://" + c.getPackageName() + "/raw/" + NativeAdhanStore.DEFAULT_ADHAN_RAW);
                    }
                } catch (Throwable ignored) {}
            }
            if (sound != null) {
                b.setSound(sound);
                b.setDefaults(android.app.Notification.DEFAULT_VIBRATE | android.app.Notification.DEFAULT_LIGHTS);
            } else {
                b.setDefaults(android.app.Notification.DEFAULT_ALL);
            }
        }
        // أزرار الإيقاف والتأجيل: تُغلق الإشعار فورًا، وتعيد جدولة نفسه بعد عشر دقائق عند التأجيل.
        b.addAction(0, "إيقاف", ReminderActionReceiver.actionIntent(c, ReminderActionReceiver.ACTION_STOP, id, title, body, channelId, 0));
        int snooze = snoozeMinutes(c);
        b.addAction(0, "تأجيل " + arabicDigits(snooze) + " د", ReminderActionReceiver.actionIntent(c, ReminderActionReceiver.ACTION_SNOOZE, id, title, body, channelId, snooze));
        try {
            androidx.core.app.NotificationManagerCompat.from(c).notify(id, b.build());
            if (!silent) { rememberRinging(c, id); ScreenOffStopReceiver.arm(c); }
        } catch (SecurityException ignored) {}
    }

    /** Snooze alarms live in their own request-code space so they never overwrite a queued reminder. */
    static int snoozeRequestCode(int id) { return 0x5A000000 ^ id; }

    /**
     * Re-arms one notification after a Snooze tap. Uses the same receiver and extras as a queued
     * reminder, so the alert comes back even if the app is closed. The request code sits in its
     * own range ({@link #snoozeRequestCode(int)}), so a later refresh of the queue never cancels a
     * snooze and a snooze never cancels a queued reminder. Exact when the device allows it,
     * inexact otherwise, exactly like {@link #promote(Context)}.
     */
    public static void armSnoozed(Context c, int id, String title, String body, String channelId, int minutes) {
        long at = System.currentTimeMillis() + Math.max(1, minutes) * 60_000L;
        Intent i = new Intent(c, QueuedReminderReceiver.class).setAction(ACTION);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("body", body == null ? "" : body);
        i.putExtra("channelId", channelId == null || channelId.isEmpty() ? GENERAL_CHANNEL_ID : channelId);
        PendingIntent pi = PendingIntent.getBroadcast(
            c,
            snoozeRequestCode(id),
            i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            if (NativeAdhanStore.canScheduleExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException se) {
            // Exact alarms revoked between the check and the call: an inexact alarm still fires, just later.
            try {
                AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
                if (am != null) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (Throwable ignored) {}
        } catch (Throwable ignored) {
            // A failed snooze must never crash the receiver.
        }
    }

    /** Drops a pending snooze for one notification, so "Stop" really ends it instead of leaving it armed. */
    public static void cancelSnoozed(Context c, int id) {
        try {
            Intent i = new Intent(c, QueuedReminderReceiver.class).setAction(ACTION);
            PendingIntent pi = PendingIntent.getBroadcast(
                c,
                snoozeRequestCode(id),
                i,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pi == null) return;
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am != null) am.cancel(pi);
            pi.cancel();
        } catch (Throwable ignored) {
            // Cancelling must never crash the receiver.
        }
    }

    // ---------- ما يرنّ الآن: حتى يوقفه زر الإيقاف أو مفتاح الطاقة (شاشة تُطفأ) ----------

    /** Ids of alerts this app posted in the last few minutes, i.e. ones whose sound may still be playing. */
    private static final String KEY_RINGING = "ringing";
    static final long RINGING_TTL_MS = 3L * 60 * 1000;

    private static JSONObject ringingMap(Context c) {
        try {
            String raw = prefs(c).getString(KEY_RINGING, null);
            if (raw == null || raw.isEmpty()) return new JSONObject();
            return new JSONObject(raw);
        } catch (Throwable t) {
            return new JSONObject();
        }
    }

    static void rememberRinging(Context c, int id) {
        try {
            JSONObject map = ringingMap(c);
            map.put(String.valueOf(id), System.currentTimeMillis());
            prefs(c).edit().putString(KEY_RINGING, map.toString()).apply();
        } catch (Throwable ignored) {
            // Bookkeeping must never crash the notifier.
        }
    }

    static void forgetRinging(Context c, int id) {
        try {
            JSONObject map = ringingMap(c);
            map.remove(String.valueOf(id));
            prefs(c).edit().putString(KEY_RINGING, map.toString()).apply();
        } catch (Throwable ignored) {}
    }

    /**
     * Silences whatever this app may still be ringing: the screen-off / power-key case. Cancelling the
     * notification is what stops a channel sound, and any snooze armed for the same id goes with it.
     * Only ids posted in the last {@link #RINGING_TTL_MS} are touched, so older notifications in the
     * shade are left alone.
     */
    public static synchronized void stopRinging(Context c) {
        JSONObject map = ringingMap(c);
        long now = System.currentTimeMillis();
        List<String> keys = new ArrayList<>();
        for (java.util.Iterator<String> it = map.keys(); it.hasNext(); ) keys.add(it.next());
        for (String key : keys) {
            long postedAt = map.optLong(key, 0L);
            if (now - postedAt > RINGING_TTL_MS) {
                map.remove(key);
                continue;
            }
            int id;
            try {
                id = Integer.parseInt(key);
            } catch (NumberFormatException bad) {
                map.remove(key);
                continue;
            }
            try {
                androidx.core.app.NotificationManagerCompat.from(c).cancel(id);
            } catch (Throwable ignored) {}
            cancelSnoozed(c, id);
            map.remove(key);
        }
        try {
            prefs(c).edit().putString(KEY_RINGING, map.toString()).apply();
        } catch (Throwable ignored) {}
    }
}
