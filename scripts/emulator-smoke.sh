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

# The app may ask for a runtime permission (e.g. location) on first launch. That is a system dialog over the app:
# record its text, dismiss it with Back (counts as not granted) and carry on, so the app UI behind it can be checked.
for i in 1 2 3; do
  r=$(adb shell dumpsys activity activities | tr -d '\r' | grep -m1 -E "mResumedActivity|ResumedActivity" || true)
  case "$r" in
    *GrantPermissionsActivity*)
      echo "NOTE: a runtime permission prompt is shown over the app (prompt $i): $r"
      adb shell uiautomator dump /sdcard/perm.xml >/dev/null 2>&1 || true
      adb shell cat /sdcard/perm.xml 2>/dev/null | tr -d '\r' | grep -o 'text="[^"]\+"' | head -8
      adb shell input keyevent KEYCODE_BACK; sleep 8 ;;
    *) break ;;
  esac
done

pid=$(adb shell pidof "$PKG" | tr -d '\r')
if [ -z "$pid" ]; then echo "FAIL: app process is not running"; echo "-- why the app process ended (Android exit info for $PKG) --"; adb shell dumpsys activity exit-info "$PKG" 2>&1 | head -40; fail=1; else echo "ok: app process $pid is running"; fi

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
# Page-level failures that do not crash the app but mean features are broken.
if grep -q 'then()" is not implemented' /tmp/logcat.txt; then
  echo "FAIL: a Capacitor plugin proxy was returned as a promise result (\"<plugin>.then() is not implemented\")"; fail=1
fi
if grep "Capacitor/Console" /tmp/logcat.txt | grep -q "Uncaught (in promise)"; then
  echo "FAIL: unhandled promise rejection(s) in the page:"; grep "Capacitor/Console" /tmp/logcat.txt | grep "Uncaught (in promise)" | sed 's/^.*Msg: //' | sort | uniq -c | head -10; fail=1
fi
echo "-- WebView console / JS errors --"
grep -iE "chromium|Console|Uncaught|SyntaxError|ReferenceError|TypeError" /tmp/logcat.txt | head -25 || true
echo "-- usable home screen check (accessibility tree via uiautomator) --"
# A slow emulator can show an ANR dialog for a SYSTEM app (e.g. the launcher). Never hide dialogs globally.
# Record it as an environment impairment, keep the evidence, then press "Wait" so the app can be inspected.
# An ANR in the app itself is already a FAIL above and is not dismissed here.
adb shell uiautomator dump /sdcard/uid.xml >/dev/null 2>&1 || true
adb shell cat /sdcard/uid.xml 2>/dev/null | tr -d '\r' > /tmp/uid.xml || true
if grep -q "isn't responding" /tmp/uid.xml; then
  echo "ENV-IMPAIRMENT: system ANR dialog present (evidence below); the emulator is unhealthy, result is not a clean pass"
  grep -o 'text="[^"]*responding[^"]*"' /tmp/uid.xml | head -3
  if grep -q "ANR in $PKG" /tmp/logcat.txt; then echo "dialog belongs to the app: not dismissed"; else
    grep -E "ANR in " /tmp/logcat.txt | head -5
    adb shell input keyevent KEYCODE_DPAD_DOWN; adb shell input keyevent KEYCODE_ENTER; sleep 5
    ENV_IMPAIRED=1
  fi
fi
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
