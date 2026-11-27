package com.alrabbaniyoon.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import org.junit.Test;

public class ScreenKeyStopPolicyTest {
    private static final long LATE = ScreenKeyStopPolicy.GRACE_MS + 1;

    @Test
    public void screenOnAtStart_stopsOnScreenOff() {
        assertTrue(ScreenKeyStopPolicy.shouldStop(Intent.ACTION_SCREEN_OFF, true, LATE));
        assertFalse(ScreenKeyStopPolicy.shouldStop(Intent.ACTION_SCREEN_ON, true, LATE));
    }

    @Test
    public void screenOffAtStart_stopsOnScreenOn() {
        assertTrue(ScreenKeyStopPolicy.shouldStop(Intent.ACTION_SCREEN_ON, false, LATE));
        assertFalse(ScreenKeyStopPolicy.shouldStop(Intent.ACTION_SCREEN_OFF, false, LATE));
    }

    @Test
    public void eventsInsideGraceWindowAreIgnored() {
        assertFalse(ScreenKeyStopPolicy.shouldStop(Intent.ACTION_SCREEN_ON, false, 500));
        assertFalse(ScreenKeyStopPolicy.shouldStop(Intent.ACTION_SCREEN_OFF, true, 500));
    }

    @Test
    public void unknownOrNullActionNeverStops() {
        assertFalse(ScreenKeyStopPolicy.shouldStop(null, true, LATE));
        assertFalse(ScreenKeyStopPolicy.shouldStop("other", false, LATE));
    }
}
