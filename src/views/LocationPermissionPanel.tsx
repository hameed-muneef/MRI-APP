// لوحة الموقع المركزية في الإعدادات: مكان واحد يعرض حالة إذن الموقع ويطلبه،
// وتقرأ منه مواقيت الصلاة والقبلة والمساجد القريبة — لا طلب إذن منفصل لكل جزء.

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CheckCircle2, MapPin, RotateCcw, Search, Settings2 } from 'lucide-react';
import { useCentralLocation } from '../hooks/useCentralLocation';
import { searchCities } from '../lib/qibla-cities';

const STATUS_TEXT: Record<string, string> = {
  idle: 'لم يُطلب الموقع بعد.',
  locating: 'جارٍ تحديد موقعك…',
  ready: 'الموقع متاح ويُستخدم في كل أجزاء التطبيق.',
  denied: 'إذن الموقع مرفوض. فعّله من الإعدادات أو اختر مدينتك يدويًا.',
  error: 'تعذر تحديد الموقع. أعد المحاولة أو اختر مدينتك يدويًا.',
  unsupported: 'تحديد الموقع غير مدعوم على هذا الجهاز.',
};

export default function LocationPermissionPanel({ notify }: { notify?: (message: string) => void }) {
  const central = useCentralLocation();
  const [query, setQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleLocate = async () => {
    setBusy(true);
    try {
      central.clearManual();
      const res = await central.refresh({ timeout: 15000 });
      if (!res.ok) notify?.(res.message);
      else notify?.('تم تحديد موقعك وسيُستخدم في المواقيت والقبلة والمساجد.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenSettings = async () => {
    const opened = await central.openSettings();
    if (!opened) notify?.('افتح إعدادات الهاتف ← التطبيقات ← الربانيون ← الأذونات ← الموقع.');
  };

  const filtered = searchCities(query);

  return (
    <div className="location-central-panel">
      <div className={`task-push-permission-bar perm-${central.permission === 'granted' || central.status === 'ready' ? 'granted' : central.status === 'denied' ? 'denied' : 'default'}`}>
        <div>
          <strong>حالة الموقع:</strong>{' '}
          <span role="status">
            {STATUS_TEXT[central.status]}
            {central.source === 'manual' && central.manual ? ` المدينة المختارة: ${central.manual.label}.` : ''}
            {central.source === 'device' && central.coords ? ` (${central.coords.latitude.toFixed(3)}°, ${central.coords.longitude.toFixed(3)}°)` : ''}
          </span>
          {central.error && central.status !== 'locating' && <span className="muted small"> {central.error}</span>}
        </div>
        {central.status === 'ready' && <span className="task-push-ok"><CheckCircle2 size={15}/> نشط</span>}
      </div>
      <p className="muted small">
        طلب واحد للموقع يخدم كل التطبيق: مواقيت الصلاة، اتجاه القبلة، والمساجد القريبة. لا يُرسل موقعك إلى أي خادم.
      </p>
      <div className="qibla-actions">
        <button type="button" className="soft-btn" onClick={() => void handleLocate()} disabled={busy || central.status === 'locating'}>
          <MapPin size={16}/> {central.status === 'locating' || busy ? 'جارٍ التحديد…' : 'تحديد موقعي الآن'}
        </button>
        {central.status === 'denied' && Capacitor.isNativePlatform() && (
          <button type="button" className="soft-btn" onClick={() => void handleOpenSettings()}>
            <Settings2 size={16}/> فتح إعدادات التطبيق
          </button>
        )}
        <button type="button" className="soft-btn" onClick={() => setShowPicker((v) => !v)}>
          <Search size={16}/> اختيار مدينة يدويًا
        </button>
        {central.manual && (
          <button type="button" className="soft-btn" onClick={() => { central.clearManual(); notify?.('عُدت إلى موقع الجهاز.'); }}>
            <RotateCcw size={16}/> إلغاء المدينة اليدوية
          </button>
        )}
      </div>
      {showPicker && (
        <div className="qibla-picker">
          <input
            type="search"
            className="qibla-picker-input"
            placeholder="ابحث عن مدينة…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="qibla-picker-list">
            {filtered.map((c) => (
              <li key={`${c.name}-${c.country}`}>
                <button type="button" onClick={() => { central.setManual(c.lat, c.lon, `${c.name}، ${c.country}`); setShowPicker(false); setQuery(''); notify?.(`تم اختيار ${c.name}، ${c.country} — ستُستخدم في كل أجزاء التطبيق`); }}>
                  {c.name} <small>{c.country}</small>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="muted">لا نتائج.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
