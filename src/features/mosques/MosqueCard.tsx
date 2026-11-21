import { ExternalLink, MapPin } from 'lucide-react';
import { formatArabicDistance, type TravelMode } from '../../lib/geo';
import type { NearbyMosque } from './types';

interface MosqueCardProps {
  mosque: NearbyMosque;
  travelMode: TravelMode;
  online: boolean;
  onOpenMaps: (mosque: NearbyMosque) => void;
}

export default function MosqueCard({ mosque, travelMode, online, onOpenMaps }: MosqueCardProps) {
  const displayName = mosque.name.trim() || 'مسجد';
  const distanceLabel = formatArabicDistance(mosque.distanceMeters);

  return (
    <article className="mosque-card" aria-label={displayName}>
      <div className="mosque-card-top">
        <div className="mosque-card-title-wrap">
          <span className="mosque-card-icon" aria-hidden="true">
            <MapPin size={18} />
          </span>
          <div className="mosque-card-text">
            <h3>{displayName}</h3>
            {mosque.locationText && <p className="mosque-card-loc">{mosque.locationText}</p>}
          </div>
        </div>

        <div className="mosque-distance-badge" title="مسافة تقريبية في خط مستقيم">
          <strong>{distanceLabel}</strong>
          <small>خط مستقيم</small>
        </div>
      </div>

      <div className="mosque-card-actions">
        <button
          type="button"
          className="primary mosque-maps-btn"
          onClick={() => onOpenMaps(mosque)}
          aria-label={`افتح ${displayName} في خرائط Google (${travelMode === 'walking' ? 'مشي' : 'سيارة'})`}
        >
          <ExternalLink size={16} aria-hidden="true" />
          <span>افتح في خرائط Google</span>
        </button>
        {!online && (
          <span className="mosque-offline-hint">يتطلب خرائط Google اتصالًا بالإنترنت</span>
        )}
      </div>
    </article>
  );
}
