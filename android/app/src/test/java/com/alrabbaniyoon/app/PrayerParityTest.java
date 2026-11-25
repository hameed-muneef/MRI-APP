package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

import org.junit.Test;

/**
 * Exact-minute parity between PrayerTimesCalculator (Java) and the app's JS scheduler (adhan-js 4.4.6).
 * Fixture rows come from scripts/gen-prayer-parity.cjs: lat, lon, method, hanafi(0/1), y, m, d, then the
 * epoch ms of Fajr, Dhuhr, Asr, Maghrib, Isha as computed by src/lib/prayer-schedule.ts (NaN = invalid).
 */
public class PrayerParityTest {
    @Test
    public void javaMatchesJsForEveryFixtureRow() throws Exception {
        InputStream in = getClass().getClassLoader().getResourceAsStream("prayer-parity.tsv");
        assertTrue("fixture missing", in != null);
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        int rows = 0;
        StringBuilder bad = new StringBuilder();
        int mismatches = 0;
        while ((line = r.readLine()) != null) {
            if (line.isEmpty()) continue;
            String[] f = line.split("\t");
            double[] got = PrayerTimesCalculator.compute(Double.parseDouble(f[0]), Double.parseDouble(f[1]), f[2], "1".equals(f[3]),
                Integer.parseInt(f[4]), Integer.parseInt(f[5]), Integer.parseInt(f[6]));
            for (int i = 0; i < 5; i++) {
                String e = f[7 + i];
                boolean ok = e.equals("NaN") ? Double.isNaN(got[i]) : (!Double.isNaN(got[i]) && (long) got[i] == Long.parseLong(e));
                if (!ok) {
                    mismatches++;
                    if (bad.length() < 800) bad.append(f[0]).append(',').append(f[1]).append(' ').append(f[2]).append(' ').append(f[4]).append('-').append(f[5]).append('-').append(f[6]).append(" p").append(i).append(" exp=").append(e).append(" got=").append((long) got[i]).append('\n');
                }
            }
            rows++;
        }
        assertTrue("fixture too small: " + rows, rows > 1000);
        assertEquals("mismatches:\n" + bad, 0, mismatches);
    }

    @Test
    public void unsupportedMethodNameFallsBackLikeJs() {
        double[] a = PrayerTimesCalculator.compute(30.0444, 31.2357, "NotAMethod", false, 2026, 11, 25);
        double[] b = PrayerTimesCalculator.compute(30.0444, 31.2357, "MuslimWorldLeague", false, 2026, 11, 25);
        for (int i = 0; i < 5; i++) assertEquals(b[i], a[i], 0.0);
    }
}
