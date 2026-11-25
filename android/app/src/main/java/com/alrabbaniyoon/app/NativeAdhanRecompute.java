package com.alrabbaniyoon.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.TimeZone;

/**
 * Guarded native top-up of the main Adhan alarms. JS persists a versioned spec each time it schedules.
 * This refresh only ADDS alarms that are missing (same ids as JS). It never cancels or replaces alarms, and it
 * does nothing when the spec is absent, invalid, of another version or uses an unsupported method.
 * Runs after boot/time/timezone/package-replace and after each fired Adhan alarm.
 * Scope: main Adhan alarms. Reminders, tasks, review and far prayer before/after reminders are renewed by NativeReminderQueue.
 *
 * Concurrency: reading the spec, planning and adding alarms happen inside one critical section on
 * NativeAdhanStore.class, the same monitor used by scheduleAll/cancelAll/addMissingAlarms and by spec writes.
 * cancelAllAndClearSpec() cancels the alarms and clears the spec in that same critical section, so a refresh can
 * never read an old spec and re-add alarms after the user disabled or cancelled them. Alarm ids are deterministic and
 * the PendingIntent is keyed by id, so an interrupted refresh is safe to repeat (re-arming replaces, never duplicates).
 */
public final class NativeAdhanRecompute {
    private NativeAdhanRecompute() {}

    private static final String PREFS = "RABBANI_NATIVE_ADHAN_RECOMPUTE_V1";
    private static final String KEY_SPEC = "spec_json";
    private static final String KEY_STATE = "state_json";

    /** Storage/arming seam so the decision logic can be unit tested without Android. */
    public interface Backend {
        String readSpec();
        int addMissing(List<NativeAdhanPlanner.Planned> planned);
        void writeState(String result, int added, String detail);
    }

    /** Pure decision logic. Never throws; returns the result code. Leaves existing alarms untouched on any problem. */
    public static String refreshWith(Backend b, long nowMs, TimeZone tz, String reason) {
        try {
            String raw = b.readSpec();
            if (raw == null || raw.isEmpty()) { b.writeState("no_spec", 0, reason); return "no_spec"; }
            JSONObject spec;
            try { spec = new JSONObject(raw); } catch (JSONException e) { b.writeState("invalid_spec", 0, "parse"); return "invalid_spec"; }
            String problem = NativeAdhanPlanner.validate(spec);
            if (problem != null) {
                String code = "unsupported_method".equals(problem) ? "unsupported" : "invalid_spec";
                b.writeState(code, 0, problem);
                return code;
            }
            List<NativeAdhanPlanner.Planned> planned = NativeAdhanPlanner.plan(spec, nowMs, tz, 30);
            if (planned == null) { b.writeState("failed", 0, "plan"); return "failed"; }
            int added = b.addMissing(planned);
            b.writeState("ok", added, reason);
            return "ok";
        } catch (Throwable t) {
            try { b.writeState("failed", 0, t.getClass().getSimpleName()); } catch (Throwable ignored) {}
            return "failed";
        }
    }

    private static final class AndroidBackend implements Backend {
        private final Context c;
        AndroidBackend(Context c) { this.c = c; }
        @Override public String readSpec() { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SPEC, null); }
        @Override public int addMissing(List<NativeAdhanPlanner.Planned> planned) { return NativeAdhanStore.addMissingAlarms(c, planned); }
        @Override public void writeState(String result, int added, String detail) { NativeAdhanRecompute.writeState(c, result, added, detail); }
    }

    public static void saveSpec(Context c, String specJson) {
        synchronized (NativeAdhanStore.class) {
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SPEC, specJson).commit();
        }
    }

    public static void clearSpec(Context c) {
        synchronized (NativeAdhanStore.class) {
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_SPEC).commit();
            writeState(c, "no_spec", 0, null);
            if (!NativeReminderQueue.hasItems(c)) NativeAdhanKeepAlive.cancel(c);
        }
    }

    /** Cancel every native Adhan alarm and drop the spec atomically (no refresh can interleave). */
    public static int cancelAllAndClearSpec(Context c) {
        synchronized (NativeAdhanStore.class) {
            int cancelled = NativeAdhanStore.cancelAll(c);
            clearSpec(c);
            return cancelled;
        }
    }

    public static String stateJson(Context c) {
        String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_STATE, null);
        return s != null ? s : "{\"result\":\"never_run\",\"lastRunMs\":0,\"added\":0}";
    }

    private static void writeState(Context c, String result, int added, String detail) {
        try {
            JSONObject o = new JSONObject();
            o.put("result", result);
            o.put("lastRunMs", System.currentTimeMillis());
            o.put("added", added);
            if (detail != null) o.put("detail", detail);
            c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_STATE, o.toString()).apply();
        } catch (JSONException ignored) {}
    }

    /** Whole read-spec/plan/add sequence is one critical section. Never throws. */
    public static String refresh(Context c, String reason) {
        try {
            synchronized (NativeAdhanStore.class) {
                NativeReminderQueue.suspend(c);
                String result;
                try {
                    result = refreshWith(new AndroidBackend(c), System.currentTimeMillis(), TimeZone.getDefault(), reason);
                } finally {
                    NativeReminderQueue.promote(c);
                }
                // Keep the once-a-day refresh armed while a spec exists; never arm it without one.
                if ("no_spec".equals(result) && !NativeReminderQueue.hasItems(c)) NativeAdhanKeepAlive.cancel(c); else NativeAdhanKeepAlive.schedule(c);
                return result;
            }
        } catch (Throwable t) {
            return "failed";
        }
    }
}
