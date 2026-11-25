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
 * Scope: main Adhan alarms only. Before/after reminders, tasks, review and custom reminders are not renewed here.
 */
public final class NativeAdhanRecompute {
    private NativeAdhanRecompute() {}

    private static final String PREFS = "RABBANI_NATIVE_ADHAN_RECOMPUTE_V1";
    private static final String KEY_SPEC = "spec_json";
    private static final String KEY_STATE = "state_json";

    public static void saveSpec(Context c, String specJson) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_SPEC, specJson).apply();
    }

    public static void clearSpec(Context c) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_SPEC).apply();
        writeState(c, "no_spec", 0, null);
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

    /** Never throws; existing alarms are left intact on any failure. Returns the result code. */
    public static synchronized String refresh(Context c, String reason) {
        try {
            SharedPreferences sp = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(KEY_SPEC, null);
            if (raw == null || raw.isEmpty()) { writeState(c, "no_spec", 0, reason); return "no_spec"; }
            JSONObject spec;
            try { spec = new JSONObject(raw); } catch (JSONException e) { writeState(c, "invalid_spec", 0, "parse"); return "invalid_spec"; }
            String problem = NativeAdhanPlanner.validate(spec);
            if (problem != null) {
                String code = "unsupported_method".equals(problem) ? "unsupported" : "invalid_spec";
                writeState(c, code, 0, problem);
                return code;
            }
            List<NativeAdhanPlanner.Planned> planned = NativeAdhanPlanner.plan(spec, System.currentTimeMillis(), TimeZone.getDefault(), 30);
            if (planned == null) { writeState(c, "failed", 0, "plan"); return "failed"; }
            int added = NativeAdhanStore.addMissingAlarms(c, planned);
            writeState(c, "ok", added, reason);
            return "ok";
        } catch (Throwable t) {
            writeState(c, "failed", 0, t.getClass().getSimpleName());
            return "failed";
        }
    }
}
