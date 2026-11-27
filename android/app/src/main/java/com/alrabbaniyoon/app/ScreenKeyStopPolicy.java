package com.alrabbaniyoon.app;

import android.content.Intent;

/**
 * Decides when a ringing adhan or alarm should stop because the user pressed the side (power) key.
 *
 * Android apps cannot read the power key. The only signal is the screen turning on or off.
 * - Sound started while the screen was ON: the next SCREEN_OFF means the key was pressed (or the screen timed out;
 *   the two cannot be told apart).
 * - Sound started while the screen was OFF (phone locked in a pocket): the next SCREEN_ON means the key was pressed.
 * Events inside a short grace window after the sound starts are ignored, because starting the alert itself can
 * light the screen.
 */
public final class ScreenKeyStopPolicy {
    public static final long GRACE_MS = 3000L;

    private ScreenKeyStopPolicy() {}

    public static boolean shouldStop(String action, boolean startedInteractive, long elapsedSinceStartMs) {
        if (action == null || elapsedSinceStartMs < GRACE_MS) return false;
        if (startedInteractive) return Intent.ACTION_SCREEN_OFF.equals(action);
        return Intent.ACTION_SCREEN_ON.equals(action);
    }
}
