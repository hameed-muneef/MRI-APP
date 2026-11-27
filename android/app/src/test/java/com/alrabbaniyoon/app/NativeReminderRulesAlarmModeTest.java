package com.alrabbaniyoon.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;
import java.util.TimeZone;

/** Pure JVM: the daily/weekly rule carries alarmMode to the items it expands; a rule without it stays a normal alert. */
public class NativeReminderRulesAlarmModeTest {
    private static String rule(String extra) {
        return "[{\"rid\":\"r\",\"title\":\"t\",\"body\":\"b\",\"channelId\":\"al-rabbani-general-v2\",\"kind\":\"daily\",\"baseMs\":1700000000000"
            + extra + ",\"start\":null,\"end\":null,\"quietOn\":false,\"quietStart\":\"\",\"quietEnd\":\"\",\"snoozeMs\":0,\"frontierMs\":0}]";
    }

    private static List<NativeReminderQueue.Item> expand(String json) {
        List<NativeReminderRules.Rule> rules = NativeReminderRules.parse(json);
        assertEquals(1, rules.size());
        long now = 1700000000000L + 3_600_000L;
        return NativeReminderRules.items(rules.get(0), now, now + 5L * 24 * 3600 * 1000, 20, TimeZone.getTimeZone("UTC"));
    }

    @Test public void alarmModeRuleExpandsToAlarmItems() {
        List<NativeReminderQueue.Item> items = expand(rule(",\"alarmMode\":true"));
        assertFalse(items.isEmpty());
        for (NativeReminderQueue.Item it : items) assertTrue(it.alarmMode);
    }

    @Test public void ruleWithoutTheFieldStaysNormal() {
        List<NativeReminderQueue.Item> items = expand(rule(""));
        assertFalse(items.isEmpty());
        for (NativeReminderQueue.Item it : items) assertFalse(it.alarmMode);
    }
}
