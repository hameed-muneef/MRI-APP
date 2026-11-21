# Google Play Readiness Audit — Al-Rabbaniyyun (الربانيون)

**Audit date:** 2026-11-21  
**Auditor role:** Senior Android release engineer + Google Play policy reviewer (AI-assisted)  
**Scope:** React 18 + Vite + TypeScript app wrapped with Capacitor 8 for Android, Supabase backend, LOCAL_ONLY native mode, Quran reader, prayer-time/adhan notifications, Qibla, nearby mosques (offline OSM dataset), background audio (hls.js/MediaPlayer), hosted on Cloudflare.

**Verdict (2026-11-21, after remediation): CONDITIONAL GO — code-side blockers are cleared; release is blocked only on external steps** (deploy the privacy/delete pages, configure the signing secrets, Play Console declarations, and the 12-tester × 14-day closed test). See §1.0 for the current status of each blocker.

---

## 0. Evidence base (files inspected)

- `capacitor.config.ts`, `android/variables.gradle`, `android/app/build.gradle`, `android/build.gradle`, `android/settings.gradle`, `android/gradle/wrapper/gradle-wrapper.properties`
- `android/app/src/main/AndroidManifest.xml`, `res/values/strings.xml`, `res/values/styles.xml`, `res/xml/file_paths.xml`, `res/xml/config.xml`, `proguard-rules.pro`
- Native Java: `MainActivity.java`, `AdhanAlarmReceiver.java`, `AdhanPlaybackService.java`, `AlarmRestoreReceiver.java`, `BackgroundAudioService.java`, `NativeAdhanStore.java`, `BackgroundAudioPlugin.java`, `SettingsOpenerPlugin.java`
- `.github/workflows/android-build.yml`, `.github/workflows/ci.yml`
- `src/config.ts` (LOCAL_ONLY logic), `src/auth.ts`, `src/sw-register.ts`
- `docs/play-console-notes.md`, `docs/ANDROID_APP.md`, `docs/PRODUCTION_READINESS_AUDIT.md`, `docs/QURAN_SUNNAH_CONTENT_SOURCES.md`, `docs/HADITH_DATA_SOURCE_EVALUATION.md`
- `package.json`, `.gitignore`, `android/.gitignore`
- `scripts/build-android.mjs`, `scripts/check-deploy-env.mjs`
- `src/features/mosques/MosquesScreen.tsx`, `src/views/ProfileView.tsx`, `supabase/migrations/202610300025_user_profile.sql`
- `public/hadith/*` (bundled 19MB), `data/editions.json`

Policy sources browsed (current, 2026): Google Play Help Center "Target API level requirements" (answer/11926878), "App testing requirements for new personal developer accounts" (answer/14151465), plus the standard declaration pages referenced inline. Where a policy page could not be verified in this session, the item is labelled **unverified**.

---

## 1.0 Remediation status (2026-11-21)

Code-level fixes applied after the original audit:

| Item | Status | Evidence |
|---|---|---|
| Android resource build failure | **FIXED** | `res/values/styles.xml` referenced `@color/colorPrimary`, `@color/colorPrimaryDark`, `@color/colorAccent` with no `colors.xml`; added `android/app/src/main/res/values/colors.xml`. This would have failed `aapt2` at `assembleDebug`/`bundleRelease`. |
| Hadith licensing (B1/B4) | **FIXED** | `public/hadith/LICENSE` (Unlicense) + `manifest.json` (`rightsStatus: verified-public-domain`, pinned commit `df57907`); tests in `tests/hadith-content.test.mjs`. Source link/attribution removed from the UI per product decision. |
| Privacy policy (B2) | **FIXED in code, PENDING DEPLOY** | `public/privacy.html` rewritten to be accurate; linked from `src/views/SettingsView.tsx` (Android) and `src/views/ProfileView.tsx` (web). The live URL still returns the SPA shell until the site is redeployed. |
| Account deletion (B3) | **N/A for Android / FIXED for web** | Android is local-only (no accounts). `public/delete-account.html` published in the repo for the optional web build; the SQL cleanup migration was removed with the Supabase migrations (web DB already migrated). |
| AAB size (B4) | **FIXED** | `scripts/build-android.mjs` removes `dist/books` before `cap sync`; mobile assets are now ~45.9 MB (from ~167.7 MB). |
| Supabase in the Android runtime | **REMOVED** | Removed the hard-coded Supabase `preconnect` from `index.html`; `LOCAL_ONLY` is forced on native. No Supabase network call at startup. |
| Device location leaving the phone | **FIXED** | Prayer times are now computed on-device with `adhan` (`src/usePrayerTimes.ts`); the aladhan API call was removed. `ACCESS_FINE_LOCATION` removed from the manifest; coarse location only. |
| Debug/test page shipped | **FIXED** | Deleted `public/quran-test-fresh.html` (was copied into the AAB). |
| Release signing | **FIXED in code** | `android/app/build.gradle` no longer falls back to the debug keystore; release signing is only configured from `KEYSTORE_BASE64`. The build is unsigned (and therefore unusable) until the CI secrets exist. |
| Test suite / type-check | **GREEN** | `npx tsc --noEmit` passes; `npm test` 148/148; `npm run test:unit` 70/70. |

Remaining external steps (cannot be completed in the repository):

1. Deploy `public/privacy.html` and `public/delete-account.html` and verify `https://alrabbaniyun.com/privacy.html` serves the policy (it currently serves the SPA shell).
2. Add `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` to GitHub Actions secrets and build the signed AAB.
3. Fill Play Console declarations (Data safety = no collection; target audience 13+; foreground-service and exact-alarm declarations; content rating; ads = none).
4. Run the pre-launch report and the closed test (≥12 testers × 14 days).
5. Device-test on Android 15/16: edge-to-edge insets, predictive back, alarm firing under Doze, reboot restore, permission allow/deny/permanent-deny.

---

## 1. Original blockers (historical — see §1.0 for current status)

### B1 — Bundled Hadith content has no verified redistribution right
- **Evidence:** `android/app/src/main/assets/public/hadith/bukhari.json` (≈10.1 MB) and `muslim.json` (≈9.0 MB) are shipped in the release assets; `src/hadith/content.ts` loads them at runtime; `src/views/quran/HadithLibrary.tsx` renders them. `docs/QURAN_SUNNAH_CONTENT_SOURCES.md` §5 and `docs/HADITH_DATA_SOURCE_EVALUATION.md` previously marked the hadith data source as **NO-GO / pending**. **Update 2026-11-21:** user provided the Unlicense text (Public Domain) and asserted the data is from fawazahmed0/hadith-api (commit `df57907`); `public/hadith/LICENSE` and `manifest.json` (`rightsStatus: verified-public-domain`) were added. Verify the commit hash and LICENSE file before release. **Verified 2026-11-21:** fetched `https://raw.githubusercontent.com/fawazahmed0/hadith-api/df57907be35291c91ad6a6691180e22ca9920784/LICENSE` — byte-for-byte identical to the Unlicense text provided; commit resolves successfully. Upstream `editions.json` confirms `author: Unknown` and blank `source` for `ara-bukhari`/`ara-muslim`, consistent with the docs. Unlicense covers the repository "software"; the hadith texts are classical (Public Domain).
- **Policy:** Intellectual property / misleading content; unlicensed redistribution of third-party content. Cite: https://support.google.com/googleplay/android-developer/answer/9888033 (IP) and https://support.google.com/googleplay/android-developer/answer/9898740 (minimum functionality / content).
- **Fix (choose one):** (a) Remove the bundled hadith collections and the `HadithLibrary` entry points from the Android build until a verified source with redistribution rights is secured; or (b) replace with a source whose license explicitly permits redistribution, and add the license + attribution to the in-app "about sources" screen and store listing. Do not ship the current 19 MB of unverified hadith data.

### B2 — No privacy policy exists or is linked
- **Evidence:** No `privacy*.html/md` anywhere in repo; `grep` for "privacy policy" in `src` returned only an admin-users note and a mosques privacy pill. `docs/ANDROID_APP.md` and `CLOUDFLARE_DEPLOY.md` do not reference a privacy URL. ProfileView has an in-app "خصوصيتك" section but no policy link.
- **Policy:** Every app that collects personal/sensitive data must provide a privacy policy URL in Play Console and in-app. Cite: https://support.google.com/googleplay/android-developer/answer/9857753 (privacy policy) / https://support.google.com/googleplay/android-developer/answer/10787469 (Data safety).
- **Fix:** Host a privacy policy on the Cloudflare domain (e.g. `https://<domain>/privacy`) and link it in-app (Profile/Settings) and in the store listing. Draft provided in §6.1.

### B3 — Account deletion is not fully implemented (web mode) and no web deletion URL
- **Evidence:** `src/views/ProfileView.tsx:80-88` calls `authClient.rpc('delete_user_account')`; the RPC (`supabase/migrations/202610300025_user_profile.sql:100-110`) only does `delete from auth.users where id = v_user`. It relies on cascade to remove rows; it does **not** delete Supabase Storage objects or other user-owned rows that are not FK-cascaded, and there is no out-of-app (web URL) deletion request path, which Play requires for apps offering account creation.
- **Policy:** Apps that allow account creation must provide an in-app deletion path **and** a web URL for deletion requests. Cite: https://support.google.com/googleplay/android-developer/answer/13327111.
- **Fix:** (a) Make `delete_user_account` cascade-delete all user-owned tables and storage objects (or add a follow-up cleanup); (b) publish a web page (e.g. `/delete-account`) with the deletion request instructions and link it in the store listing and privacy policy. (c) Since the Android build is `LOCAL_ONLY` (no account creation), state in the Play listing that the app does not create accounts; if cloud features are ever enabled in Android, re-open this item.

### B4 — Hadith content is 19 MB of unverified data shipped in the AAB
- **Evidence:** `public/hadith/bukhari.json` 10,148,167 bytes + `muslim.json` 9,018,186 bytes are copied into `android/app/src/main/assets/public/hadith/`. Combined with Quran JSON (2.4 MB) and fonts, the release AAB will be large. Licensing now asserted as Unlicense (Public Domain) per user-provided LICENSE (see B1 update); verify before release.
- **Policy:** App size / content policy. Cite: https://support.google.com/googleplay/android-developer/answer/9859348 (size limits).
- **Fix:** Remove hadith assets from the Android bundle (same fix as B1) and regenerate with `npm run build:android` before uploading.

---

## 2. RISKS (may be flagged)

### R1 — Predictive back (Android 13+/API 36) not handled
- **Evidence:** `android/app/src/main/java/com/alrabbaniyoon/app/MainActivity.java` extends `BridgeActivity` with no back handling. No `onBackPressed`, `OnBackInvokedDispatcher`, or `android:enableOnBackInvokedCallback` found (`grep` returned 0 matches). Capacitor version installed is unknown in this environment (no `node_modules`); Capacitor 8's predictive-back support must be verified.
- **Policy:** Android 16 behavior changes for targetSdk 36. Cite: https://developer.android.com/guide/navigation/predictive-back-gesture.
- **Fix:** Verify Capacitor 8 supports predictive back; if not, add `android:enableOnBackInvokedCallback="true"` to the manifest and a `BridgeActivity` override or Capacitor back-button listener. Test on a device/emulator running Android 16.

### R2 — Edge-to-edge display not configured
- **Evidence:** `android/app/src/main/res/values/styles.xml` uses `Theme.AppCompat.Light.DarkActionBar` / `Theme.SplashScreen` with no `android:windowOptOutEdgeToEdgeEnforcement` or insets handling. For targetSdk 35+, Android enforces edge-to-edge. The WebView content may render under system bars.
- **Policy:** Edge-to-edge enforcement for targetSdk 35+. Cite: https://developer.android.com/develop/ui/views/layout/edge-to-edge.
- **Fix:** Test the release build on an Android 15/16 device; add `WindowInsets` handling in the WebView/Capacitor config if content is obscured. Consider `android:windowOptOutEdgeToEdgeEnforcement="true"` only as a temporary mitigation (not recommended long-term).

### R3 — Release signing requires CI secrets (no debug fallback)
- **Evidence:** `android/app/build.gradle:24-36` configures the release `signingConfig` only when `KEYSTORE_BASE64` is present; the debug-keystore fallback was removed. Without the secrets, `bundleRelease` produces an unsigned AAB that Play rejects.
- **Policy:** Play App Signing / upload key. Cite: https://support.google.com/googleplay/android-developer/answer/9842713.
- **Fix:** Add `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` to GitHub Actions secrets; document the keystore backup procedure (offline, encrypted, never committed). Verify `.gitignore` excludes `*.keystore`/`*.jks` (it does, plus `android/keystores/` and `android/app/release.keystore`).

### R4 — `minifyEnabled false` and no ProGuard rules
- **Evidence:** `android/app/build.gradle:22` `minifyEnabled false`. ProGuard file is the default empty template. R8 shrinking would reduce size; leaving it off increases download size and reverse-engineering risk.
- **Policy:** Not a rejection, but quality. Cite: https://developer.android.com/build/shrink-code.
- **Fix:** Enable `minifyEnabled true` + `shrinkResources true` in release, then run `bundleRelease` and a full smoke test; add keep-rules for Capacitor plugins and the WebView interface. Test thoroughly — Capacitor plugins can break under aggressive shrinking.

### R5 — `versionCode 1` / `versionName "1.0"` with no increment strategy
- **Evidence:** `android/app/build.gradle:17-18`. Every Play upload needs a strictly increasing `versionCode`.
- **Policy:** Version codes. Cite: https://support.google.com/googleplay/android-developer/answer/9844279 (and answer/17367361).
- **Fix:** Adopt a strategy (e.g. `versionCode = MAJOR*10000 + MINOR*100 + PATCH`) and document it in `docs/ANDROID_APP.md`. Bump before each upload.

### R6 — Runtime permission flows not verified end-to-end
- **Evidence:** `src/features/mosques/MosquesScreen.tsx` shows a `PermissionPromptCard` before `requestGps`, and `docs/play-console-notes.md` §3 claims notifications are requested after an explanation. But no browser/device test of the deny/permanently-deny path has been documented for Android.
- **Policy:** Permission best practices + declarations. Cite: https://support.google.com/googleplay/android-developer/answer/9214102.
- **Fix:** Test on a real device: allow, deny, "Don't ask again", and the settings deep-link; verify the app still works without location/notifications (manual city selection, inexact alarms).

### R7 — No account deletion web URL
- **Evidence:** See B3. Even though Android is LOCAL_ONLY, Play's account-deletion policy requires a web URL if the *app* offers account creation anywhere. Because the same codebase powers the web app with accounts, publish `/delete-account` and link it.
- **Fix:** Add a static page on the Cloudflare domain and link it in the privacy policy + store listing.

### R8 — Hadith data is loaded from bundled assets with no offline fallback messaging
- **Evidence:** `src/hadith/content.ts` throws "أصل الأحاديث غير مكتمل." if the asset is missing/invalid. If removed (per B1), ensure the UI degrades gracefully (hide the section) rather than crashing.
- **Fix:** Gate the hadith UI behind a feature flag or remove the routes; add a test.

### R9 — UGC moderation/reporting/blocking
- **Evidence:** The web app has circles, courses, study questions, comments. The Android build is LOCAL_ONLY, so no UGC is shared off-device; but if any future build enables cloud features on Android, Play requires reporting + blocking for UGC.
- **Policy:** User-generated content. Cite: https://support.google.com/googleplay/android-developer/answer/9876937.
- **Fix:** Keep Android LOCAL_ONLY (no accounts) for v1; document that cloud/UGC features are web-only until moderation exists. If enabled later, implement report/block before release.

### R10 — Families / target audience declaration
- **Evidence:** No target-audience declaration in repo. The app is religious, all ages. If declared as targeting children, Families policy (no ads, restricted data) applies; if not, declare 13+.
- **Policy:** Families. Cite: https://support.google.com/googleplay/android-developer/answer/9893335.
- **Fix:** Decide and declare the target audience consistently in Play Console, content rating, and the store listing. Recommend: not directed at children (13+), unless a separate kids build is planned.

### R11 — Pre-launch report not run
- **Evidence:** `docs/PRODUCTION_READINESS_AUDIT.md` lists no E2E/CI; `android-build.yml` only builds debug + (optional) release AAB.
- **Policy:** Pre-launch report. Cite: https://support.google.com/googleplay/android-developer/answer/9842757.
- **Fix:** Enable pre-launch report in Play Console after the first closed-test upload; fix any crashes/ANRs it surfaces before production.

### R12 — Bundle size warning (web chunk 594 KB)
- **Evidence:** `docs/PRODUCTION_READINESS_AUDIT.md` P2: main JS chunk 594.91 KB (168 KB gzip). Plus 19 MB hadith assets (removed per B1/B4).
- **Fix:** Re-measure after removing hadith; consider code-splitting if still over budget.

### R13 — Third-party SDK inventory for Data safety
- **Evidence:** Capacitor plugins (LocalNotifications, AppLauncher); hls.js; no ads SDK; no analytics/crash SDK (`grep` for firebase/analytics/sentry returned none except the optional `google-services.json`). Supabase is present in `src/auth.ts` for the optional web build but `LOCAL_ONLY` is forced on native, so no Supabase client is created. Prayer times are computed on-device (`src/usePrayerTimes.ts`); the aladhan API call was removed.
- **Fix:** In Play Console Data safety, declare **no data collected/shared** for the Android build. The only network requests are user-triggered content loads (city search text to Open-Meteo, Quran audio, live radio, fonts) and are disclosed in `public/privacy.html`.

---

## 3. OK items (with evidence)

| Item | Evidence |
|---|---|
| targetSdk 36 / compileSdk 36 | `android/variables.gradle:4-6` (`targetSdkVersion = 36`, `compileSdkVersion = 36`) |
| minSdk 24 | `android/variables.gradle:3` |
| Gradle plugin 8.13.0, Gradle 8.14.3 | `android/build.gradle:8`, `android/gradle/wrapper/gradle-wrapper.properties:5` |
| Capacitor 8.6.2 (Android) | `package.json:36` |
| Android App Bundle produced by CI | `.github/workflows/android-build.yml` runs `bundleRelease` |
| No service_role / private keys in client | `src/auth.ts` uses only `VITE_SUPABASE_PUBLISHABLE_KEY`; `scripts/check-deploy-env.mjs` validates HTTPS origin; `AUTH_SETUP.md` warns against service_role |
| `allowMixedContent: false` | `capacitor.config.ts:13` |
| No debuggable flag in manifest | `AndroidManifest.xml` (no `android:debuggable`) |
| No cleartext traffic declared | Manifest has no `usesCleartextTraffic` |
| Permission: exact alarm (not USE_EXACT_ALARM) | `AndroidManifest.xml:43` `SCHEDULE_EXACT_ALARM`; `NativeAdhanStore.canScheduleExact` checks `canScheduleExactAlarms()` |
| No `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` declared | Manifest permission list (verified) |
| Location: foreground only (coarse + fine), no background | `AndroidManifest.xml:39-40`; no `ACCESS_BACKGROUND_LOCATION` |
| Foreground services typed as mediaPlayback | `AndroidManifest.xml:23-30` |
| Boot/time receivers declared | `AndroidManifest.xml:32-41` |
| Location stays on device; UI says so | `MosquesScreen.tsx:87-90` "موقعك يبقى على جهازك فقط" |
| No ads SDK | `grep` for ads/analytics/sentry: none (only optional google-services.json) |
| 64-bit support | Default AGP includes arm64/x86_64; no abiFilters restricting (verified in build.gradle) |
| RLS on all tables (per production audit) | `docs/PRODUCTION_READINESS_AUDIT.md`: "No public table was found with RLS disabled" |
| Account deletion in-app path exists (web mode) | `ProfileView.tsx:137-141` |
| Nearby mosques attribution | `MosquesScreen.tsx:288-289` (OpenStreetMap attribution) |
| `android:allowBackup="false"` | `AndroidManifest.xml:4` |
| FileProvider for sharing | `AndroidManifest.xml:46-52` |
| npm audit (production deps): 0 vulnerabilities | `npm audit --omit=dev` → "found 0 vulnerabilities" |

---

## 4. Prioritized to-do list (historical — completed items are tracked in §1.0)

1. **B1/B4** — Remove bundled hadith assets + hadith routes from Android build; regenerate `build:android`; verify `npm test` and build. (1–2 days)
2. **B2** — Host + link a privacy policy (draft in §6.1). (0.5 day)
3. **B3** — Implement complete account deletion (DB cascade + storage) and publish a web deletion URL. (1 day)
4. **R3** — Fix release signing so missing keystore fails the build; document keystore backup. (0.5 day)
5. **R4** — Enable R8 shrinking with keep-rules; smoke-test. (1 day)
6. **R1/R2** — Test predictive back + edge-to-edge on Android 15/16 emulator; fix. (1 day)
7. **R6** — Device-test permission flows (allow/deny/permanent-deny). (0.5 day)
8. **R5** — Adopt versionCode strategy and bump. (0.5 day)
9. **R10/R13** — Fill Play Console declarations (target audience, data safety). (0.5 day)
10. **R11** — Upload to closed testing; run pre-launch report; fix findings. (3–5 days + 14-day closed test)
11. **R12** — Re-measure bundle size. (0.5 day)
12. Apply for production access after 12 testers × 14 days.

---

## 5. Play Console release checklist (concrete)

- **Developer account:** If created after 2023-11-13 as a *personal* account, the closed-test requirement applies: ≥12 testers opted in continuously for ≥14 days before applying for production access. Cite: https://support.google.com/googleplay/android-developer/answer/14151465.
- **Testing plan:** Recruit 12–15 testers from personal/professional networks aligned with the target audience (Arabic-speaking Muslims). Give them a written test script: install, grant notification permission, set location, verify prayer alarm fires at a prayer time, play adhan, stop adhan, open Qibla, search nearby mosques offline, play Quran audio, switch dark/light theme, reboot device and confirm alarms restore. Collect feedback via email/WhatsApp; summarize themes for the production-access application.
- **Tracks:** Internal → Closed (14 days, ≥12 testers) → (optional) Open testing → Production with staged rollout (e.g. 10% → 50% → 100%) and a rollback plan (halt rollout + revert to previous AAB).
- **Store listing assets:** app icon 512×512 (`public/icons/icon-512.png`), feature graphic 1024×500, phone screenshots (min 2, recommended 4–8), short description ≤80 chars, full description, category (Lifestyle or Books & Reference), contact email, privacy policy URL, Arabic + English localizations. Drafts in §6.4.
- **App content declarations:** privacy policy, ads (none), app access (test credentials if login required — provide for the web build; Android is local-only so mark "no login required"), content rating questionnaire, target audience, data safety, news/health/financial (none apply), government app (no), permission declarations for SCHEDULE_EXACT_ALARM / POST_NOTIFICATIONS / location / foreground service / RECEIVE_BOOT_COMPLETED.
- **Pre-launch report:** enable in Play Console; review crashes/ANRs/performance.

---

## 6. Drafts

### 6.1 Privacy Policy (superseded — the live text is `public/privacy.html`)

> **Privacy Policy — Al-Rabbaniyyun (الربانيون)**
>
> Last updated: 2026-11-21
>
> Al-Rabbaniyyun is an Islamic companion app. The Android version runs in **local-only mode**: it does not create an account and does not send your personal data to our servers.
>
> **Data processed on your device only**
> - Prayer times, adhan settings, Quran reading progress, notes, bookmarks, goals, and preferences are stored locally on your device (and in your browser's local storage on web).
> - Your location (for prayer times, Qibla, and nearby mosques) is used only on the device to compute results. It is **not** uploaded to our servers. When you choose "open directions", your coordinates are passed to your installed maps app.
> - Notifications (prayer alerts, reminders) are scheduled locally using Android's alarm system.
>
> **Data we do NOT collect on Android:** account identifiers, email, passwords, analytics, crash reports, advertising identifiers, or precise location.
>
> **Web version (optional):** If you use the web version and create an account, we store your email, profile, and saved data in our Supabase backend (EU/US region per project settings), protected by row-level security. You can delete your account from your profile page; deletion removes your authentication record and your data. A web deletion-request URL is provided at https://<your-domain>/delete-account.
>
> **Third parties:** The app may open third-party services you choose (maps apps, Google Meet links you paste). Those services have their own privacy policies. Quran text and fonts are from the King Fahd Glorious Quran Printing Complex; hadith content is not shipped until licensing is verified.
>
> **Children:** The app is not directed at children under 13.
>
> **Contact:** <your-email>
>
> **Changes:** We will update this page if our data practices change.

*Note: Have a lawyer review this; it is a draft, not legal advice.*

### 6.2 Data safety form answers (Android / LOCAL_ONLY build)

- Does your app collect or share any of the required user data types? **No** (for the Android local-only build).
- Is all user data collected by your app encrypted in transit? **N/A — no data collected.** (If cloud mode is enabled later, answer Yes — HTTPS only.)
- Do you provide a way for users to request that their data be deleted? **Yes** (web deletion URL; Android stores data only on-device, uninstalling removes it).
- Location: not collected; processed on-device. Disclose in the form's "Data types" as "not collected" but mention in the privacy policy.
- If a future build enables Supabase on Android, redo this section and declare: email/identifiers (collected, for auth), user content (stored), encrypted in transit (yes), deletion (yes).

### 6.3 Permission declaration texts (Play Console forms)

**SCHEDULE_EXACT_ALARM — "Alarms & reminders"**  
"Al-Rabbaniyyun is a local Islamic companion app. Its core feature is alerting the user at the exact start time of each of the five daily prayers (adhan). Prayer times are computed on-device from the user's chosen location and time zone. A delay of even a few minutes under Doze can cause the user to miss the prayer. The app declares SCHEDULE_EXACT_ALARM (not USE_EXACT_ALARM). Before scheduling, it calls AlarmManager.canScheduleExactAlarms(); if denied, it shows an in-app explanation and opens the system 'Alarms & reminders' settings screen. If the user declines, the app falls back to setAndAllowWhileIdle inexact scheduling and informs the user that alerts may be slightly delayed. Alarms are only armed for prayers enabled by the user and can be disabled at any time."

**POST_NOTIFICATIONS**  
"Used for prayer alerts, pre/post-prayer reminders, and personal worship reminders. Requested only after an in-app explanation, when the user enables prayer alerts or reminders — not on first launch."

**ACCESS_FINE_LOCATION / ACCESS_COARSE_LOCATION**  
"Used only on the device to determine prayer times (via the user's chosen location), Qibla direction, and nearby mosques from a bundled offline dataset. Location is not uploaded to any server. The user can also choose a city manually instead of GPS."

**RECEIVE_BOOT_COMPLETED**  
"Restores scheduled prayer alarms and local reminders after reboot, time-zone change, time change, app update, or exact-alarm permission change. Only strictly-future alarms are re-armed."

**FOREGROUND_SERVICE / FOREGROUND_SERVICE_MEDIA_PLAYBACK**  
"When a prayer alarm fires for a prayer configured with full adhan, a bounded mediaPlayback foreground service plays the user-selected bundled adhan MP3 locally via MediaPlayer with USAGE_ALARM, shows a non-removable notification with a Stop action, holds a bounded partial wake lock, and auto-stops after 6 minutes. If exact alarms are not granted, the receiver falls back to a high-importance notification bound to the selected raw audio."

**No declaration needed for:** WAKE_LOCK (standard), INTERNET (standard).

**Screen recordings Google may ask for (30–60 s each):**
1. Prayer settings with alerts enabled + adhan voice selected; exact-alarm explanation opening the system "Alarms & reminders" screen; granting it.
2. Scheduled adhan firing on a locked screen, playing the selected adhan, with the "Stop adhan" notification action.
3. Disabling prayer alerts in settings.
4. Location permission prompt → nearby mosques list (offline) → "location stays on your device" pill.
5. Qibla compass working without network.
6. Account deletion flow (web) — if cloud mode is enabled.

### 6.4 Store listing drafts

**App name (≤30 chars):**  
AR: الربانيون — أذكار وقرآن  
EN: Al-Rabbaniyyun — Quran & Adhkar

**Short description (≤80 chars):**  
AR: رفيقك اليومي للصلاة والقرآن والأذكار والQibla، يعمل بلا اتصال.  
EN: Your daily companion for prayer, Quran, adhkar and Qibla — works offline.

**Full description (AR):**  
"الربانيون تطبيق إسلامي محلي يعمل بلا اتصال: أوقات الصلاة وأذان قابل للتخصيص، قارئ قرآن (خط كوفي مخصص) مع إشارات مرجعية وملاحظات وتقدم، أذكار الصباح والمساء، Qibla، مساجد قريبة (بيانات غير متصلة)، تلاوة وصوت، تخطيط يومي وأهداف. لا يتطلب حسابًا ولا يجمع بياناتك. موقعك يبقى على جهازك. без إعلانات."

**Full description (EN):**  
"Al-Rabbaniyyun is an offline-first Islamic companion: prayer times with customizable adhan, a Quran reader (custom Hafs font) with bookmarks, notes and progress, morning/evening adhkar, Qibla, nearby mosques (offline data), audio recitation, daily planning and goals. No account required, no data collection. Your location stays on your device. No ads."

**Category:** Lifestyle (or Books & Reference).  
**Content rating:** Everyone (with religious content).  
**Target audience:** 13+ (not directed at children).  
**Ads:** None.  
**Contact email:** <your-email>.  
**Privacy policy URL:** https://<your-domain>/privacy.

### 6.5 Tester recruitment plan (12 testers × 14 days)

- Recruit 12–15 Arabic-speaking testers (friends, family, mosque community, online Islamic groups) who own Android devices on Android 10+.
- Send them the closed-test opt-in link from Play Console; instruct them to remain opted in for 14 consecutive days.
- Provide a written test script (install, notification permission, location, prayer alarm + adhan stop, Qibla, nearby mosques offline, Quran audio, theme switch, reboot restore).
- Collect feedback via a shared WhatsApp/email thread; log bugs; fix; re-upload AAB.
- After 14 days with ≥12 opted-in testers, apply for production access and summarize: recruitment ease, feature usage vs. expected, feedback themes, changes made, readiness determination.

---

## 7. What only YOU can verify (not the AI)

- Real-device testing: predictive back, edge-to-edge, alarm firing under Doze, reboot restore, offline mosques, audio focus, OEM battery optimization (Xiaomi/Huawei/Samsung).
- Play Console screens: account type/verification, data safety form, content rating, target audience, permission declarations, pre-launch report.
- Legal/licensing: Quran font/text rights (KFGQPC — confirm redistribution terms), hadith source licensing (must be resolved before shipping hadith), adhan audio recordings (confirm the reciters' recordings may be redistributed), mosque data (OSM ODbL attribution already present — confirm).
- Whether a lawyer should review: the privacy policy, terms of use, and any donation/monetization terms. This AI draft is not legal advice.
- Whether the app should target children (families policy) — a product/legal decision.

---

## 8. Final go / no-go

**CONDITIONAL GO** as of 2026-11-21. The four original blockers are resolved in the codebase (see §1.0): the hadith data is licensed (Unlicense), the privacy policy exists and is linked in-app, Android creates no accounts (the web deletion page is provided), and the mobile bundle no longer ships the 122 MB of book PDFs (~45.9 MB of assets). A previously undiscovered `aapt2` build failure (missing `colors.xml`) was fixed, and the app no longer sends device coordinates to a prayer-times API.

Release still requires external steps that cannot be done in the repository: deploy the two HTML pages, configure the signing secrets, complete the Play Console declarations, and pass the closed test. After that: pre-launch report → staged production rollout.
