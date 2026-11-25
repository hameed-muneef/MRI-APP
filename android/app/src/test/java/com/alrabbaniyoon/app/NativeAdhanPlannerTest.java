package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * Native planner vs the JS scheduler. The fixture (native-plan-parity.jsonl) is generated from the app's real
 * buildNativeAdhanAlarmInputs / buildNativeRecomputeSpec by scripts/gen-native-plan-parity.cjs: 7 time zones
 * (including DST changes in 2026), 11 locations/methods, both madhabs, per-prayer adjustments, short/silent/disabled
 * prayers and quiet hours. Every alarm id, trigger time, title, body, sound, type and key must match.
 */
public class NativeAdhanPlannerTest {

    @Test
    public void plannerMatchesJsAcrossTimezonesAndDst() throws Exception {
        InputStream in = getClass().getClassLoader().getResourceAsStream("native-plan-parity.jsonl");
        assertNotNull("run: node scripts/gen-native-plan-parity.cjs", in);
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        int cases = 0, alarms = 0;
        while ((line = r.readLine()) != null) {
            if (line.isEmpty()) continue;
            JSONObject c = new JSONObject(line);
            String tz = c.getString("tz");
            long now = c.getLong("nowMs");
            JSONObject spec = c.getJSONObject("spec");
            JSONArray exp = c.getJSONArray("expected");
            List<NativeAdhanPlanner.Planned> got = NativeAdhanPlanner.plan(spec, now, TimeZone.getTimeZone(tz), 7);
            assertNotNull(got);
            String ctx = tz + " now=" + now + " lat=" + spec.getDouble("lat") + " " + spec.getString("method");
            assertEquals(ctx + " count", exp.length(), got.size());
            for (int i = 0; i < exp.length(); i++) {
                JSONObject e = exp.getJSONObject(i);
                NativeAdhanPlanner.Planned g = got.get(i);
                assertEquals(ctx + " #" + i + " id", e.getInt("id"), g.id);
                assertEquals(ctx + " #" + i + " time", e.getLong("triggerAtMs"), g.triggerAtMs);
                assertEquals(ctx + " #" + i + " key", e.getString("prayerKey"), g.prayerKey);
                assertEquals(ctx + " #" + i + " title", e.getString("title"), g.title);
                assertEquals(ctx + " #" + i + " body", e.getString("body"), g.body);
                assertEquals(ctx + " #" + i + " raw", e.getString("rawSound"), g.rawSound);
                assertEquals(ctx + " #" + i + " type", e.getString("adhanType"), g.adhanType);
                alarms++;
            }
            cases++;
        }
        assertTrue("cases=" + cases, cases > 500);
        assertTrue("alarms=" + alarms, alarms > 10000);
    }

    @Test
    public void invalidOrUnsupportedSpecsProduceNothing() throws Exception {
        JSONObject ok = new JSONObject(
            "{\"v\":1,\"lat\":30,\"lon\":31,\"method\":\"Egyptian\",\"hanafi\":false,\"adjust\":{\"Fajr\":0,\"Dhuhr\":0,\"Asr\":0,\"Maghrib\":0,\"Isha\":0},"
            + "\"quiet\":{\"enabled\":false,\"start\":\"22:00\",\"end\":\"06:00\"},\"prayers\":{"
            + p("Fajr", "الفجر") + "," + p("Dhuhr", "الظهر") + "," + p("Asr", "العصر") + "," + p("Maghrib", "المغرب") + "," + p("Isha", "العشاء") + "}}");
        TimeZone tz = TimeZone.getTimeZone("Africa/Cairo");
        long now = 1_800_000_000_000L;
        assertNull(NativeAdhanPlanner.validate(ok));
        int n = NativeAdhanPlanner.plan(ok, now, tz, 7).size();
        assertTrue("n=" + n, n >= 30 && n <= 35);

        JSONObject v2 = new JSONObject(ok.toString()); v2.put("v", 2);
        assertNull(NativeAdhanPlanner.plan(v2, now, tz, 7));
        JSONObject badMethod = new JSONObject(ok.toString()); badMethod.put("method", "Turkey2");
        assertEquals("unsupported_method", NativeAdhanPlanner.validate(badMethod));
        assertNull(NativeAdhanPlanner.plan(badMethod, now, tz, 7));
        JSONObject badLat = new JSONObject(ok.toString()); badLat.put("lat", 120);
        assertNull(NativeAdhanPlanner.plan(badLat, now, tz, 7));
        JSONObject noPrayer = new JSONObject(ok.toString()); noPrayer.getJSONObject("prayers").remove("Asr");
        assertNull(NativeAdhanPlanner.plan(noPrayer, now, tz, 7));
        JSONObject badAdjust = new JSONObject(ok.toString()); badAdjust.getJSONObject("adjust").put("Fajr", 999);
        assertNull(NativeAdhanPlanner.plan(badAdjust, now, tz, 7));
        JSONObject badQuiet = new JSONObject(ok.toString()); badQuiet.getJSONObject("quiet").put("enabled", true).put("start", "x");
        assertNull(NativeAdhanPlanner.plan(badQuiet, now, tz, 7));
        assertNull(NativeAdhanPlanner.plan(null, now, tz, 7));
    }

    @Test
    public void missingOnlyAddsIdsNotAlreadyScheduled() throws Exception {
        JSONObject spec = new JSONObject(
            "{\"v\":1,\"lat\":21.4225,\"lon\":39.8262,\"method\":\"UmmAlQura\",\"hanafi\":false,\"adjust\":{\"Fajr\":0,\"Dhuhr\":0,\"Asr\":0,\"Maghrib\":0,\"Isha\":0},"
            + "\"quiet\":{\"enabled\":false,\"start\":\"22:00\",\"end\":\"06:00\"},\"prayers\":{"
            + p("Fajr", "الفجر") + "," + p("Dhuhr", "الظهر") + "," + p("Asr", "العصر") + "," + p("Maghrib", "المغرب") + "," + p("Isha", "العشاء") + "}}");
        List<NativeAdhanPlanner.Planned> planned = NativeAdhanPlanner.plan(spec, 1_800_000_000_000L, TimeZone.getTimeZone("UTC"), 30);
        Set<Integer> ids = new HashSet<>();
        assertEquals(0, NativeAdhanPlanner.missing(planned, ids).size() - planned.size());
        for (int i = 0; i < 10; i++) ids.add(planned.get(i).id);
        List<NativeAdhanPlanner.Planned> add = NativeAdhanPlanner.missing(planned, ids);
        assertEquals(planned.size() - 10, add.size());
        for (NativeAdhanPlanner.Planned a : add) assertTrue(!ids.contains(a.id));
        // never exceeds the cap even when many alarms already exist
        Set<Integer> many = new HashSet<>();
        for (int i = 0; i < NativeAdhanPlanner.MAX_ALARMS - 3; i++) many.add(-i - 1);
        assertEquals(3, NativeAdhanPlanner.missing(planned, many).size());
    }

    @Test
    public void idsAreUniquePerDayAndPrayer() throws Exception {
        assertEquals(NativeAdhanPlanner.prayerId("2026-11-25", "Fajr"), NativeAdhanPlanner.prayerId("2026-11-25", "Fajr"));
        assertTrue(NativeAdhanPlanner.prayerId("2026-11-25", "Fajr") != NativeAdhanPlanner.prayerId("2026-11-25", "Dhuhr"));
    }

    private static String p(String key, String ar) {
        return "\"" + key + "\":{\"enabled\":true,\"type\":\"full\",\"raw\":\"adhan_almulla\",\"sound\":\"الملا\",\"nameAr\":\"" + ar + "\"}";
    }
}
