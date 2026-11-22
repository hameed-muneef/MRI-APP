
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