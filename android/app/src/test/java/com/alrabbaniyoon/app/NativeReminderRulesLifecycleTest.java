package com.alrabbaniyoon.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;

/** Simulated Android runtime (Robolectric), not a physical device: lifecycle of the daily/weekly renewal rules. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 33)
public class NativeReminderRulesLifecycleTest {
    private static final long DAY = 24L * 3600 * 1000;
    private Context ctx;

    @Before public void setUp() {
        ctx = ApplicationProvider.getApplicationContext();
        NativeReminderQueue.clearAll(ctx);
    }

    private List<ShadowAlarmManager.ScheduledAlarm> queued() {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        List<ShadowAlarmManager.ScheduledAlarm> out = new ArrayList<>();
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms()) {
            if (a.operation != null && NativeReminderQueue.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) out.add(a);
        }
        return out;
    }

    private static String rule(String rid, String kind, long baseMs, long frontierMs) {
        return "[{\"rid\":\"" + rid + "\",\"title\":\"t\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\",\"kind\":\"" + kind + "\",\"baseMs\":" + baseMs
            + ",\"start\":null,\"end\":null,\"quietOn\":false,\"quietStart\":\"22:00\",\"quietEnd\":\"06:00\",\"snoozeMs\":0,\"frontierMs\":" + frontierMs + "}]";
    }

    private int expectedInWindow(String rulesJson) {
        long now = System.currentTimeMillis();
        int n = 0;
        for (NativeReminderRules.Rule r : NativeReminderRules.parse(rulesJson)) n += NativeReminderRules.items(r, now, now + NativeReminderQueue.WINDOW_MS, 400, TimeZone.getDefault()).size();
        return n;
    }

    @Test public void dailyRuleArmsItsNextOccurrencesInsideTheWindowAndNothingBeyondIt() {
        long now = System.currentTimeMillis();
        String rules = rule("r1", "daily", now - 10 * DAY, 0);
        NativeReminderRules.setRules(ctx, rules);
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        int want = expectedInWindow(rules);
        assertTrue("about one a day for 7 days: " + want, want >= 6 && want <= 8);
        assertEquals(want, queued().size());
        for (ShadowAlarmManager.ScheduledAlarm a : queued()) assertTrue(a.triggerAtTime > now && a.triggerAtTime <= now + NativeReminderQueue.WINDOW_MS);
        assertTrue(NativeReminderQueue.hasItems(ctx));
    }

    @Test public void weeklyRuleArmsOneOccurrenceAWeek() {
        long now = System.currentTimeMillis();
        String rules = rule("r2", "weekly", now - 20 * DAY, 0);
        NativeReminderRules.setRules(ctx, rules);
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertEquals(expectedInWindow(rules), queued().size());
        assertTrue(queued().size() >= 1 && queued().size() <= 2);
    }

    @Test public void nothingBeforeTheFrontierIsGeneratedSoThePlannedOccurrencesAreNotDuplicated() {
        long now = System.currentTimeMillis();
        NativeReminderRules.setRules(ctx, rule("r3", "daily", now - 10 * DAY, now + 3 * DAY));
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertTrue(queued().size() >= 3 && queued().size() <= 5);
        for (ShadowAlarmManager.ScheduledAlarm a : queued()) assertTrue(a.triggerAtTime > now + 3 * DAY);
    }

    @Test public void replacingTheRulesWithAnEmptyListCancelsTheArmedAlarmsAndTheyDoNotComeBack() {
        long now = System.currentTimeMillis();
        NativeReminderRules.setRules(ctx, rule("r4", "daily", now - 5 * DAY, 0));
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertTrue(queued().size() > 0);
        NativeReminderRules.setRules(ctx, "[]");
        NativeReminderQueue.setQueue(ctx, "reminder", "[]"); // the app always follows the rules with the queue
        assertEquals(0, queued().size());
        NativeReminderQueue.promote(ctx);
        assertEquals(0, queued().size());
        assertFalse(NativeReminderQueue.hasItems(ctx));
    }

    @Test public void clearAllRemovesTheRulesToo() {
        long now = System.currentTimeMillis();
        NativeReminderRules.setRules(ctx, rule("r5", "daily", now - 5 * DAY, 0));
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertTrue(queued().size() > 0);
        NativeReminderQueue.clearAll(ctx);
        assertEquals(0, queued().size());
        assertEquals(0, NativeReminderQueue.promote(ctx));
        assertFalse(NativeReminderRules.hasRules(ctx));
        assertFalse(NativeReminderQueue.hasItems(ctx));
    }

    @Test public void ruleAlarmsStayInsideTheSharedBudget() {
        long now = System.currentTimeMillis();
        NativeReminderRules.setRules(ctx, rule("r6", "daily", now - 5 * DAY, 0));
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        int all = queued().size();
        assertTrue(all >= 6);
        assertEquals(2, NativeReminderQueue.promote(ctx, 448));
        assertEquals(2, queued().size());
        assertEquals(0, NativeReminderQueue.promote(ctx, 450));
        assertEquals(0, queued().size());
        assertEquals(all, NativeReminderQueue.promote(ctx, 0));
    }

    @Test public void aQueuedItemAndARuleOccurrenceWithTheSameIdAreArmedOnce() {
        long now = System.currentTimeMillis();
        String rules = rule("r7", "daily", now - 5 * DAY, 0);
        NativeReminderRules.setRules(ctx, rules);
        NativeReminderRules.Rule r = NativeReminderRules.parse(rules).get(0);
        NativeReminderQueue.Item first = NativeReminderRules.items(r, now, now + NativeReminderQueue.WINDOW_MS, 400, TimeZone.getDefault()).get(0);
        NativeReminderQueue.setQueue(ctx, "reminder", "[{\"id\":" + first.id + ",\"at\":" + first.atMs + ",\"title\":\"t\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\"}]");
        assertEquals(expectedInWindow(rules), queued().size());
    }

    @Test public void malformedRulesAreDroppedAndNeverThrow() {
        NativeReminderRules.setRules(ctx, "not json");
        assertFalse(NativeReminderRules.hasRules(ctx));
        NativeReminderRules.setRules(ctx, "[{\"rid\":\"x\"},{\"rid\":\"y\",\"title\":\"t\",\"baseMs\":5,\"kind\":\"monthly\"}]");
        assertFalse(NativeReminderRules.hasRules(ctx));
        assertEquals(0, NativeReminderQueue.promote(ctx));
    }

    private boolean keepAliveArmed() {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (ShadowAlarmManager.ScheduledAlarm a : shadowOf(am).getScheduledAlarms()) {
            if (a.operation != null && NativeAdhanKeepAlive.ACTION.equals(shadowOf(a.operation).getSavedIntent().getAction())) return true;
        }
        return false;
    }

    private List<Long> times() {
        List<Long> t = new ArrayList<>();
        for (ShadowAlarmManager.ScheduledAlarm a : queued()) t.add(a.triggerAtTime);
        java.util.Collections.sort(t);
        return t;
    }

    @Test public void dailyKeepAliveStaysArmedWhileOnlyARuleRemainsAndStopsWhenNoValidRuleIsLeft() {
        long now = System.currentTimeMillis();
        // no queue items and no prayer spec: only the rule is left
        NativeReminderRules.setRules(ctx, rule("k1", "daily", now - 5 * DAY, 0));
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertTrue(NativeReminderQueue.hasItems(ctx));
        assertTrue(keepAliveArmed());
        new DailyRefreshReceiver().onReceive(ctx, new android.content.Intent(NativeAdhanKeepAlive.ACTION));
        assertTrue("keep-alive re-armed by the refresh", keepAliveArmed());
        assertTrue(queued().size() > 0);

        // end date in the past: no valid future rule, the keep-alive is cancelled by the next refresh and not re-armed
        String ended = "[{\"rid\":\"k2\",\"title\":\"t\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\",\"kind\":\"daily\",\"baseMs\":" + (now - 40 * DAY)
            + ",\"start\":null,\"end\":\"2020-01-01\",\"quietOn\":false,\"quietStart\":\"22:00\",\"quietEnd\":\"06:00\",\"snoozeMs\":0,\"frontierMs\":0}]";
        NativeReminderRules.setRules(ctx, ended);
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        assertFalse(NativeReminderRules.hasRules(ctx));
        assertFalse(NativeReminderQueue.hasItems(ctx));
        assertEquals(0, queued().size());
        NativeAdhanKeepAlive.schedule(ctx);
        new DailyRefreshReceiver().onReceive(ctx, new android.content.Intent(NativeAdhanKeepAlive.ACTION));
        assertFalse("keep-alive stopped with no valid rule", keepAliveArmed());
    }

    @Test public void repeatedTopUpsFireAndRebootNeitherDuplicateNorResurrectOccurrences() {
        long now = System.currentTimeMillis();
        long frontier = now + 2 * DAY;
        NativeReminderRules.setRules(ctx, rule("f1", "daily", now - 9 * DAY, frontier));
        NativeReminderQueue.setQueue(ctx, "reminder", "[]");
        List<Long> first = times();
        assertTrue(first.size() >= 4);
        for (long t : first) assertTrue("never at or before the frontier", t > frontier);

        NativeReminderQueue.promote(ctx);
        NativeReminderQueue.promote(ctx);
        assertEquals("repeated top-ups", first, times());

        // an alarm fires (posts, then tops up): same set, nothing earlier than the frontier comes back
        NativeReminderQueue.onFire(ctx, 1, "t", "b", "al-rabbani-general-v2");
        assertEquals("after a fire", first, times());

        // reboot / time change path: release the slots, then re-arm
        NativeReminderQueue.suspend(ctx);
        assertEquals(0, queued().size());
        NativeReminderQueue.promote(ctx);
        assertEquals("after reboot", first, times());
        new DailyRefreshReceiver().onReceive(ctx, new android.content.Intent(NativeAdhanKeepAlive.ACTION));
        assertEquals("after the daily keep-alive", first, times());
    }

    @Test public void ruleMetadataNeverTouchesTheStoredQueuesOfTheExistingKinds() {
        long now = System.currentTimeMillis();
        android.content.SharedPreferences q = ctx.getSharedPreferences("RABBANI_NATIVE_REMINDER_QUEUE_V1", Context.MODE_PRIVATE);
        long taskAt = now + 2 * DAY, reviewAt = now + 3 * DAY, remAt = now + 4 * DAY + 12345;
        NativeReminderQueue.setQueue(ctx, "task", "[{\"id\":71,\"at\":" + taskAt + ",\"title\":\"task\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\"}]");
        NativeReminderQueue.setQueue(ctx, "review", "[{\"id\":72,\"at\":" + reviewAt + ",\"title\":\"rev\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\"}]");
        NativeReminderQueue.setQueue(ctx, "reminder", "[{\"id\":73,\"at\":" + remAt + ",\"title\":\"one\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\"}]");
        String task = q.getString("q_task", null), review = q.getString("q_review", null), rem = q.getString("q_reminder", null);
        int before = queued().size();

        NativeReminderRules.setRules(ctx, rule("m1", "daily", now - 9 * DAY, 0));
        NativeReminderQueue.promote(ctx);
        assertEquals(task, q.getString("q_task", null));
        assertEquals(review, q.getString("q_review", null));
        assertEquals(rem, q.getString("q_reminder", null));
        assertFalse(String.valueOf(q.getString("q_reminder", "")).contains("rid"));
        assertTrue(queued().size() > before);

        // replacing another kind keeps the rule alarms, and replacing the rules keeps the other kinds' alarms
        NativeReminderQueue.setQueue(ctx, "task", "[]");
        assertEquals(expectedInWindow(rule("m1", "daily", now - 9 * DAY, 0)) + 2, queued().size());
        NativeReminderRules.setRules(ctx, "[]");
        NativeReminderQueue.setQueue(ctx, "reminder", rem);
        assertEquals(2, queued().size()); // the review and the one-off reminder
    }
}
