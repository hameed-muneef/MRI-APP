package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;

import org.junit.Test;

/** Decision logic of the guarded refresh against an in-memory backend (no Android, no AlarmManager). */
public class NativeAdhanRecomputeTest {
    private static final long NOW = 1_800_000_000_000L;
    private static final TimeZone TZ = TimeZone.getTimeZone("Africa/Cairo");

    private static String prayer(String key, String ar, boolean enabled, String type) {
        return "\"" + key + "\":{\"enabled\":" + enabled + ",\"type\":\"" + type + "\",\"raw\":\"adhan_almulla\",\"sound\":\"x\",\"nameAr\":\"" + ar + "\"}";
    }

    private static String spec(String method, boolean enabled, String type) {
        return "{\"v\":1,\"lat\":30.0,\"lon\":31.0,\"method\":\"" + method + "\",\"hanafi\":false,"
            + "\"adjust\":{\"Fajr\":0,\"Dhuhr\":0,\"Asr\":0,\"Maghrib\":0,\"Isha\":0},"
            + "\"quiet\":{\"enabled\":false,\"start\":\"22:00\",\"end\":\"06:00\"},\"prayers\":{"
            + prayer("Fajr", "الفجر", enabled, type) + "," + prayer("Dhuhr", "الظهر", enabled, type) + "," + prayer("Asr", "العصر", enabled, type) + ","
            + prayer("Maghrib", "المغرب", enabled, type) + "," + prayer("Isha", "العشاء", enabled, type) + "}}";
    }

    /** Mimics NativeAdhanStore.addMissingAlarms: prunes expired, dedupes by id, honours the cap. */
    private static final class Mem implements NativeAdhanRecompute.Backend {
        String spec;
        final Set<Integer> armed = new HashSet<>();
        final List<Long> armedTimes = new ArrayList<>();
        String state; int addedLast = -1; int calls = 0;
        @Override public String readSpec() { return spec; }
        @Override public int addMissing(List<NativeAdhanPlanner.Planned> planned) {
            calls++;
            int added = 0;
            for (NativeAdhanPlanner.Planned p : NativeAdhanPlanner.missing(planned, armed)) {
                if (p.triggerAtMs <= NOW + 1000) continue;
                armed.add(p.id); armedTimes.add(p.triggerAtMs); added++;
            }
            return added;
        }
        @Override public void writeState(String result, int added, String detail) { state = result; addedLast = added; }
    }

    @Test
    public void noSpecInvalidSpecAndUnsupportedMethodNeverTouchAlarms() {
        Mem m = new Mem();
        assertEquals("no_spec", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        m.spec = "not json";
        assertEquals("invalid_spec", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        m.spec = spec("Atlantis", true, "full");
        assertEquals("unsupported", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        m.spec = spec("Egyptian", true, "full").replace("\"v\":1", "\"v\":7");
        assertEquals("invalid_spec", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        assertEquals(0, m.calls);
        assertTrue(m.armed.isEmpty());
    }

    @Test
    public void refreshIsIdempotentAndFillsThirtyDays() {
        Mem m = new Mem();
        m.spec = spec("Egyptian", true, "full");
        assertEquals("ok", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "boot"));
        int first = m.armed.size();
        assertTrue("first=" + first, first >= 145 && first <= 150);
        assertEquals("ok", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "boot"));
        assertEquals(first, m.armed.size());
        assertEquals(0, m.addedLast);
        // a day later only the new day is added; expired alarms are not re-added
        long later = NOW + 24L * 3600_000L;
        for (long t : new ArrayList<>(m.armedTimes)) assertTrue(t > NOW);
        assertEquals("ok", NativeAdhanRecompute.refreshWith(m, later, TZ, "alarm_fired"));
        assertTrue(m.addedLast >= 4 && m.addedLast <= 6);
    }

    @Test
    public void disabledSilentOrClearedSpecAddsNothing() {
        Mem m = new Mem();
        m.spec = spec("Egyptian", false, "full");
        assertEquals("ok", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        assertEquals(0, m.armed.size());
        m.spec = spec("Egyptian", true, "silent");
        assertEquals("ok", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        assertEquals(0, m.armed.size());
        // cancel+clear fencing: once the spec is cleared (done atomically with cancelAll), no later refresh re-adds alarms
        m.spec = spec("Egyptian", true, "full");
        NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t");
        assertTrue(m.armed.size() > 100);
        m.armed.clear(); m.armedTimes.clear(); m.spec = null; // what cancelAllAndClearSpec leaves behind
        assertEquals("no_spec", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "alarm_fired"));
        assertEquals(0, m.armed.size());
    }

    @Test
    public void capIsRespectedWhenAlarmsAlreadyExist() {
        Mem m = new Mem();
        for (int i = 0; i < NativeAdhanPlanner.MAX_ALARMS - 5; i++) m.armed.add(-i - 1);
        m.spec = spec("Egyptian", true, "full");
        assertEquals("ok", NativeAdhanRecompute.refreshWith(m, NOW, TZ, "t"));
        assertEquals(NativeAdhanPlanner.MAX_ALARMS, m.armed.size());
    }
}
