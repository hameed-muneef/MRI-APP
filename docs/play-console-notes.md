# Play Console — Permissions & Foreground Service Justification (Al-Rabbaniyyun)

## 1) Exact alarm permission (`SCHEDULE_EXACT_ALARM`) – core functionality
Al-Rabbaniyoon (الربانيون) is a local-only offline Islamic app whose core functionality includes alerting the user at the exact start time of each of the five daily Islamic prayers (adhan). Prayer times are computed locally on the device from the user's selected location and device time zone. A delay of even several minutes under Doze can cause the user to miss the prayer window.

The app declares `SCHEDULE_EXACT_ALARM` (not `USE_EXACT_ALARM`). Before scheduling, it calls `AlarmManager.canScheduleExactAlarms()` and, if denied, shows an in-app explanation and a button opening the system "Alarms & reminders" settings screen (`ACTION_REQUEST_SCHEDULE_EXACT_ALARM`). If the user declines, the app continues to function via `setAndAllowWhileIdle` inexact scheduling and informs the user that alerts may be slightly delayed. Alarms are only armed for prayers enabled by the user and can be disabled at any time.

## 2) MediaPlayback Foreground Service (`FOREGROUND_SERVICE` & `FOREGROUND_SERVICE_MEDIA_PLAYBACK`)
When a prayer alarm fires in `AdhanAlarmReceiver` for a prayer configured with full Adhan (`adhanType = "full"`), `AdhanPlaybackService` starts as a bounded `mediaPlayback` foreground service (`android:foregroundServiceType="mediaPlayback"`):
- Plays the user-selected bundled Adhan MP3 recording locally via `MediaPlayer` with `AudioAttributes.USAGE_ALARM` and `AudioFocusRequest`.
- Displays a non-removable notification on channel `al-rabbani-adhan-playback-v1` with an explicit **"إيقاف الأذان" (Stop Adhan)** action and swipe/delete stop handling.
- Acquires a bounded partial wake lock and enforces a hard 6-minute auto-stop timeout, immediately stopping the foreground service on completion or stop action.
- On Android 12+ if `SCHEDULE_EXACT_ALARM` is not granted (so background FGS launch exemption does not apply and `ForegroundServiceStartNotAllowedException` occurs), `AdhanAlarmReceiver` catches the exception safely and posts a high-importance channel notification bound directly to the selected `res/raw/adhan_*.mp3`.

## 3) Notification permission (`POST_NOTIFICATIONS`)
Used for prayer alerts, pre/post-prayer reminders, and personal worship reminders. Not requested blindly on first launch — requested after user-facing explanation when enabling prayer alerts or reminders.

## 4) Boot & Time/Permission Recovery (`RECEIVE_BOOT_COMPLETED`)
`AlarmRestoreReceiver` listens to `BOOT_COMPLETED`, `LOCKED_BOOT_COMPLETED`, `MY_PACKAGE_REPLACED`, `TIMEZONE_CHANGED`, `TIME_SET`, and `SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`, restoring strictly-future alarms saved in `NativeAdhanStore` alongside `@capacitor/local-notifications` restore handling.

## 5) Battery optimization
The app does **not** declare `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. It provides an optional diagnostics button opening system `ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` so users on aggressive OEM devices (Xiaomi, Huawei, Oppo, Samsung) can exempt the app manually if desired.

## 6) Bundled Offline Adhan & Takbeerat Audio Assets
All audio files live offline in both `public/sounds/adhan/` and `android/app/src/main/res/raw/` (copied byte-for-byte from the project's `Azan/` source):
- `adhan_almulla.mp3` — الملا (default prayer Adhan)
- `adhan_ahmad.mp3` — أحمد العمادي
- `adhan_madinah.mp3` — أذان الحرم المدني
- `adhan_madinah2.mp3` — أذان الحرم المدني 2
- `adhan_mohammed.mp3` — أذان محمد رمضان (الحرم)
- `adhan_hamad.mp3` — حمد الدغريري
- `takbeerat_eid.mp3` — تكبيرات العيد (dedicated Eid Takbeerat track; excluded from prayer Adhan selection and `NativeAdhanStore` allowlist)

Per-voice Android 8+ notification channels (`al-rabbani-adhan-<rawName>-v1`) bind each voice's `android.resource://<package>/raw/<rawName>` sound cleanly without channel sound lock conflicts.

## 7) Play Console Review Video Checklist
Record a 30–60s video showing:
1. Prayer notification settings screen with prayer alerts enabled and an Adhan voice selected.
2. Exact-alarm explanation dialog opening Android's "Alarms & reminders" permission screen and granting it.
3. Scheduled Adhan alarm firing at prayer time with locked screen, playing the selected Adhan with notification "إيقاف الأذان" stop action.
4. Stopping/disabling prayer alerts in app settings.

## 8) Location permission (approximate only)
The Android build declares only `ACCESS_COARSE_LOCATION`. Location is used on-device for prayer times, Qibla and the bundled nearby-mosques dataset. Prayer times are computed locally with the `adhan` library; no coordinates are sent to any server. The city search box sends only the text the user types to Open-Meteo geocoding. Users may decline location and pick a city manually or enter times manually.

## 9) Media Playback Foreground Service (P1b — background audio)

### Declaration (draft for Play Console)
- **Core functionality:** Continue Quran recitation, Azkar audio, and live HLS streams playback while the screen is off or the app is in the background (music-app-like behavior).
- **Service type:** `mediaPlayback` (`FOREGROUND_SERVICE_MEDIA_PLAYBACK`).
- **Permissions declared:** `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK`, `POST_NOTIFICATIONS` (Android 13+).
- **User impact if interrupted:** Playback stops; user can resume from the notification / lock screen.
- **Start condition:** Only from a user action (tap Play) while the app is in the foreground (Android 12+ restriction).
- **Doze behavior:** Playback continues under Doze via PARTIAL_WAKE_LOCK + WifiLock (Wi-Fi streaming).
- **Stop condition:** User dismisses the notification, presses Stop, or swipes the app from recents (configurable).
- **Adhan interaction:** When an Adhan alarm fires during playback, the app ducks the volume to 25% for the Adhan notification sound, then restores to 100% after 8 seconds. If the user has "short" adhan type, the notification plays the selected Adhan recording at full volume (no duck).

### Screen-recording checklist (required video for Play Console)
1. Open the app → Quran reader → tap Play on a Surah.
2. Press Home (app goes to background) → audio keeps playing.
3. Lock the screen → audio keeps playing, lock-screen controls visible.
4. Use notification controls (play/pause/next/prev/seek).
5. Press a Bluetooth headset button → controls the playback.
6. Incoming call → playback pauses, resumes after call.
7. Unplug headphones → playback pauses.
8. Airplane mode mid-stream → buffering + retry.
9. Reboot → alarms restore, playback state persists.
10. Low memory → service survives (foreground).

### Trade-off: Media3 (ExoPlayer) vs current MediaPlayer
- **Current (MediaPlayer):** Works now, no new dependency, audio focus + noisy + wake locks already implemented. HLS support via MediaPlayer (acceptable but less reliable on slow networks).
- **Media3 (ExoPlayer):** Better HLS reliability, adaptive streaming, better media notification integration, smaller APK if HLS disabled. Requires migration to a plugin (Capgo Native Audio recommended — Cap 8 compatible, MIT/MPL-2.0, actively maintained, free) or hand-written ExoPlayer service (~weeks of work + testing).
- **Decision:** Keep MediaPlayer for now (P1 just fixed). Media3 migration is a future option — document in P1b §1 evaluation.

### Capacitor plugin evaluation (P1b §1)
- **Capawesome Audio Player** (Media3 ExoPlayer, HLS, background playback, metadata): Cap 8 compatible, but **paid (Insiders only)** — not acceptable.
- **Capgo Native Audio** (`@capgo/capacitor-native-audio`): Cap 8 compatible, actively maintained, MIT/MPL-2.0, Media3 ExoPlayer, HLS (optional, ~4MB), background playback, foreground service, audio focus, metadata. **Recommended if Media3 migration is wanted.**
- **Capgo Media Session** (`@capgo/capacitor-media-session`): MediaSession + foreground service; good for keeping existing HTMLAudioElement + adding system controls.
- **@dwbn/capacitor-plugin-playlist**: Media3 MediaSessionService, HLS, DRM, offline downloads. Overkill for our needs.
- **Hand-written ExoPlayer**: full control, most code.
- **Decision:** Keep existing MediaPlayer-based service (already works, P1 fixed). Media3 migration (Capgo recommended) is a future option.

### Features added in P1b (this release)
- Sleep timer (auto-stop after N minutes): native service + web fallback, exposed via `backgroundAudio.setSleepTimer({minutes})`.
- Resume position persistence: saves currentIndex + currentTime to SharedPreferences on pause/stop; restores on next play of the same track.
- Retry on error: up to 2 retries with 2s backoff before surfacing the error.
- Unit tests: `src/audio/background-player.test.ts` (16 tests — queue, pause/resume, next/prev, stop, seek, sleep timer, state machine).
- MediaSession already wired (play/pause/next/prev/seek/stop) — headset/Bluetooth buttons route to the active session.
- Audio focus: duck on transient loss, pause on loss, resume on gain (already implemented).
- Noisy receiver: pause on headphones unplugged (already implemented).
- Wake lock + WifiLock: acquired during playback (already implemented).
