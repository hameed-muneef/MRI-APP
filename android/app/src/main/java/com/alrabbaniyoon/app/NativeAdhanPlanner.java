package com.alrabbaniyoon.app;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.TimeZone;

/**
 * Pure (no Android APIs) planner that rebuilds the main Adhan alarms natively from a persisted spec.
 * It mirrors buildNativeAdhanAlarmInputs / computePrayerSchedule in the JS scheduler: same local-date
 * walk, same per-prayer minute adjustment applied after the calculation, same quiet-hours rule,
 * same alarm id (FNV hash of "date|prayer") and same title/body text.
 * Returns null (never partial output) when the spec is missing, malformed, of another version or unsupported.
 */
public final class NativeAdhanPlanner {
    private NativeAdhanPlanner() {}

    public static final int SPEC_VERSION = 1;
    public static final int MAX_ALARMS = 350;
    public static final String[] KEYS = {"Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"};

    public static final class Planned {
        public final int id;
        public final long triggerAtMs;
        public final String title;
        public final String body;
        public final String rawSound;
        public final String soundTitle;
        public final String adhanType;
        public final String prayerKey;

        Planned(int id, long t, String title, String body, String raw, String soundTitle, String type, String key) {
            this.id = id; this.triggerAtMs = t; this.title = title; this.body = body;
            this.rawSound = raw; this.soundTitle = soundTitle; this.adhanType = type; this.prayerKey = key;
        }
    }

    /** Same hash as prayerId() in src/lib/prayer-schedule.ts (32-bit FNV-1a, then abs % 2147483646 + 1). */
    public static int prayerId(String date, String prayer) {
        int hash = (int) 2166136261L;
        String s = date + "|" + prayer;
        for (int i = 0; i < s.length(); i++) {
            hash ^= s.charAt(i);
            hash *= 16777619;
        }
        return (int) ((Math.abs((long) hash) % 2147483646L) + 1);
    }

    /** Returns null when the spec cannot be trusted; the caller then leaves existing alarms untouched. */
    public static String validate(JSONObject spec) {
        if (spec == null) return "missing";
        if (spec.optInt("v", -1) != SPEC_VERSION) return "version";
        double lat = spec.optDouble("lat", Double.NaN), lon = spec.optDouble("lon", Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return "invalid_location";
        if (!PrayerTimesCalculator.isSupportedMethod(spec.optString("method", ""))) return "unsupported_method";
        JSONObject prayers = spec.optJSONObject("prayers");
        JSONObject adjust = spec.optJSONObject("adjust");
        if (prayers == null || adjust == null) return "invalid_prayers";
        for (String k : KEYS) {
            JSONObject p = prayers.optJSONObject(k);
            if (p == null || p.optString("nameAr", "").isEmpty() || !p.has("enabled")) return "invalid_prayers";
            String type = p.optString("type", "full");
            if (!type.equals("full") && !type.equals("short") && !type.equals("silent")) return "invalid_prayers";
            double a = adjust.optDouble(k, 0);
            if (Double.isNaN(a) || Math.abs(a) > 180) return "invalid_adjustment";
        }
        JSONObject q = spec.optJSONObject("quiet");
        if (q != null && q.optBoolean("enabled", false)) {
            if (!q.optString("start", "").matches("\\d\\d:\\d\\d") || !q.optString("end", "").matches("\\d\\d:\\d\\d")) return "invalid_quiet";
        }
        return null;
    }

    private static String two(int n) { return n < 10 ? "0" + n : String.valueOf(n); }

    private static boolean quiet(JSONObject q, String hhmm) {
        if (q == null || !q.optBoolean("enabled", false)) return false;
        String s = q.optString("start"), e = q.optString("end");
        if (s.compareTo(e) <= 0) return hhmm.compareTo(s) >= 0 && hhmm.compareTo(e) <= 0;
        return hhmm.compareTo(s) >= 0 || hhmm.compareTo(e) <= 0;
    }

    /** @return planned alarms (sorted, capped), or null if the spec is not valid/supported. */
    public static List<Planned> plan(JSONObject spec, long nowMs, TimeZone tz, int days) {
        if (validate(spec) != null) return null;
        int horizon = Math.max(7, Math.min(30, days));
        double lat = spec.optDouble("lat"), lon = spec.optDouble("lon");
        String method = spec.optString("method");
        boolean hanafi = spec.optBoolean("hanafi", false);
        JSONObject prayers = spec.optJSONObject("prayers");
        JSONObject adjust = spec.optJSONObject("adjust");
        JSONObject q = spec.optJSONObject("quiet");

        Calendar day = Calendar.getInstance(tz);
        day.setTimeInMillis(nowMs);
        day.set(Calendar.HOUR_OF_DAY, 0); day.set(Calendar.MINUTE, 0); day.set(Calendar.SECOND, 0); day.set(Calendar.MILLISECOND, 0);
        int y = day.get(Calendar.YEAR), m = day.get(Calendar.MONTH) + 1, d = day.get(Calendar.DAY_OF_MONTH);
        Calendar cur = Calendar.getInstance(tz);
        List<Planned> out = new ArrayList<>();
        for (int i = 0; i < horizon; i++) {
            double[] t = PrayerTimesCalculator.compute(lat, lon, method, hanafi, y, m, d);
            for (int k = 0; k < KEYS.length; k++) {
                if (Double.isNaN(t[k])) continue;
                JSONObject p = prayers.optJSONObject(KEYS[k]);
                String type = p.optString("type", "full");
                if (!p.optBoolean("enabled", false)) continue;
                long at = (long) t[k] + Math.round(adjust.optDouble(KEYS[k], 0)) * 60000L;
                if (at <= nowMs + 1000) continue;
                cur.setTimeInMillis(at);
                String ymd = cur.get(Calendar.YEAR) + "-" + two(cur.get(Calendar.MONTH) + 1) + "-" + two(cur.get(Calendar.DAY_OF_MONTH));
                String hhmm = two(cur.get(Calendar.HOUR_OF_DAY)) + ":" + two(cur.get(Calendar.MINUTE));
                if (quiet(q, hhmm)) continue;
                String name = p.optString("nameAr");
                String sound = p.optString("sound", "");
                out.add(new Planned(prayerId(ymd, KEYS[k]), at, "حان وقت صلاة " + name,
                    type.equals("silent") ? "وقت " + name + ": " + hhmm : "وقت " + name + ": " + hhmm + " · " + sound, p.optString("raw", "adhan_almulla"), sound,
                    type.equals("short") ? "short" : type.equals("silent") ? "silent" : "full", ymd + ":" + KEYS[k]));
            }
            // next local civil day (read fields only, like JS setDate)
            day.add(Calendar.DAY_OF_MONTH, 1);
            y = day.get(Calendar.YEAR); m = day.get(Calendar.MONTH) + 1; d = day.get(Calendar.DAY_OF_MONTH);
        }
        Collections.sort(out, new Comparator<Planned>() {
            @Override public int compare(Planned a, Planned b) { return Long.compare(a.triggerAtMs, b.triggerAtMs); }
        });
        return out.size() > MAX_ALARMS ? new ArrayList<>(out.subList(0, MAX_ALARMS)) : out;
    }

    /** Alarm ids to add: planned alarms whose id is not already scheduled, bounded by the total cap. */
    public static List<Planned> missing(List<Planned> planned, java.util.Set<Integer> existingIds) {
        List<Planned> add = new ArrayList<>();
        int room = MAX_ALARMS - existingIds.size();
        for (Planned p : planned) {
            if (room <= 0) break;
            if (existingIds.contains(p.id)) continue;
            add.add(p);
            room--;
        }
        return add;
    }
}
