import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Car, Footprints, LocateFixed, MapPin, RefreshCw, ShieldCheck, SlidersHorizontal, WifiOff } from 'lucide-react';
import { formatArabicDistance } from '../../lib/geo';
import { openAppSettings } from '../../lib/settings-opener';
import { MAX_RADIUS_METERS, MIN_RADIUS_METERS, RADIUS_OPTIONS, radiusFromSlider, sliderFromRadius, useNearbyMosques } from '../../hooks/useNearbyMosques';
import { useOnline } from '../../online';
import { useBackHandler } from '../../navigation/useBackHandler';
import type { QiblaCity } from '../../lib/qibla-cities';
import MosqueCard from './MosqueCard';
import { openMosqueDirections } from './maps-launcher';
import {
  ManualRegionPicker,
  MosquesSkeleton,
  OutsideRegionCard,
  PermissionDeniedCard,
  PermissionPromptCard,
} from './MosquesStates';
import type { NearbyMosque } from './types';

interface MosquesScreenProps {
  notify?: (message: string) => void;
}

export default function MosquesScreen({ notify }: MosquesScreenProps) {
  const online = useOnline();
  const [visibleCount, setVisibleCount] = useState(20);
  const {
    stage,
    geoError,
    coords,
    radiusMeters,
    setRadiusMeters,
    widenRadius,
    travelMode,
    setTravelMode,
    mosques,
    meta,
    countriesList,
    countryNameAr,
    outsideRegion,
    loadingData,
    dataError,
    requestGps,
    refresh,
    selectManualLocation,
    selectCountryFallback,
    retrySearch,
  } = useNearbyMosques();

  const [showManualPicker, setShowManualPicker] = useState(false);
  useBackHandler(() => setShowManualPicker(false), showManualPicker);
  const [cityQuery, setCityQuery] = useState('');
  const isNative = Capacitor.isNativePlatform();

  const handleOpenSettings = async () => {
    const res = await openAppSettings();
    if (!res.opened) {
      notify?.('افتح إعدادات الهاتف ← التطبيقات ← الربانيون ← الأذونات ← الموقع.');
    }
  };

  const handleSelectCity = (city: QiblaCity) => {
    selectManualLocation(city.lat, city.lon, `${city.name}، ${city.country}`);
    setShowManualPicker(false);
    setCityQuery('');
    notify?.(`تم اختيار ${city.name}`);
  };

  const handleOpenMaps = async (mosque: NearbyMosque) => {
    if (!online) {
      notify?.('خرائط Google تحتاج اتصالًا بالإنترنت لفتح المسار، بينما قائمة المساجد تعمل بلا اتصال.');
    }
    const res = await openMosqueDirections(mosque.lat, mosque.lng, travelMode);
    if (!res.opened) {
      notify?.('تعذر فتح خرائط Google على هذا الجهاز. تأكد من تثبيت تطبيق الخرائط أو المتصفح.');
    }
  };

  return (
    <div className="mosques-page" dir="rtl">
      <header className="mosques-header">
        <div>
          <h1>
            <MapPin size={24} aria-hidden="true" />
            <span>المساجد القريبة</span>
          </h1>
          <p className="muted">أقرب المساجد إلى موقعك مع المسافة التقريبية وفتح الاتجاهات في خرائط Google.</p>
        </div>
        <span className="mosques-privacy-pill">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>موقعك يبقى على جهازك فقط</span>
        </span>
      </header>

      {!online && (
        <div className="mosques-offline-banner" role="status">
          <WifiOff size={18} aria-hidden="true" />
          <span>أنت غير متصل بالإنترنت: قائمة المساجد والمسافات تعمل محليًا، لكن خرائط Google تحتاج اتصالًا لعرض المسار.</span>
        </div>
      )}

      {stage === 'prompt-explain' && !coords && (
        <PermissionPromptCard
          onAllowLocation={requestGps}
          onToggleManual={() => setShowManualPicker((v) => !v)}
        />
      )}

      {stage === 'denied' && !coords && (
        <PermissionDeniedCard
          message={geoError ?? 'لم يُسمح بالوصول إلى الموقع.'}
          canOpenSettings={isNative}
          onOpenSettings={handleOpenSettings}
          onRetry={requestGps}
          onToggleManual={() => setShowManualPicker((v) => !v)}
        />
      )}

      {(stage === 'unsupported' || stage === 'geo-error') && !coords && (
        <PermissionDeniedCard
          message={geoError ?? 'تعذر تحديد الموقع.'}
          canOpenSettings={false}
          onOpenSettings={handleOpenSettings}
          onRetry={requestGps}
          onToggleManual={() => setShowManualPicker((v) => !v)}
        />
      )}

      {stage === 'locating' && !coords && (
        <section className="panel mosque-locating-card" role="status">
          <p className="muted">جارٍ تحديد موقعك من الجهاز…</p>
        </section>
      )}

      {showManualPicker && (
        <ManualRegionPicker
          countries={countriesList}
          cityQuery={cityQuery}
          onCityQueryChange={setCityQuery}
          onSelectCity={handleSelectCity}
          onSelectCountry={(country) => {
            selectCountryFallback(country);
            setShowManualPicker(false);
            notify?.(`تم اختيار ${country.nameAr}`);
          }}
        />
      )}

      {coords && (
        <>
          <section className="mosques-controls" aria-label="إعدادات البحث عن المساجد">
            <div className="mosques-control-row">
              <div className="mosques-radius-group" role="group" aria-label="نطاق البحث">
                {RADIUS_OPTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`mosques-chip-btn ${radiusMeters === r ? 'active' : ''}`}
                    onClick={() => setRadiusMeters(r)}
                  >
                    {formatArabicDistance(r)}
                  </button>
                ))}
              </div>

              <div className="mosques-radius-custom">
                <label htmlFor="mosque-radius-km">المسافة المطلوبة (كم)</label>
                <input
                  id="mosque-radius-km"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sliderFromRadius(radiusMeters)}
                  aria-valuetext={formatArabicDistance(radiusMeters)}
                  onChange={(e) => setRadiusMeters(radiusFromSlider(Number(e.target.value)))}
                />
                <input
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  min={MIN_RADIUS_METERS / 1000}
                  max={MAX_RADIUS_METERS / 1000}
                  step={0.1}
                  value={Number((radiusMeters / 1000).toFixed(1))}
                  aria-label="المسافة بالكيلومتر، حتى 40 كم"
                  onChange={(e) => setRadiusMeters(Number(e.target.value) * 1000)}
                />
              </div>

              <div className="mosques-mode-group" role="group" aria-label="وسيلة التنقل في خرائط Google">
                <button
                  type="button"
                  className={`mosques-chip-btn ${travelMode === 'walking' ? 'active' : ''}`}
                  onClick={() => setTravelMode('walking')}
                  aria-pressed={travelMode === 'walking'}
                >
                  <Footprints size={16} aria-hidden="true" />
                  <span>مشي</span>
                </button>
                <button
                  type="button"
                  className={`mosques-chip-btn ${travelMode === 'driving' ? 'active' : ''}`}
                  onClick={() => setTravelMode('driving')}
                  aria-pressed={travelMode === 'driving'}
                >
                  <Car size={16} aria-hidden="true" />
                  <span>سيارة</span>
                </button>
              </div>
            </div>

            <div className="mosques-action-row">
              <button
                type="button"
                className="soft-btn"
                onClick={refresh}
                disabled={loadingData || stage === 'locating'}
              >
                <RefreshCw size={16} aria-hidden="true" />
                <span>تحديث</span>
              </button>
              <button
                type="button"
                className="soft-btn"
                onClick={() => setShowManualPicker((v) => !v)}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                <span>{showManualPicker ? 'إخفاء اختيار المنطقة' : 'تغيير الدولة / المدينة'}</span>
              </button>
              {coords.source === 'manual' && (
                <button type="button" className="soft-btn" onClick={requestGps}>
                  <LocateFixed size={16} aria-hidden="true" />
                  <span>العودة لموقعي (GPS)</span>
                </button>
              )}
            </div>

            <div className="mosques-location-bar">
              <span>
                الموقع الحالي:{' '}
                <strong>
                  {coords.source === 'manual'
                    ? coords.label
                    : countryNameAr
                      ? `موقعي (${countryNameAr})`
                      : 'موقعي (GPS)'}
                </strong>
              </span>
              {!loadingData && !outsideRegion && !dataError && (
                <span>
                  {mosques.length > 0
                    ? `عُثر على ${mosques.length} مسجدًا ضمن ${formatArabicDistance(radiusMeters)} · الأبعد ${formatArabicDistance(Math.max(...mosques.map((m) => m.distanceMeters)))} (مسافة تقريبية في خط مستقيم)`
                    : `لا توجد نتائج ضمن ${formatArabicDistance(radiusMeters)}`}
                </span>
              )}
            </div>
            {!loadingData && mosques.length >= 1500 && (
              <p className="muted small" role="status">منطقتك مزدحمة بالمساجد: نعرض أقرب {mosques.length} مسجد فقط، وأبعدها على بُعد {formatArabicDistance(Math.max(...mosques.map((m) => m.distanceMeters)))}. قلّل المسافة لتركّز على الأقرب.</p>
            )}
          </section>

          {loadingData && <MosquesSkeleton />}

          {!loadingData && dataError && (
            <section className="panel mosque-state-card warn" role="alert">
              <h2>تعذر تحميل بيانات المساجد</h2>
              <p>{dataError}</p>
              <div className="mosque-state-actions">
                <button type="button" className="primary" onClick={retrySearch}>
                  <RefreshCw size={16} aria-hidden="true" />
                  <span>إعادة المحاولة</span>
                </button>
              </div>
            </section>
          )}

          {!loadingData && !dataError && outsideRegion && (
            <OutsideRegionCard
              onToggleManual={() => setShowManualPicker(true)}
              onRetryGps={requestGps}
            />
          )}

          {!loadingData && !dataError && !outsideRegion && mosques.length === 0 && (
            <section className="panel mosque-state-card" role="status">
              <h2>لا توجد مساجد مسجّلة ضمن {formatArabicDistance(radiusMeters)}</h2>
              <p>جرّب توسيع نطاق البحث إلى مسافة أكبر أو اختيار مدينة قريبة.</p>
              <div className="mosque-state-actions">
                {radiusMeters < MAX_RADIUS_METERS && (
                  <button type="button" className="primary" onClick={widenRadius}>
                    توسيع النطاق
                  </button>
                )}
                <button type="button" className="soft-btn" onClick={() => setShowManualPicker(true)}>
                  اختيار مدينة أو دولة
                </button>
              </div>
            </section>
          )}

          {!loadingData && !dataError && !outsideRegion && mosques.length > 0 && (
            <section className="mosques-list" aria-label="قائمة المساجد الأقرب">
              {mosques.slice(0, visibleCount).map((mosque) => (
                <MosqueCard
                  key={mosque.id}
                  mosque={mosque}
                  travelMode={travelMode}
                  online={online}
                  onOpenMaps={handleOpenMaps}
                />
              ))}
              {mosques.length > visibleCount && (
                <button type="button" className="soft-btn" onClick={() => setVisibleCount((n) => n + 20)}>
                  عرض المزيد ({mosques.length - visibleCount} مسجدًا متبقيًا)
                </button>
              )}
            </section>
          )}
        </>
      )}

      <footer className="mosques-attribution">
        <span>{meta?.attribution ?? '© مساهمو OpenStreetMap — قد تكون البيانات غير مكتملة'}</span>
        {meta?.dataDate && <span>تاريخ البيانات: {meta.dataDate}</span>}
      </footer>
    </div>
  );
}
