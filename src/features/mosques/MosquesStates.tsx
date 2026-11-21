import { AlertTriangle, Globe2, MapPin, Navigation, RefreshCw, Settings2 } from 'lucide-react';
import { QIBLA_CITIES, type QiblaCity } from '../../lib/qibla-cities';
import type { CountryMeta } from './types';

const COVERED_ARAB_COUNTRIES = new Set([
  'السعودية', 'مصر', 'العراق', 'سوريا', 'لبنان', 'الأردن', 'فلسطين',
  'الكويت', 'قطر', 'الإمارات', 'عمان', 'عُمان', 'اليمن', 'البحرين',
  'السودان', 'موريتانيا', 'المغرب', 'الجزائر', 'تونس', 'ليبيا',
  'الصومال', 'جيبوتي', 'جزر القمر',
]);

const ARAB_CITIES_UNIQUE: QiblaCity[] = (() => {
  const seen = new Set<string>();
  const out: QiblaCity[] = [];
  for (const c of QIBLA_CITIES) {
    if (!COVERED_ARAB_COUNTRIES.has(c.country)) continue;
    const key = `${c.name}|${c.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
})();

interface ManualPickerProps {
  countries: CountryMeta[];
  cityQuery: string;
  onCityQueryChange: (q: string) => void;
  onSelectCity: (city: QiblaCity) => void;
  onSelectCountry: (country: CountryMeta) => void;
}

export function ManualRegionPicker({
  countries,
  cityQuery,
  onCityQueryChange,
  onSelectCity,
  onSelectCountry,
}: ManualPickerProps) {
  const q = cityQuery.trim().toLowerCase();
  const cities = q
    ? ARAB_CITIES_UNIQUE.filter(
        (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
      )
    : ARAB_CITIES_UNIQUE;

  return (
    <div className="mosque-manual-picker">
      <div className="mosque-manual-block">
        <label htmlFor="mosque-city-search">اختر مدينة قريبة</label>
        <input
          id="mosque-city-search"
          type="search"
          value={cityQuery}
          onChange={(e) => onCityQueryChange(e.target.value)}
          placeholder="ابحث عن مدينة (مثل: الرياض، القاهرة، عمّان)…"
        />
        <ul className="mosque-city-list" aria-label="قائمة المدن">
          {cities.slice(0, 12).map((c) => (
            <li key={`${c.name}-${c.country}`}>
              <button type="button" className="soft-btn" onClick={() => onSelectCity(c)}>
                <span>{c.name}</span>
                <small>{c.country}</small>
              </button>
            </li>
          ))}
          {cities.length === 0 && <li className="muted small">لا توجد مدينة مطابقة.</li>}
        </ul>
      </div>

      {countries.length > 0 && (
        <div className="mosque-manual-block">
          <label htmlFor="mosque-country-select">أو اختر الدولة مباشرة</label>
          <select
            id="mosque-country-select"
            defaultValue=""
            onChange={(e) => {
              const found = countries.find((c) => c.code === e.target.value);
              if (found) onSelectCountry(found);
            }}
          >
            <option value="" disabled>
              اختر دولة من القائمة…
            </option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.nameAr} ({c.count.toLocaleString('ar-EG')} مسجد)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function PermissionPromptCard({
  onAllowLocation,
  onToggleManual,
}: {
  onAllowLocation: () => void;
  onToggleManual: () => void;
}) {
  return (
    <section className="panel mosque-state-card" aria-labelledby="mosque-consent-title">
      <div className="mosque-state-icon">
        <Navigation size={24} aria-hidden="true" />
      </div>
      <h2 id="mosque-consent-title">تحديد المساجد القريبة من موقعك</h2>
      <p>
        نحتاج إلى إذن الموقع الجغرافي لعرض أقرب المساجد إليك وحساب المسافة إليها.{' '}
        <strong>موقعك يبقى على جهازك فقط</strong> ولا يُرسَل إلى أي خادم ولا يُحفظ في سجل.
      </p>
      <div className="mosque-state-actions">
        <button type="button" className="primary" onClick={onAllowLocation}>
          <MapPin size={17} aria-hidden="true" />
          <span>تحديد موقعي الآن</span>
        </button>
        <button type="button" className="soft-btn" onClick={onToggleManual}>
          اختيار دولة أو مدينة يدويًا
        </button>
      </div>
    </section>
  );
}

export function PermissionDeniedCard({
  message,
  canOpenSettings,
  onOpenSettings,
  onRetry,
  onToggleManual,
}: {
  message: string;
  canOpenSettings: boolean;
  onOpenSettings: () => void;
  onRetry: () => void;
  onToggleManual: () => void;
}) {
  return (
    <section className="panel mosque-state-card warn" role="alert">
      <div className="mosque-state-icon">
        <AlertTriangle size={24} aria-hidden="true" />
      </div>
      <h2>تعذر الوصول إلى الموقع</h2>
      <p>{message}</p>
      <div className="mosque-state-actions">
        {canOpenSettings && (
          <button type="button" className="primary" onClick={onOpenSettings}>
            <Settings2 size={17} aria-hidden="true" />
            <span>فتح إعدادات التطبيق</span>
          </button>
        )}
        <button type="button" className="soft-btn" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>إعادة المحاولة</span>
        </button>
        <button type="button" className="soft-btn" onClick={onToggleManual}>
          اختيار دولة أو مدينة يدويًا
        </button>
      </div>
    </section>
  );
}

export function OutsideRegionCard({
  onToggleManual,
  onRetryGps,
}: {
  onToggleManual: () => void;
  onRetryGps: () => void;
}) {
  return (
    <section className="panel mosque-state-card" role="status">
      <div className="mosque-state-icon">
        <Globe2 size={24} aria-hidden="true" />
      </div>
      <h2>موقعك خارج نطاق الدول المشمولة حاليًا</h2>
      <p>
        البيانات المضمّنة تغطي الدول العربية فقط. يمكنك اختيار إحدى الدول أو المدن المشمولة يدويًا لاستعراض مساجدها.
      </p>
      <div className="mosque-state-actions">
        <button type="button" className="primary" onClick={onToggleManual}>
          اختيار دولة أو مدينة
        </button>
        <button type="button" className="soft-btn" onClick={onRetryGps}>
          <RefreshCw size={16} aria-hidden="true" />
          <span>تحديث GPS</span>
        </button>
      </div>
    </section>
  );
}

export function MosquesSkeleton() {
  return (
    <div className="mosque-skeleton-list" aria-busy="true" aria-label="جارٍ البحث عن المساجد القريبة">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="mosque-skeleton-card">
          <div className="mosque-skel-line wide" />
          <div className="mosque-skel-line short" />
          <div className="mosque-skel-btn" />
        </div>
      ))}
    </div>
  );
}
