
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
- **التحقق**: تم نقل وفحص تسجيلات الأذان الحقيقية السبعة (الملا، أحمد العمادي، الحرم المدني، الحرم المدني 2، محمد رمضان، حمد الدغريري، وتكبيرات العيد) المرفوعة من المستخدم بصيغة OGG في المجلدات المناسبة (`public/sounds/adhan/` و`android/app/src/main/res/raw/` مع إبقاء تكبيرات العيد في الويب فقط)، والتأكد من تفرّد بصمات SHA-256 ومطابقتها بين الويب والأندرويد، وتنظيف الملفات المؤقتة من `src/sounds/`؛ واختبار `npm run test:unit` (121/121 ناجحة بما فيها `adhan-catalog.test.ts`)، و`npm run lint` (`tsc --noEmit` ناجح)، و`npm run build:android` ناجح ومزامنة Capacitor مكتملة.
- **غير متحقق على جهاز**: إعادة بناء APK (عبر Gradle/CI) لاختبار سماع كل مؤذن في منبه النظام على هاتف أندرويد فعليًا.

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

### HADITH-CARD-UNIFIED-COLOR — توحيد ألوان بطاقات أحاديث البخاري ومسلم ومنع التشتيت (2026-11-23)
- **المشكلة**: كانت بطاقات الأحاديث في صحيح البخاري وصحيح مسلم تتناوب بين ثلاثة ألوان مختلفة (عسلي/ذهبي، وأخضر، وأزرق) عبر قواعد `li:nth-child(3n+1)`, `(3n+2)`, `(3n)` في `src/ui-hardening.css`، وكذلك أزرار أبواب الكتاب، مما كان يسبب تشتيتًا بصريًا وضعفًا في تركيز القارئ.
- **الحل**:
  - إزالة التلوين المتناوب (`nth-child(3n)`) لبطاقات الأحاديث وقوائم الأبواب من `src/ui-hardening.css`.
  - تطبيق لون موحد، هادئ ومريح للعين لكل بطاقات الأحاديث: خلفية ورقية إسلامية دافئة (`#FCFAF6`)، حد ناعم (`#E2DDD3`)، وخط تمييز جانبي بلون الغابة الوقور (`#1C6650`) في الوضع النهاري، وخلفية موحدة هادئة (`#182823`) مع حد متناسق (`#2F4D42`) وخط تمييز هادئ (`#57A388`) في الوضع الليلي.
  - توحيد ألوان بطاقات أبواب الكتاب بالنمط المتناسق نفسه.
- **الملفات**: `src/ui-hardening.css`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: `npm run lint` (`tsc --noEmit` ناجح)، `npm run test:unit` (121/121 ناجحة)، و`npm run build` ناجح لإنتاج حزمة الويب وتحديث Service Worker بنجاح.

### QURAN-RECITERS-244-OFFLINE-DOWNLOAD — توسيع مكتبة القراء (٢٤٤+ قارئ) مع البث المباشر والتحميل للموبايل (2026-11-23)
- **المشكلة**: كانت الواجهة تقتصر على قائمة قصيرة ثابتة (١٢ قارئًا)، مع غياب خيار تصفح أكبر عدد من القراء المشهورين بمختلف الروايات (حفص، ورش، قالون...)، وعدم توفر تنزيل السور داخل التطبيق على الموبايل للعمل دون إنترنت.
- **الحل**:
  - إنشاء فهرس محلي مضغوط `public/quran/reciters.json` يضم ٢٤٤+ قارئًا بجميع مصاحفهم ورواياتهم من MP3Quran v3 (`~141 KB`، `~10.6 KB` gzip)، مع تضمينه في PWA `includeAssets` وتحديثه تلقائيًا في الخلفية عند توفر الإنترنت (`src/quran/audio.ts`).
  - توسيع تلاوة الآيات الفردية في `src/quran/ayah-audio.ts` لتغطية ٢٦ قارئًا مشهورًا عبر Quran.com API v4 + مصادر EveryAyah.com المُتحقَّق منها.
  - إضافة مدير التنزيل دون إنترنت `src/quran/offline-audio.ts` لحفظ التلاوات على أندرويد مباشرة في `filesDir/offline_quran_audio/` عبر إضافات أصلية في `BackgroundAudioPlugin.java` / `BackgroundAudioService.java` (بحيث لا تُحذف مع ذاكرة التخزين المؤقت وتعمل في الخلفية وشاشة القفل بلا إنترنت)، وفي Cache Storage (`rabbani-quran-audio-v1`) على الويب وPWA.
  - إنشاء واجهة `src/views/quran/RecitersAudioLibrary.tsx` وربطها بكل من نافذة المصحف (`MushafPages.tsx`) وتبويب مستقل «مكتبة القراء والتلاوات» في `QuranSunnahView.tsx` مع البحث السريع وتحديد نطاق التنزيل (السورة الحالية / سورة محددة / جزء عمّ / المفصّل / المصحف كاملًا) والترحيل من التفضيل القديم `quran-reciter-id`.
- **الملفات**: `public/quran/reciters.json`, `src/quran/audio.ts`, `src/quran/ayah-audio.ts`, `src/quran/offline-audio.ts`, `src/audio/native-bridge.ts`, `src/audio/background-player.ts`, `src/views/quran/RecitersAudioLibrary.tsx`, `src/views/quran/MushafPages.tsx`, `src/views/QuranSunnahView.tsx`, `src/mushaf.css`, `src/ui-hardening.css`, `vite.config.ts`, `android/app/src/main/java/com/alrabbaniyoon/app/BackgroundAudioPlugin.java`, `android/app/src/main/java/com/alrabbaniyoon/app/BackgroundAudioService.java`, `src/quran/audio.test.ts`, `src/quran/offline-audio.test.ts`, `tests/e2e/reciters.spec.ts`.
- **التحقق**: `tsc --noEmit` ناجح؛ `npm run build` ناجح؛ `npm run test:unit` 129/129 (شاملة `audio.test.ts` و`offline-audio.test.ts`)؛ `npm run quran:check` و`npm run prayer:check` ناجحان؛ اختبارات الثيم والأقسام والقارئ `node --test` (18/18) ناجحة؛ اختبارات Playwright على الجوال `tests/e2e/reciters.spec.ts` و`tests/e2e/mobile-app-full.spec.ts` (3/3) ناجحة شاملة العرض الداكن على 320px والبحث والتحميل دون إنترنت؛ ومزامنة Capacitor (`npx cap sync android`) تؤكد وجود `android/app/src/main/assets/public/quran/reciters.json`.
- **غير متحقق على جهاز (يتطلب Gradle/JDK وجهاز أندرويد فعلي)**: تجميع تعديلات `BackgroundAudioPlugin.java` / `BackgroundAudioService.java` داخل APK، والتحقق على الهاتف من تنزيل السور إلى `filesDir/offline_quran_audio/` وتشغيلها في الخلفية وشاشة القفل أثناء وضع الطيران.

### QURAN-RECITERS-MOBILE-SHEET-POLISH — تنسيق مكتبة القراء للجوال وتحويل النافذة إلى ورقة سفلية متناسقة (2026-11-23)
- **المشكلة**: عند فتح نافذة القراء والتحميل من داخل شاشة المصحف، كانت تظهر كصندوق كبير مزدوج العناوين وبعناصر تحكم متكدسة تدفع أول قارئ لأسفل الشاشة وتُصعّب التمرير والإغلاق على شاشات الجوال الضيقة (320–375px).
- **الحل**:
  - تحويل نافذة القراء داخل `MushafPages.tsx` إلى **ورقة سفلية كاملة العرض للجوال** (`mf-sheet-reciters`) برأس ثابت (مقبض سحب + عنوان واحد واضح + زر إغلاق `X` بحجم 44px) وجسم تمرير داخلي معزول، مع إزالة العنوان التمهيدي المكرر عبر خاصية `compact` في `RecitersAudioLibrary.tsx` ليظهر القراء فورًا دون تمرير.
  - تبسيط أدوات التصفية والتحميل: مربع بحث مع زر مسح (`X`)، وتبويبات أفقية بصف واحد قابل للسحب، وشرائح اختيار نطاق التحميل في صف واحد (`السورة الحالية` / `جزء عمّ` / `المفصّل` / `المصحف كاملًا` / `سورة محددة`) مع ظهور منتقي السورة فقط عند اختيار `سورة محددة`.
  - إعادة تصميم بطاقة القارئ (`reciter-card`) لتكون أنظف وأخف على الجوال: منتقٍ مضمّن للرواية عند تعدد المصاحف، ووسوم مختصرة دون ازدحام، وزرا إجراء متناسقان بارتفاع 44px (`استماع الآن` و`تحميل`/`مكتمل`/`إيقاف`).
  - توسيع تغطية `tests/e2e/reciters.spec.ts` للتحقق من أبعاد الورقة السفلية على 320px في الوضع الداكن وظهور أول بطاقة قارئ فوق الطيّ وتباين الأزرار وانعدام التمرير الأفقي.
- **الملفات**: `src/views/quran/RecitersAudioLibrary.tsx`, `src/views/quran/MushafPages.tsx`, `src/mushaf.css`, `src/ui-hardening.css`, `tests/e2e/reciters.spec.ts`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: `compile_applet` (`tsc -b && vite build`) و`lint_applet` (`tsc --noEmit`) ناجحان؛ `npm run test:unit` (129/129) ناجح؛ `node --test tests/section-theme.test.mjs tests/quran-reader.test.mjs tests/theme-engine.test.mjs` (18/18) ناجحة؛ `npm run quran:check` و`npm run prayer:check` ناجحان؛ Playwright `tests/e2e/reciters.spec.ts` و`tests/e2e/mobile-app-full.spec.ts` (3/3) ناجحة؛ و`npm run build:android` (مع `npx cap sync android`) ناجح.
- **غير متحقق على جهاز**: فتح نافذة القراء وتجربة السحب/اللمس الفعلي داخل WebView على هاتف أندرويد بعد بناء APK عبر Gradle/CI.


### QURAN-MASTERY-PHASE6-PREPARATION (2026-11-23)
- Added local per-ayah audio pack management, cold-offline resolution cache, production Quran precache, session-safe update behavior and bounded native review summaries with reconciliation.
- Current local verification: 256 unit tests, 173 Node tests, typecheck, build and Quran manifest integrity pass. Four offline browser cases pass mobile/desktop, including a complete daily session with synthetic downloaded sound and no network. This does not validate real recitation quality or physical Android behavior.
- Phase5 content gate remains open. Phase6 device demonstration and final Phase7 accessibility/performance/device matrix remain open. No merge, signing or release.

### QURAN-MASTERY-REVIEW-CODE-HANDOFF (2026-11-23)
- Draft PR9 stacks on Phase4, with approved external-reference interim, offline pack management and native reminder reconciliation. No merge/release.
- Fetched review code86c36c7:257 unit,173 Node,82 browser cases in bounded batches plus4 theme/viewport checks; TypeScript, production build, source checksum and unsigned Android compile pass. Real-source downloaded first-ayah playback passed after production cold offline reload.
- Embedded authorized reviewed Tajweed lessons/exercises remain incomplete. Physical Android microphone/call/background/audio/notifications, actual screen reader and user content/release review remain open. Full matrix in QURAN_MASTERY_PHASE7.md.

### BILQURAN-HIFZ-PLANS — خطط الحفظ والمراجعة (منهج بالقرآن نحيا) داخل مصحف الحفظ والإتقان (2026-11-24)
- **الميزة**: إضافة مسارات وخطط منهج «بالقرآن نحيا» الثلاثة (`للمبتدئين`: ١٠/١٤/٢٦/٤٨ شهرًا، و`من البقرة`: ٥ إلى ٢٧ شهرًا، و`من الناس`: ٦/١٠/١٩ شهرًا) مباشرة داخل `مصحف الحفظ والإتقان` مع إمكانية اختيار أي خطة ومن أي اتجاه (`من البقرة ← الناس` أو `من الناس ← البقرة`)، ومعاينة الجدول اليومي الكامل، وتتبع التقدم التلقائي ومراجعة ربط الأسبوع.
- **الملفات**: `src/quran-mastery/bilquran-plans.ts`, `src/views/quran/BilQuranPlansBrowser.tsx`, `src/views/quran/HifzMushafMode.tsx`, `src/views/quran/QuranPlansCard.tsx`, `src/home-cards.css`, `src/quran-mastery/bilquran-plans.test.tsx`.
- **التحقق**: `npm run test:unit` (42 ملف / 313 اختبارًا ناجحًا)، `npm run quran:check` ناجح، `tsc --noEmit` ناجح، و`vite build` ناجح.

### NOTIF-SOUND-AND-MUEZZINS-FIX — إصلاح التنبيهات الصوتية والأذان وإضافة 6 مؤذنين جدد (2026-11-26)
- **المشكلة**:
  1. فشل تشغيل الأصوات على متصفحات الويب والجوال بسبب استدعاء `.then()` قبل `audio.play()` (كسر صلاحية تفاعل المستخدم)، وتشغيل نغمات Web Audio قبل اكتمال `ctx.resume()`، واستدعاء `requestBrowserPermission()` من الخلفية أثناء إطلاق المنبهات.
  2. افتقاد توجيه القنوات في المهام والتذكيرات الأصلية للأصوات الصامتة أو أصوات الأذان، وإرسال `NotificationCompat.DEFAULT_ALL` في `AdhanAlarmReceiver` وخطأ `ACTION_CHANNEL_NOTIFICATION_SETTINGS` في `BackgroundAudioPlugin`، وعدم دمج مواقيت الصلاة المحسوبة تلقائيًا في سياق مهام التنبيهات ومؤشر `LiveNotifications`.
  3. الاقتصار على 6 مؤذنين فقط دون مؤذنين إضافيين مطلوبين في القائمة.
- **الحل**:
  - **إضافة 6 مؤذنين جدد مع الإبقاء على الستة الحاليين وتكبيرات العيد**: `مشاري راشد العفاسي` (`adhan_alafasy.ogg`)، `ناصر القطامي` (`adhan_qatami.ogg`)، `ماجد الهمثاني` (`adhan_hamathani.ogg`)، `فاروق حضراوي (الحرم المكي)` (`adhan_hadrawi.ogg`)، `حسان زبيدي (الحرم المكي)` (`adhan_zubaidi.ogg`)، و`أذان المسجد الأقصى` (`adhan_aqsa.ogg`) متطابقة بين `public/sounds/adhan/` و`android/app/src/main/res/raw/` ومُعرّفة في `adhan-catalog.ts`, `sound-selection.ts`, `NativeAdhanStore.java`, `SettingsOpenerPlugin.java`, و`vite.config.ts`.
  - **إصلاح محرك الصوت والإشعارات**: فتح قفل الصوت (`installAudioUnlockListeners`/`unlockAudioPlayback`/`unlockBuiltInAudioContext`)، التشغيل المتزامن على الويب، إزالة طلب الإذن التلقائي غير الآمن في `delivery.ts`، توجيه القنوات عبر `resolveNativeReminderChannel` و`ensureChannelsForSounds`، تصحيح `AdhanAlarmReceiver` و`BackgroundAudioPlugin`، ودمج المواقيت المحسوبة في `App.tsx` و`SettingsView.tsx` و`LiveNotifications.tsx`.
  - **تحسين واجهة الإشعارات وأزرار التجربة**: عرض حالة إذن المتصفح في `PermissionStatus` و`PrayerNotifications` مع أزرار تفعيل وتجربة وإيقاف مباشرة في لوحات الأذان والمهام والمنبهات الشخصية والإعدادات العامة.
- **التحقق**: تحديث `adhan-catalog.test.ts`، `sound-selection.test.mjs`، `sound-library.test.tsx`، وإضافة `audio-playback.test.ts`؛ واجتياز `npm run test:unit`، `npm test`، `compile_applet`، و`lint_applet`.

### LIGHT-BLUE-WHITE-CARDS-2026 — توحيد الوضع النهاري بالأبيض والأزرق مع إطار موحّد 1.5px ولمسات جمالية متناسقة (2026-11-27)
- **التحديث**:
  - مزامنة آخر تحديثات فرع `main` كاملةً (`ed3eabc`) إلى مساحة العمل.
  - توحيد الوضع النهاري (`data-theme="light"`) بخلفية بيضاء هادئة (`#F8FAFE`) وكروت بيضاء نقية (`#FFFFFF`) مع **إطار أزرق موحّد بسمك `1.5px` (`#528AC7`)** حول البطاقة فقط دون أشرطة جانبية سميكة ودون تعدد الألوان الستة.
  - تنسيق **البار العلوي (`.topbar`) والبار السفلي (`.mobile-nav`)** في الوضع النهاري بنفس اللغة البيضاء والزرقاء: خلفية بيضاء زجاجية ناصعة مع خط إطار أزرق `1.5px solid #528AC7`، وأزرار أيقونات وشريحة المستخدم بإطار أزرق وأيقونات `#1B5694`، وتبويب نشط أزرق جليدي `#EEF5FC` بإطار `1.5px solid #528AC7` (وزر الإعدادات النشط `#1B5694` بأيقونة بيضاء).
  - إضافة لمسات جمالية متناسقة ضمن ثلاثية الألوان الهادئة (أزرق ملكي `#1B5694`، تيل بحري `#136F75` للقرآن والعبادات، ذهبي دافئ `#8F6210` للإنجاز والحرمين والتنبيهات)، وتنسيق حالات المهام وأشرطة التقدم (أزرق للقادم، عسلي للقريب الآن، زمردي للمنجز، مرجاني للمتأخر) وتدرج أبيض ثلجي لطيف لبطاقات «المدرّب» والتاريخ، مع إبقاء ورق المصحف مريحًا للقراءة.
  - **الإبقاء على الوضع الليلي (`data-theme="dark"`) كما هو دون أي تغيير** بناءً على طلب المستخدم.
- **الملفات**: `src/design-tokens.css`, `src/accent-cards.css`, `src/home-premium.css`, `src/daytime-palette.css`, `src/tasks-nextup.css`, `src/appearance.ts`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.
- **المتبقي**: معاينة التطبيق بصريًا في المتصفح/الهاتف للتأكد من ملاءمة الألوان على الشاشة الفعلية.

### TODAY-TASKS-REPORT-EDIT-VIEW — عرض مهام اليوم كتقرير مختصر مع زر تعديل بالقلم (2026-11-27)
- **التحديث**:
  - تحويل بطاقات شاشة «مهام اليوم» (`TodayTasksView.tsx`) إلى **تقرير يومي مختصر** يعرض اسم المهمة، والوقت المجدول وحالته (`مؤكد`/`مبدئي`/`بلا وقت محدد`)، وحالة المنبه/الصامت، وشارة «الأقرب الآن»، والمصدر، مع زر «إنجاز» وزر القلم `✏️` للتعديل (وبالإبقاء على أزرار بدء المقرر/التسميع لمهام القرآن).
  - عند الضغط على أيقونة القلم `✏️` تتمدد البطاقة نفسها (بطاقة واحدة في كل مرة — Accordion) لتظهر **التصميم التفصيلي الكامل** للتاريخ والوقت والتنبيه المسبق ونمط المنبه وأزرار `حفظ مبدئي` و`تأكيد الجدولة`، وتُطوى تلقائيًا بعد الحفظ أو التأكيد أو تغيير الفلتر.
  - تحديث `tests/e2e/alarm-mode-tasks.spec.ts` لفتح محرر المهمة عبر زر القلم قبل تعديل نمط المنبه.
- **الملفات**: `src/views/TodayTasksView.tsx`, `src/weekly-planning.css`, `src/accent-cards.css`, `tests/e2e/alarm-mode-tasks.spec.ts`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.

### MOSQUES-LIGHT-BLUE-REDESIGN — تحسين تصميم وألوان ونصوص تبويب المساجد في الوضع النهاري (2026-11-27)
- **التحديث**:
  - توحيد تبويب «المساجد القريبة» في الوضع النهاري (`data-theme="light"`) مع الهوية البيضاء والزرقاء وإطار `1.5px` الأزرق (`#528AC7`): إزالة الخلفيات الخضراء والذهبية القديمة، وإزالة الشريط الجانبي `5px` (`::before`) من بطاقات المساجد، واستبدال شارة المسافة الذهبية بشارة ثلجية أنيقة (`#EEF5FC` / `#1B5694`) وأيقونة المسجد بالتيل البحري (`#136F75` على `#EAF6F6`) وزر الخرائط بالأزرق الملكي (`#1B5694`).
  - تبسيط النصوص وتقليل التكرار (اختصار سطر حالة الموقع ووصف الهيدر وإزالة تكرار «خط مستقيم» و«(تقدير)» وسطر عدم الاتصال تحت كل بطاقة)، وطيّ شريط المسافة المخصصة تحت زر «مسافة مخصصة» لإظهار قائمة المساجد أسرع على شاشة الجوال.
  - **الإبقاء على الوضع الليلي (`data-theme="dark"`) كما هو دون تغيير**.
- **الملفات**: `src/features/mosques/MosquesScreen.tsx`, `src/features/mosques/MosqueCard.tsx`, `src/mosques.css`, `src/accent-cards.css`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.

### MOSQUES-ADDRESS-RANK-POLISH — تنقية عناوين المساجد وإبراز رقم الترتيب بجانب الاسم (2026-11-27)
- **التحديث**:
  - إضافة دالة `formatMosqueLocation` (`src/features/mosques/location-format.ts`) لتنقية عناوين المساجد من التكرار ورموز البريد ورموز Plus Codes والنصوص الإنجليزية الزائدة عند توفر وصف عربي، مع حصر السطرين عبر CSS (`-webkit-line-clamp: 2`).
  - نقل شارة ترتيب المسجد في الوضع النهاري من فوق زاوية مربع الأيقونة إلى مربع رقمي هادئ بجانب اسم المسجد (`h3::before` بلون `#EEF5FC` / `#1B5694`) لتبقى الأيقونة واضحة دون تداخل.
- **الملفات**: `src/features/mosques/location-format.ts`, `src/features/mosques/location-format.test.ts`, `src/features/mosques/MosqueCard.tsx`, `src/accent-cards.css`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.

### STRONG-GOALS-LIGHT-REDESIGN — إعادة تصميم صفحة «المؤمن القوي» وأرشيف خطوات الأهداف (2026-11-27)
- **التحديث**:
  - توحيد صفحة «المؤمن القوي» في الوضع النهاري (`data-theme="light"`) مع الهوية البيضاء والزرقاء وإطار `1.5px` الأزرق (`#528AC7`) على شريط الملخص ونموذج الإنشاء وبطاقات الأهداف وبطاقات الفترات وأرشيف الأهداف، **مع إبقاء الوضع الليلي كما هو**.
  - تحويل أعلى الصفحة إلى شريط ملخص مدمج مع طي نموذج إضافة الهدف خلف زر «إضافة الهدف» عند وجود أهداف سابقة، وإضافة شريط تقدم بصري ونسبة مئوية ومعلومات المدة المتبقية على كل بطاقة هدف.
  - إزالة عنوان «ما الذي تعمل عليه الآن؟» واستبدال تكديس البطاقات الخمس بتبويبات فترات واضحة (`خطوات يومية` · `أسبوعية` · `شهرية` · `سنوية` · `خطوات محددة`) فوق بطاقة واحدة منظمة في `GoalPeriodCards`، وإزالة قسم «أرشيف خطوات الأهداف» (`GoalHistory`) من شاشة «المؤمن القوي» لتقليل الازدحام والاكتفاء بسجل كل خطوة داخل بطاقة الهدف وصفحة الإنجاز.
- **الملفات**: `src/StrongGoals.tsx`, `src/GoalPeriodCards.tsx`, `src/views/AchievementView.tsx`, `src/strong-goals.css`, `src/accent-cards.css`, `tests/e2e/goals-flow.spec.ts`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.

### HOME-QURAN-COPY-CLEANUP — تنقيح وصف بطاقة «القرآن والسنة» في الرئيسية (2026-11-27)
- **التحديث**:
  - حذف عبارة «عند اعتماد مصدرها» من وصف بطاقة «القرآن والسنة» في `src/views/HomeView.tsx` لتصبح: «المصحف الشريف، حفظ القرآن ومراجعته، ومكتبة الصحيحين.».
- **الملفات**: `src/views/HomeView.tsx`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`) و`vite build` (`compile_applet`).

### NOTIFICATIONS-UNIFIED-DEVICE-LEVEL — تنبيه موحد بلا فلترة وتفعيل الإشعارات على مستوى الجهاز مع زر إغلاق (2026-11-27)
- **التحديث**:
  - إضافة زر إغلاق مدمج (`×`) أعلى نافذة مركز الإشعارات (`NotificationCenter.tsx`) بتصميم متناسق مع الوضعين النهاري والليلي.
  - إزالة أزرار التصفية (`الكل`، `الصلاة والتذكيرات`، `النظام`) وخيار «عرض غير المقروء فقط» لعرض جميع الإشعارات في قائمة موحدة واحدة دون فلترة.
  - فرض توصيل التنبيهات على مستوى الجهاز (Capacitor `LocalNotifications` على الجوال و`Notification`/ServiceWorker على المتصفح) عبر تصدير `deliverDeviceNotification` في `src/notifications/delivery.ts` وتوحيد قنوات البث الحي في `src/notifications/LiveNotifications.tsx` (الصلوات، التذكيرات، المهام، المراجعة) دون أي مسار يقتصر على داخل التطبيق، مع شريط تفعيل سريع لإذن إشعارات الجهاز داخل مركز الإشعارات عند عدم منحه بعد.
- **الملفات**: `src/views/NotificationCenter.tsx`, `src/notifications.css`, `src/notifications/delivery.ts`, `src/notifications/LiveNotifications.tsx`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npx vitest run src/notifications`, `npm run test:unit`, و`npm test`.

### DAY-PLANNER-PRAYER-CLARITY — إبراز شريط الصلاة ومنع تداخل بطاقات التخطيط اليومي (2026-11-27)
- **التحديث**:
  - إزالة قواعد التجاوز التالفة في `src/home-cards.css` التي كانت تغطّي شريط الصلاة (`.fixed-prayer-bar`) بخلفية زرقاء باهتة تُخفي النص الأبيض والوقت وتفرض حدودًا خضراء وبيج قديمة.
  - اعتماد شريط صلاة أزرق ملكي عالي التباين (`#1B5694` → `#144273`) مع نص أبيض واضح ووقت بإطار شفاف وأيقونات مميزة لكل وقت (قبل الفجر/فجر/ظهر/عصر/مغرب/عشاء) وبطاقات فترات بيضاء بإطار أزرق موحّد `1.5px` ومسافة فاصلة `22px` بين الفترات في الوضع النهاري، **مع إبقاء الوضع الليلي كما هو**.
  - تحويل أعمال كل فترة في `src/DayPlanner.tsx` إلى صفوف مختصرة واضحة مفصولة بخطوط خفيفة (الوقت + الاسم + الحالة + زر تعديل وحذف) مع فتح محرر الاسم والوقت والتأكيد عند الضغط على العمل أو زر القلم فقط (Accordion)، وإضافة شريط انتقال سريع بين فترات اليوم مع عدد الأعمال في كل فترة.
- **الملفات**: `src/DayPlanner.tsx`, `src/day-planner.css`, `src/home-cards.css`, `src/accent-cards.css`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.

### JOURNEY-BOOKS-CLEANUP — حذف كتب «السير إلى الله» (١٦ ملفًا) من `public/books` (2026-11-27)
- **التحديث**:
  - حذف مجلد `public/books` بالكامل (١٤ ملف PDF + `book-text.json` + `manifest.json`، قرابة ١٢٥ ميجابايت) بناءً على طلب المستخدم، مع حماية سكربتي `scripts/generate-book-manifest.mjs` و`scripts/prepare-cloudflare-pages.mjs` لتخطي المجلد عند عدم وجوده حتى لا يتعطل البناء.
- **الملفات**: حذف `public/books/*`، تعديل `scripts/generate-book-manifest.mjs`, `scripts/prepare-cloudflare-pages.mjs`, `docs/RABBANIYYUN_IMPLEMENTATION_PLAN.md`.
- **التحقق**: اجتياز `tsc --noEmit` (`lint_applet`), `vite build` (`compile_applet`), `npm run test:unit`, و`npm test`.
