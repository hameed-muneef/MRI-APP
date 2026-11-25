package com.alrabbaniyoon.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Device-side renewal of daily and weekly custom reminders past the window the app planned.
 *
 * The app publishes a rule per reminder (see src/notifications/native-recurrence-rules.ts) together with a frontier: the last
 * occurrence it already planned. The device generates only occurrences strictly after the frontier (and after now), inside the
 * promote window, so nothing the app planned is duplicated, and it does this on every top-up (daily keep-alive, boot, time or
 * zone change, a queued alarm firing). The expansion is a port of nextDueDate in scheduler.ts for exactly these two kinds and
 * keeps its quirks: the wall time is the base instant read in the CURRENT zone, and the weekly weekday is the base instant's
 * weekday in the current zone. Quiet hours skip an occurrence (never shift it). Verified against the real JS builders by
 * recurrence-parity.jsonl (scripts/gen-recurrence-parity.cjs).
 *
 * Limits: rule content (times, text, quiet hours, switches) is only refreshed when the app is opened, like the rest of the queue.
 * The expansion is rolling (it is not a fixed count) and stops at the end date; a force-stop or OEM kill stops it like every alarm.
 * Separate preference file, separate class: removing this class leaves the older queue behaviour unchanged.
 */
public final class NativeReminderRules {
    private NativeReminderRules() {}

    private static final String PREFS = "RABBANI_NATIVE_REMINDER_RULES_V1";
    private static final String KEY = "rules";
    static final int MAX_RULES = 100;

    public static final class Rule {
        String rid, title, body, channelId, kind, start, end, quietStart, quietEnd;
        boolean quietOn;
        long baseMs, snoozeMs, frontierMs;
    }

    /** Pure: parse the rules JSON, dropping malformed rows. Never throws. */
    public static List<Rule> parse(String json) {
        List<Rule> out = new ArrayList<>();
        if (json == null || json.isEmpty()) return out;
        try {
            JSONArray a = new JSONArray(json);
            for (int i = 0; i < a.length() && out.size() < MAX_RULES; i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                String kind = o.optString("kind", "");
                String rid = o.optString("rid", "");
                String title = o.optString("title", "");
                long base = o.optLong("baseMs", 0);
                if (rid.isEmpty() || title.isEmpty() || base <= 0 || !("daily".equals(kind) || "weekly".equals(kind))) continue;
                Rule r = new Rule();
                r.rid = rid; r.title = title; r.kind = kind; r.baseMs = base;
                r.body = o.optString("body", "");
                r.channelId = o.optString("channelId", NativeReminderQueue.GENERAL_CHANNEL_ID);
                if (r.channelId.isEmpty()) r.channelId = NativeReminderQueue.GENERAL_CHANNEL_ID;
                r.start = o.isNull("start") ? null : o.optString("start", null);
                r.end = o.isNull("end") ? null : o.optString("end", null);
                if (r.start != null && parseYmd(r.start) == null) continue;
                if (r.end != null && parseYmd(r.end) == null) r.end = null;
                r.quietOn = o.optBoolean("quietOn", false);
                r.quietStart = o.optString("quietStart", "");
                r.quietEnd = o.optString("quietEnd", "");
                r.snoozeMs = o.optLong("snoozeMs", 0);
                r.frontierMs = o.optLong("frontierMs", 0);
                out.add(r);
            }
        } catch (Throwable ignored) {}
        return out;
    }

    private static int[] parseYmd(String s) {
        if (s == null || !s.matches("\\d{4}-\\d{2}-\\d{2}")) return null;
        return new int[] { Integer.parseInt(s.substring(0, 4)), Integer.parseInt(s.substring(5, 7)), Integer.parseInt(s.substring(8, 10)) };
    }

    // ---- JS Date emulation in a zone (local getters/setters with lenient overflow and JS DST rules) ----

    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");

    /** Wall fields {year, month0, day, hour, minute, second, ms, dayOfWeek0} of an instant in tz. */
    static int[] fields(long ms, TimeZone tz) {
        Calendar c = Calendar.getInstance(tz, Locale.US);
        c.setTimeInMillis(ms);
        return new int[] { c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.HOUR_OF_DAY),
            c.get(Calendar.MINUTE), c.get(Calendar.SECOND), c.get(Calendar.MILLISECOND), c.get(Calendar.DAY_OF_WEEK) - 1 };
    }

    private static long wallAsUtc(int y, int mo, int d, int h, int mi, int s, int ms) {
        Calendar u = Calendar.getInstance(UTC, Locale.US);
        u.clear();
        u.setLenient(true);
        u.set(y, mo, d, h, mi, s);
        u.set(Calendar.MILLISECOND, ms);
        return u.getTimeInMillis();
    }

    /**
     * new Date(y, mo, d, h, mi, s, ms) in tz: fields may overflow. A skipped local time moves forward by the gap; a repeated local time
     * resolves to the first (earlier) instant, as JavaScript does.
     */
    static long instantOf(int y, int mo, int d, int h, int mi, int s, int ms, TimeZone tz) {
        long wall = wallAsUtc(y, mo, d, h, mi, s, ms);
        long day = 86400000L;
        int oBefore = tz.getOffset(wall - day), oAfter = tz.getOffset(wall + day);
        long c1 = wall - oBefore, c2 = wall - oAfter;
        boolean v1 = tz.getOffset(c1) == oBefore, v2 = tz.getOffset(c2) == oAfter;
        if (v1 && v2) return Math.min(c1, c2);
        if (v1) return c1;
        if (v2) return c2;
        return c1;
    }

    /** date.setHours(h, m, s, ms) on the local date of ms. */
    private static long withTime(long ms, int h, int mi, int s, int msec, TimeZone tz) {
        int[] f = fields(ms, tz);
        return instantOf(f[0], f[1], f[2], h, mi, s, msec, tz);
    }

    /** date.setDate(date.getDate() + n): keeps the local time of ms. */
    private static long plusDays(long ms, int n, TimeZone tz) {
        int[] f = fields(ms, tz);
        return instantOf(f[0], f[1], f[2] + n, f[3], f[4], f[5], f[6], tz);
    }

    /** Pure port of nextDueDate (scheduler.ts) for daily and weekly: the first occurrence strictly after probeMs, or -1 when none. */
    static long nextDue(Rule r, long probeMs, TimeZone tz) {
        int[] b = fields(r.baseMs, tz);
        long endMs = Long.MIN_VALUE;
        if (r.end != null) {
            int[] e = parseYmd(r.end);
            endMs = instantOf(e[0], e[1] - 1, e[2], 23, 59, 59, 999, tz);
        }
        long startMs = r.baseMs;
        if (r.start != null) {
            int[] s = parseYmd(r.start);
            startMs = instantOf(s[0], s[1] - 1, s[2], b[3], b[4], b[5], b[6], tz);
        }
        long lower = Math.max(r.baseMs, startMs);
        long after = Math.max(probeMs, lower - 1);
        long cand;
        if ("daily".equals(r.kind)) {
            cand = withTime(after, b[3], b[4], b[5], b[6], tz);
            if (cand <= after) cand = plusDays(cand, 1, tz);
            return clamp(cand, endMs);
        }
        for (int off = 0; off <= 8; off++) {
            long test = plusDays(after, off, tz);
            if (fields(test, tz)[7] != b[7]) continue;
            cand = withTime(test, b[3], b[4], b[5], b[6], tz);
            if (cand > after) return clamp(cand, endMs);
        }
        return -1;
    }

    private static long clamp(long cand, long endMs) {
        return endMs != Long.MIN_VALUE && cand > endMs ? -1 : cand;
    }

    /** Pure port of upcomingOccurrences: up to maxRaw raw occurrences after fromMs and no later than toMs (before quiet hours and snooze). */
    static List<Long> expandRaw(Rule r, long fromMs, long toMs, int maxRaw, TimeZone tz) {
        List<Long> out = new ArrayList<>();
        long cur = fromMs;
        for (int i = 0; i < maxRaw * 2; i++) {
            long n = nextDue(r, cur, tz);
            if (n < 0 || n > toMs) break;
            out.add(n);
            cur = n;
            if (out.size() >= maxRaw) break;
        }
        return out;
    }

    /** isQuietHoursActive: "HH:mm" string comparison in the local zone, inclusive, crossing midnight when start is after end. */
    static boolean quiet(Rule r, long atMs, TimeZone tz) {
        if (!r.quietOn) return false;
        int[] f = fields(atMs, tz);
        String cur = String.format(Locale.US, "%02d:%02d", f[3], f[4]);
        if (r.quietStart.compareTo(r.quietEnd) <= 0) return cur.compareTo(r.quietStart) >= 0 && cur.compareTo(r.quietEnd) <= 0;
        return cur.compareTo(r.quietStart) >= 0 || cur.compareTo(r.quietEnd) <= 0;
    }

    /** prayerId('rem', reminderId:iso) from src/lib/prayer-schedule.ts. */
    static int idOf(String rid, long atMs) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(UTC);
        String s = "rem|" + rid + ":" + f.format(new Date(atMs));
        int hash = (int) 2166136261L;
        for (int i = 0; i < s.length(); i++) {
            hash ^= s.charAt(i);
            hash *= 16777619;
        }
        return (int) ((Math.abs((long) hash) % 2147483646L) + 1);
    }

    /** Pure: the notifications of one rule after fromMs (never before the frontier), as the app's builder would plan them. */
    static List<NativeReminderQueue.Item> items(Rule r, long nowMs, long toMs, int maxRaw, TimeZone tz) {
        List<NativeReminderQueue.Item> out = new ArrayList<>();
        long from = Math.max(r.frontierMs, nowMs);
        for (long at : expandRaw(r, from, toMs, maxRaw, tz)) {
            if (at <= nowMs + 1000) continue;
            if (r.snoozeMs > 0 && at <= r.snoozeMs && r.snoozeMs - at <= 60L * 60 * 1000) continue;
            if (quiet(r, at, tz)) continue;
            out.add(new NativeReminderQueue.Item(idOf(r.rid, at), at, r.title, r.body, r.channelId));
        }
        return out;
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Replaces all rules ("[]" removes them). Stored as parsed, so malformed rows are dropped. */
    public static synchronized void setRules(Context c, String json) {
        try {
            List<Rule> rules = parse(json);
            SharedPreferences.Editor e = prefs(c).edit();
            if (rules.isEmpty()) e.remove(KEY); else e.putString(KEY, json);
            e.commit();
        } catch (Throwable ignored) {}
    }

    public static synchronized void clear(Context c) {
        try { prefs(c).edit().remove(KEY).commit(); } catch (Throwable ignored) {}
    }

    public static boolean hasRules(Context c) {
        try { return !parse(prefs(c).getString(KEY, null)).isEmpty(); } catch (Throwable t) { return false; }
    }

    /** Items due within windowMs of now across all rules, in the current zone. Never throws. */
    static List<NativeReminderQueue.Item> dueItems(Context c, long nowMs, long windowMs) {
        List<NativeReminderQueue.Item> out = new ArrayList<>();
        try {
            TimeZone tz = TimeZone.getDefault();
            for (Rule r : parse(prefs(c).getString(KEY, null))) out.addAll(items(r, nowMs, nowMs + windowMs, 400, tz));
        } catch (Throwable ignored) {}
        return out;
    }
}
