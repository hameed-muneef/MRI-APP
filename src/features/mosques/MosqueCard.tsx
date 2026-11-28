import { Car, ExternalLink, Footprints, MapPin } from 'lucide-react';
import { formatArabicDistance, type TravelMode } from '../../lib/geo';
import { formatMosqueLocation } from './location-format';
import type { NearbyMosque } from './types';

interface MosqueCardProps {
  mosque: NearbyMosque;
  travelMode: TravelMode;
  online: boolean;
  onOpenMaps: (mosque: NearbyMosque) => void;
}

export default function MosqueCard({ mosque, travelMode, online: _online, onOpenMaps }: MosqueCardProps) {
  const displayName = mosque.name.trim() || 'مسجد';
  const cleanLocation = formatMosqueLocation(mosque.locationText);
  const distanceLabel = formatArabicDistance(mosque.distanceMeters);
  // تقدير تقريبي للزمن: مشي ٥ كم/س على طريق أطول ١.٣ من الخط المستقيم، وسيارة ٣٥ كم/س داخل المدن بعامل ١.٤.
  const minutes = travelMode === 'walking'
    ? (mosque.distanceMeters * 1.3) / (5000 / 60)
    : (mosque.distanceMeters * 1.4) / (35000 / 60);
  const rounded = Math.max(1, Math.round(minutes));
  const timeLabel = rounded >= 60
    ? `${Math.floor(rounded / 60)} س ${rounded % 60 ? `${rounded % 60} د` : ''}`.trim()
    : `${rounded} د`;

  return (
    <article className="mosque-card" aria-label={displayName}>
      <div className="mosque-card-top">
        <div className="mosque-card-title-wrap">
          <span className="mosque-card-icon" aria-hidden="true">
            <MapPin size={18} />
          </span>
          <div className="mosque-card-text">
            <h3>{displayName}</h3>
            {cleanLocation && <p className="mosque-card-loc">{cleanLocation}</p>}
          </div>
        </div>

        <div className="mosque-distance-badge" title="مسافة تقريبية">
          <strong>{distanceLabel}</strong>
          <small>تقريبًا</small>
        </div>
      </div>
      <div className="mosque-card-actions">
        <div className="mosque-eta" aria-label="الزمن التقريبي">
          {travelMode === 'walking' ? <Footprints size={15} aria-hidden="true" /> : <Car size={15} aria-hidden="true" />}
          <span>≈ {timeLabel} {travelMode === 'walking' ? 'مشيًا' : 'بالسيارة'}</span>
        </div>
        <button
          type="button"
          className="primary mosque-maps-btn"
          onClick={() => onOpenMaps(mosque)}
          aria-label={`افتح ${displayName} في خرائط Google (${travelMode === 'walking' ? 'مشي' : 'سيارة'})`}
        >
          <ExternalLink size={16} aria-hidden="true" />
          <span>افتح في خرائط Google</span>
        </button>
      </div>
    </article>
  );
}
