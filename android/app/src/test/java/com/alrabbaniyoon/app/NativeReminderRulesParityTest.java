package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.TimeZone;

/**
 * Native daily/weekly renewal vs the JS app. recurrence-parity.jsonl is generated from the real builders
 * (buildNativeReminderPayloads, buildNativeRecurrenceRules, upcomingOccurrences/nextDueDate) by
 * scripts/gen-recurrence-parity.cjs: 7 time zones, DST gaps and overlaps, start/end dates, quiet hours and snooze.
 * Plain JVM test (no Android runtime, no device).
 */
public class NativeReminderRulesParityTest {
    private final TimeZone original = TimeZone.getDefault();

    @After public void restore() { TimeZone.setDefault(original); }

    private static void same(String label, List<NativeReminderQueue.Item> got, JSONArray want, boolean withContent) throws Exception {
        assertEquals(label + " count", want.length(), got.size());
        for (int i = 0; i < want.length(); i++) {
            JSONObject w = want.getJSONObject(i);
            NativeReminderQueue.Item g = got.get(i);
            assertEquals(label + " #" + i + " at", w.getLong("at"), g.atMs);
            assertEquals(label + " #" + i + " id", w.getInt("id"), g.id);
            if (withContent) {
                assertEquals(label + " #" + i + " title", w.getString("title"), g.title);
                assertEquals(label + " #" + i + " body", w.getString("body"), g.body);
                assertEquals(label + " #" + i + " channel", w.getString("channelId"), g.channelId);
            }
        }
    }

    @Test public void nativeExpansionEqualsTheJsBuildersEverywhere() throws Exception {
        InputStream in = getClass().getClassLoader().getResourceAsStream("recurrence-parity.jsonl");
        assertNotNull("run: node scripts/gen-recurrence-parity.cjs", in);
        int cases = 0, withItems = 0;
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (line.trim().isEmpty()) continue;
                JSONObject c = new JSONObject(line);
                String label = c.getString("tz") + "/" + c.getString("scenario") + "/" + c.getLong("nowMs");
                TimeZone.setDefault(TimeZone.getTimeZone(c.getString("tz")));
                TimeZone tz = TimeZone.getDefault();
                long now = c.getLong("nowMs");
                JSONArray payloads = c.getJSONArray("payloads");

                // 1) rule with no planned occurrences: the first 40 raw occurrences equal the app's own far-window plan
                List<NativeReminderRules.Rule> r0 = NativeReminderRules.parse(c.getJSONArray("rulesNoFrontier").toString());
                assertEquals(label + " rule built", 1, r0.size());
                same(label + " plan", NativeReminderRules.items(r0.get(0), now, now + 4000L * 86400000L, 40, tz), payloads, true);

                // 2) rule after the app's plan: occurrences past the last planned one, within 90 days, equal the real builder's
                List<NativeReminderRules.Rule> r1 = NativeReminderRules.parse(c.getJSONArray("rulesAfterPlan").toString());
                assertEquals(label + " rule2 built", 1, r1.size());
                JSONArray tail = c.getJSONArray("tail");
                same(label + " tail", NativeReminderRules.items(r1.get(0), now, c.getLong("toMs"), 400, tz), tail, false);

                // nothing is generated at or before the frontier (no duplicates of what the app planned)
                for (NativeReminderQueue.Item it : NativeReminderRules.items(r1.get(0), now, c.getLong("toMs"), 400, tz)) {
                    assertTrue(label + " after frontier", it.atMs > r1.get(0).frontierMs);
                }
                cases++;
                if (payloads.length() + tail.length() > 0) withItems++;
            }
        }
        assertTrue("cases " + cases, cases >= 600);
        assertTrue("cases with items " + withItems, withItems >= 300);
    }
}
