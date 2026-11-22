
### MOBILE-LOCATION-PERMISSION — إذن الموقع (تقريبي) في أندرويد (2026-11-22)
- **المشكلة**: على أندرويد، طلب geolocation في WebView كان يطلب `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` معًا؛ وبما أن `ACCESS_FINE_LOCATION` مُزال من Manifest (الدقة التقريبية فقط)، كان `granted=false` في `permissionCallback` (الذي يتطلب نجاح كل الأذونات) على Android 11 وما دون، فتُرفض geolocation حتى مع منح التقريبي. كما لم تكن هناك معالجة «مرفوض بشكل دائم» أو فتح إعدادات التطبيق، ولم يكن هناك استخدام أصلي لـ `@capacitor/geolocation`.
- **الحل**:
  - إضافة `@capacitor/geolocation@8.2.5` (4 إضافات الآن) و`cap sync`؛ إضافته لا تُضيف `ACCESS_FINE_LOCATION` إلى Manifest (يبقى coarse-only).
  - مُساعد موحّد `src/lib/device-location.ts` (check/request/openSettings) يطلب `permissions: ['coarseLocation']` على native وgeolocation API على web، مع `enableHighAccuracy:false`.
  - تحديث `useGeolocation`, `usePrayerTimes`, `PrayerLocationPicker`, `useNearbyMosques` لاستخدام المُساعد بدل `navigator.geolocation` مباشرة.
  - معالجة `denied` / `permanently-denied` (بناءً على حالة `hasAskedLocation`) مع rationale و زر «فتح إعدادات التطبيق» في شاشات المساجد، القبلة، ومنتقي المدينة.
  - Location persisted via localStorage/app-state; notifications reschedule on prayerLocation change (existing App.tsx effect).
  - Manual city/country fallback kept in MosquesScreen and QiblaScreen.
- **الملفات**: `src/lib/device-location.ts`, `src/hooks/useGeolocation.ts`, `src/hooks/useNearbyMosques.ts`, `src/usePrayerTimes.ts`, `src/PrayerLocationPicker.tsx`, `src/features/qibla/QiblaScreen.tsx`, `package.json`, `android/app/src/main/assets/capacitor.plugins.json`.
- **التحقق**: `npx tsc --noEmit` ناجح؛ `npm run test:unit` 102/102؛ `npm test` 148/148؛ `npm run build:android` ناجح مع `@capacitor/geolocation@8.2.5` مُسجّل؛ e2e mosques 8/8 وqibla 4/4 ناجحة.
- **غير متحقق على جهاز**: dialog الإذن الأصلي، مسار «مرفوض بشكل دائم» + فتح الإعدادات، دقة التقريبي على أجهزة حقيقية، وإعادة الجدولة بعد تغيير الموقع.

### MOBILE-QIBLA-ACCURACY — دقة القبلة (بوصلة أصلية) (2026-11-22)
- **المشكلة**: على Android WebView، حدث `deviceorientation` قد يكون نسبيًا (وليس مطلقًا) → اتجاه خاطئ؛ دقة البوصلة غير متحقق منها. التصحيح (declination) كان يُطبق via مكتبة `geomagnetism` (WMM) على web.
- **الحل**:
  - إضافة `CompassPlugin.java` (TYPE_ROTATION_VECTOR / GEOMAGNETIC_ROTATION_VECTOR) مع تصحيح declination via `android.hardware.GeomagneticField` (شمال حقيقي).
  - تسجيل الإضافة في `MainActivity`؛ واجهة TS `src/lib/native-compass.ts`.
  - تحديث `useCompassHeading` لاستخدام مزود أصلي على native (مع fallback إلى WebCompassProvider)، وتجنب تطبيق declination مرتين (source === 'native').
  - تمرير pitch/roll من native لفحص «tooTilted».
- **الملفات**: `android/app/src/main/java/com/alrabbaniyoon/app/CompassPlugin.java`, `android/app/src/main/java/com/alrabbaniyoon/app/MainActivity.java`, `src/lib/native-compass.ts`, `src/hooks/useCompassHeading.ts`.
- **التحقق**: `npx tsc --noEmit` ناجح؛ `npm run test:unit` 102/102؛ `npm run build:android` ناجح. تجميع Java غير مُتحقق محليًا (لا JDK) — يُترك لـ CI.
- **غير متحقق على جهاز**: دقة heading على أجهزة حقيقية، معايرة (figure-8)، سلوك عند غياب المستشعر.

### MOBILE-AUDIO-LOADING-FIX — إصلاح تعذر تحميل صوت القرآن والأذكار في APK (2026-11-22)
- **المشكلة**: عند تشغيل صوت القرآن أو الأذكار في تطبيق APK على أندرويد، كان المشغّل يُظهر «تعذر تحميل المقطع الصوتي» / «تعذر تشغيل الصوت» بسبب تمرير روابط الشبكة مباشرة إلى `MediaPlayer.setDataSource(url)` على الخيط الرئيسي عبر `MediaHTTPConnection` بدون ترويسات HTTP أو متابعة لإعادة التوجيه أو تخزين مؤقت محلي، إضافةً إلى غياب دعم أصول `/sounds/...`، وغياب `playSingle` في `BackgroundAudioPlugin.java`، وعدم وجود fallback تلقائي إلى WebView عند فشل المشغّل الأصلي.
- **الحل**:
  - تحديث `BackgroundAudioService.java` لتنزيل المقاطع غير المباشرة (حتى 25 ميجابايت وبسقف تخزين مؤقت 60 ميجابايت في `audio_cache`) على خيط خلفي عبر `HttpURLConnection` مع متابعة التحويلات (`http`/`https`) وترويسات `User-Agent`/`Accept` وتشغيلها محليًا عبر `FileInputStream.getFD()`، ودعم أصول `/sounds/...` عبر `AssetFileDescriptor`.
  - إضافة `playSingle` في `BackgroundAudioPlugin.java` وتمرير قوائم التشغيل عبر مخزن مؤقت بالذاكرة لتجنّب `TransactionTooLargeException` مع القوائم الطويلة.
  - إضافة fallback تلقائي في `src/audio/background-player.ts` إلى WebView `HTMLAudioElement` إذا أبلغت الخدمة الأصلية عن خطأ، وتوحيد تطبيع الروابط في `src/quran/audio.ts` و`src/quran/ayah-audio.ts` وإصلاح رابط اختبار القرآن في `src/views/AudioDiagnostics.tsx`.
- **التحقق**: `npm test` (148/148)، `npm run test:unit` (112/112 شاملة `src/audio/native-fallback.test.ts`)، `tsc --noEmit`، و`vite build` ناجحة جميعها. تجميع Java/Gradle يعتمد على بيئة CI/Android SDK (لا يتوفر JDK محليًا).
- **غير متحقق على جهاز**: إعادة بناء APK وتجربة تشغيل القرآن والأذكار والبث المباشر فعليًا على هاتف أندرويد.

### MOBILE-ADHAN-UNIQUE-VOICES — فك تشابك أصوات المؤذنين وحفظ ملفات الأذان المتعددة (2026-11-22)
- **المشكلة**: كانت الواجهة تعرض 6 أسماء مؤذنين مختلفين، لكن `adhan-catalog.ts` و`sound-selection.ts` كانت تربط 4 أسماء منها بملف واحد (`adhan_almulla.ogg`) واسمين بملف (`adhan_madinah.ogg`) مع وجود ملفين فقط في `public/sounds/adhan/` و`android/app/src/main/res/raw/` (بالإضافة لغياب `takbeerat_eid.ogg`). كما كان رفع أذان خارجي جديد من الجهاز في `AdhanPlayer` يكتب فوق خانة واحدة (`adhan:active`) ويمسح الملف السابق.
- **الحل**:
  - تجهيز وتحويل تسجيلات أصلية مستقلة بصيغة OGG Vorbis لجميع المؤذنين الستة (`adhan_almulla.ogg`, `adhan_ahmad.ogg`, `adhan_madinah.ogg`, `adhan_madinah2.ogg`, `adhan_mohammed.ogg`, `adhan_hamad.ogg`) داخل `public/sounds/adhan/` و`android/app/src/main/res/raw/`، وإضافة `takbeerat_eid.ogg` داخل `public/sounds/adhan/` فقط مع بقائها معزولة عن منبهات الصلوات.
  - تحديث `src/sounds/adhan-catalog.ts` و`src/notifications/sound-selection.ts` لربط كل مؤذن بملفه المستقل 1-إلى-1.
  - إضافة `listCustomAdhans()` و`saveCustomAdhanEntry()` في `src/sounds/custom-store.ts` وتحديث `src/views/AdhanPlayer.tsx` لدعم إضافة وتشغيل وحذف عدة ملفات أذان خارجية من الجهاز دون استبدال الملفات السابقة.
- **الملفات**: `public/sounds/adhan/*.ogg`, `android/app/src/main/res/raw/adhan_*.ogg`, `src/sounds/adhan-catalog.ts`, `src/notifications/sound-selection.ts`, `src/sounds/custom-store.ts`, `src/views/AdhanPlayer.tsx`, `src/sounds/adhan-catalog.test.ts`, `tests/sound-selection.test.mjs`, `src/views/notifications/NativeAdhanPanel.tsx`.
- **التحقق**: يتم تشغيل `npm test` و`npm run test:unit` و`tsc --noEmit` و`vite build` بعد آخر تعديل، والتحقق من تفرّد بصمات SHA-256 لجميع ملفات `.ogg` الستة.
- **غير متحقق على جهاز**: إعادة بناء APK (`npm run build:android` + Gradle/CI) لاختبار سماع كل مؤذن في منبه النظام على هاتف أندرويد فعليًا.

### MOBILE-WEBVIEW-AUDIO-PATH-SAFETY — معالجة مسارات الصوت والتحميل الآمن في WebView ومشغل الخلفية (2026-11-22)
- **المشكلة**:
  1. تمرير مسارات WebView المحلية (`https://localhost/...`، `/_capacitor_file_/...`، `file:///android_asset/public/...`، أو مسارات نسبية بدون `/` أو بعلامات استفهام) إلى `BackgroundAudioService` كان يسبّب محاولة اتصال فاشلة بـ `localhost` أو `FileNotFoundException`، بينما تمرير `file:///...` أو `http://` إلى WebView (`allowMixedContent: false`) أو الاعتماد على استجابات `206 Range` في `WebViewLocalServer` (التي لا تتجاوز الإزاحة `fromRange`) يسبّب فشل التشغيل (`تعذر التحميل`).
  2. عدم وجود مرآة احتياطية تلقائية لروابط الأذكار (`raw.githubusercontent.com`) أو تمرير روابط `blob:` مباشرة للويب دون استهلاك محاولات فاشلة في الخدمة الأصلية.
- **الحل**:
  - إنشاء `src/audio/url-resolver.ts` لتطبيع وفحص أمان مسارات الصوت (`resolveAudioUrlForWeb`, `resolveAudioUrlForNative`, `expandAudioFallbackUrls`, `loadLocalAudioObjectUrlForWebView`) مع تحويل مسارات الجهاز عبر `Capacitor.convertFileSrc`، ترقية `http://` إلى `https://` في WebView، رفض المخططات غير الآمنة، وتحميل الأصول المجمّعة في Capacitor كـ `Blob` لتفادي قصور Range في `WebViewLocalServer`.
  - تحديث `src/audio/background-player.ts` و`src/audio/types.ts` و`src/audio/native-bridge.ts` لدعم `fallbackUrls` وتوجيه روابط `blob:`/`data:` للويب مباشرة والانتقال التلقائي إلى المرايا البديلة عند تعذر المصدر الأساسي.
  - تحديث `BackgroundAudioService.java` لفك عناوين `localhost` / `_capacitor_file_` / `file:///android_asset/public/` / `content://` / مسارات الملفات الحقيقية ودعم `fallbackUrls` في الخدمة الخلفية، مع رفض الردود النصية/XML الخاطئة.
  - تحديث `src/azkar/content.ts` و`src/views/AzkarLibrary.tsx` (بمرآة `cdn.jsdelivr.net`)، و`src/quran/audio.ts` و`src/quran/ayah-audio.ts` و`src/views/quran/QuranReader.tsx`، ومشغلات المعاينة في `src/notifications/audio.ts` و`src/notifications/delivery.ts` و`src/views/AdhanPlayer.tsx` و`src/views/SettingsView.tsx`.
- **التحقق**: اختبارات `src/audio/url-resolver.test.ts` و`src/audio/native-fallback.test.ts` و`npm test` و`npm run test:unit` و`tsc --noEmit` و`vite build`.
- **غير متحقق على جهاز**: إعادة بناء APK (`npm run build:android` + Gradle/CI) وتجربة مسارات الصوت المحلية والخارجية والأذكار والقرآن على هاتف فعلي.