#!/usr/bin/env bash
# Emulator smoke test: installs the debug APK on a running Android emulator, launches it and checks that
# the app stays alive, shows its main activity and logs no fatal crash for its own package.
# This is an emulator (not a physical phone): it says nothing about OEM battery rules or real alarm delivery.
set -u
PKG=com.alrabbaniyoon.app
APK=android/app/build/outputs/apk/debug/app-debug.apk
fail=0

echo "== device =="
echo "api: $(adb shell getprop ro.build.version.sdk | tr -d '\r')"
echo "release: $(adb shell getprop ro.build.version.release | tr -d '\r')"
echo "model: $(adb shell getprop ro.product.model | tr -d '\r')"
echo "size: $(adb shell wm size | tr -d '\r' | tail -1)"
echo "density: $(adb shell wm density | tr -d '\r' | tail -1)"

adb install -r "$APK" || { echo "FAIL: install"; exit 1; }
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity" | tr -d '\r'
sleep 100

pid=$(adb shell pidof "$PKG" | tr -d '\r')
if [ -z "$pid" ]; then echo "FAIL: app process is not running"; fail=1; else echo "ok: app process $pid is running"; fi

resumed=$(adb shell dumpsys activity activities | tr -d '\r' | grep -m1 -E "mResumedActivity|ResumedActivity" || true)
echo "resumed: $resumed"
case "$resumed" in *"$PKG"*) echo "ok: main activity is in the foreground" ;; *) echo "FAIL: main activity is not in the foreground"; fail=1 ;; esac

adb logcat -d > /tmp/logcat.txt
if grep -A8 "FATAL EXCEPTION" /tmp/logcat.txt | grep -q "$PKG"; then
  echo "FAIL: fatal exception in $PKG"; grep -A12 "FATAL EXCEPTION" /tmp/logcat.txt | head -40; fail=1
else
  echo "ok: no fatal exception for $PKG"
fi
if grep -q "ANR in $PKG" /tmp/logcat.txt; then echo "FAIL: ANR in $PKG"; fail=1; else echo "ok: no ANR"; fi
if grep -q "Uncaught SyntaxError" /tmp/logcat.txt; then
  echo "FAIL: the page scripts did not parse (SyntaxError), so the app UI did not start; WebView is too old for this bundle"; fail=1
fi
if [ -z "$pid" ] || [ "$fail" -ne 0 ]; then
  echo "-- process and crash lines (on failure) --"
  grep -E "alrabbaniyoon|am_proc_died|am_crash|am_kill|lowmemorykiller|has died|AndroidRuntime|signal [0-9]+|Fatal signal" /tmp/logcat.txt | tail -60
fi
echo "-- app log lines (Capacitor) --"
grep -i "capacitor" /tmp/logcat.txt | head -12

echo "-- notification channels (Android 8+ only) --"
adb shell dumpsys notification --noredact | tr -d '\r' | grep -E "mId=al-rabbani|NotificationChannel\{mId='al-rabbani" | head -10 || true
echo "-- alarms registered by the app --"
adb shell dumpsys alarm | tr -d '\r' | grep -c "$PKG" || true

echo "-- WebView in use --"
adb shell dumpsys webviewupdate | tr -d '\r' | grep -E "Current WebView package|Fallback|versionName|Package" | head -6 || true
adb shell dumpsys package com.google.android.webview 2>/dev/null | tr -d '\r' | grep -m1 versionName || true
adb shell dumpsys package com.android.webview 2>/dev/null | tr -d '\r' | grep -m1 versionName || true
echo "-- WebView console / JS errors --"
grep -iE "chromium|Console|Uncaught|SyntaxError|ReferenceError|TypeError" /tmp/logcat.txt | head -25 || true
echo "-- usable home screen check (accessibility tree via uiautomator) --"
# The first dump turns accessibility on; WebView exposes its page only afterwards, so dump twice.
adb shell uiautomator dump /sdcard/ui0.xml >/dev/null 2>&1 || true
sleep 4
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/ui.xml 2>/dev/null | tr -d '\r' > /tmp/ui.xml || true
echo "ui nodes: $(grep -o '<node ' /tmp/ui.xml | wc -l)"
grep -o '\(text\|content-desc\)="[^"]\+"' /tmp/ui.xml | head -30 || true
if grep -q "الرئيسية" /tmp/ui.xml && grep -q "القرآن" /tmp/ui.xml; then
  echo "ok: home screen rendered (bottom navigation labels found in the accessibility tree)"
else
  echo "FAIL: home screen not rendered (navigation labels not found)"; fail=1
fi
adb exec-out screencap -p > /tmp/shot.png 2>/dev/null || true
pid2=$(adb shell pidof "$PKG" | tr -d '\r')
resumed2=$(adb shell dumpsys activity activities | tr -d '\r' | grep -m1 -E "mResumedActivity|ResumedActivity" || true)
case "$resumed2" in *"$PKG"*) echo "ok: app still in the foreground at screenshot time (pid $pid2)" ;; *) echo "FAIL: app not in the foreground at screenshot time: $resumed2"; fail=1 ;; esac
mkdir -p smoke-out && cp /tmp/shot.png "smoke-out/shot-api$(adb shell getprop ro.build.version.sdk | tr -d '\r').png" 2>/dev/null || true
echo "SHOT_BEGIN"
base64 -w0 /tmp/shot.png 2>/dev/null || true
echo
echo "SHOT_END"

exit $fail
