import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { haversineMeters } from '../lib/geo';
import { addAppResumeListener } from '../lib/settings-opener';
import { LocalFileProvider, type MosqueProvider } from '../features/mosques/provider';
import type { CountryMeta, MosqueMeta, NearbyMosque, TravelMode } from '../features/mosques/types';

const COUNTRY_CAPITAL_COORDS: Record<string, [number, number]> = {
  SA: [24.7136, 46.6753],
  EG: [30.0444, 31.2357],
  DZ: [36.7538, 3.0588],
  IQ: [33.3128, 44.3615],
  LY: [32.8872, 13.1913],
  MA: [34.0209, -6.8416],
  SD: [15.5007, 32.5599],
  AE: [24.4539, 54.3773],
  YE: [15.3694, 44.191],
  SY: [33.5138, 36.2765],
  TN: [36.8065, 10.1815],
  PS: [31.7683, 35.2137],
  OM: [23.588, 58.3829],
  KW: [29.3759, 47.9774],
  SO: [2.0469, 45.3182],
  JO: [31.9454, 35.9284],
  LB: [33.8938, 35.5018],
  BH: [26.2285, 50.586],
  MR: [18.0735, -15.9582],
  QA: [25.2854, 51.531],
  DJ: [11.5721, 43.1456],
  KM: [-11.7172, 43.2473],
};

export type LocationPermissionStage =
  | 'prompt-explain'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'unsupported'
  | 'geo-error';

export interface ActiveCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  source: 'gps' | 'manual';
  label?: string;
}

export const RADIUS_OPTIONS = [500, 1000, 3000, 5000] as const;
export const MAX_RADIUS_METERS = 40000;
export const MIN_RADIUS_METERS = 100;
export const DEFAULT_RADIUS_METERS = 1000;
export const DEFAULT_RESULTS_LIMIT = 1500;

/** شريط المسافة: تدرّج لوغاريتمي (دقيق في الأمتار القليلة وسريع في العشرات من الكيلومترات). */
export function radiusFromSlider(position: number): number {
  const t = Math.min(1, Math.max(0, position / 100));
  const raw = MIN_RADIUS_METERS * Math.pow(MAX_RADIUS_METERS / MIN_RADIUS_METERS, t);
  const step = raw < 1000 ? 50 : raw < 5000 ? 100 : 500;
  return Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, Math.round(raw / step) * step));
}
export function sliderFromRadius(meters: number): number {
  const m = Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, meters));
  return Math.round((Math.log(m / MIN_RADIUS_METERS) / Math.log(MAX_RADIUS_METERS / MIN_RADIUS_METERS)) * 100);
}
/** Minimum movement in meters before re-running grid search for the same radius & country. */
export const RECOMPUTE_THRESHOLD_METERS = 150;

export interface UseNearbyMosquesOptions {
  provider?: MosqueProvider;
  limit?: number;
}

export function useNearbyMosques(options: UseNearbyMosquesOptions = {}) {
  const provider = useMemo(
    () => options.provider ?? new LocalFileProvider('/data'),
    [options.provider],
  );
  const limit = options.limit ?? DEFAULT_RESULTS_LIMIT;

  const [stage, setStage] = useState<LocationPermissionStage>('prompt-explain');
  const [geoError, setGeoError] = useState<string | null>(null);
  const [coords, setCoords] = useState<ActiveCoords | null>(null);
  const [countryOverride, setCountryOverride] = useState<string>('');
  const [radiusMeters, setRadiusRaw] = useState<number>(DEFAULT_RADIUS_METERS);
  const setRadiusMeters = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    setRadiusRaw(Math.round(Math.min(MAX_RADIUS_METERS, Math.max(MIN_RADIUS_METERS, value))));
  }, []);
  const [travelMode, setTravelMode] = useState<TravelMode>('walking');

  const [meta, setMeta] = useState<MosqueMeta | null>(null);
  const [mosques, setMosques] = useState<NearbyMosque[]>([]);
  const [countryNameAr, setCountryNameAr] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('');
  const [outsideRegion, setOutsideRegion] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [timingMs, setTimingMs] = useState<{ parseMs: number; searchMs: number } | null>(null);

  const mountedRef = useRef(true);
  const lastQueryRef = useRef<{
    lat: number;
    lng: number;
    radiusMeters: number;
    countryOverride: string;
  } | null>(null);

  // Release provider & worker memory when leaving the Mosques screen.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      provider.dispose();
    };
  }, [provider]);

  // Preload meta.json so manual country/city fallback and attribution date are always available.
  useEffect(() => {
    let active = true;
    provider
      .getMeta()
      .then((m) => {
        if (active) setMeta(m);
      })
      .catch(() => {
        /* handled when search runs */
      });
    return () => {
      active = false;
    };
  }, [provider]);

  const requestGps = useCallback(() => {
    setStage('locating');
    setGeoError(null);
    void (async () => {
      // طلب GPS صريح من المستخدم عبر المخزن المركزي (مُدمَج مع بقية الأجزاء).
      const { refreshDeviceLocation, clearManualLocation } = await import('../lib/location-store');
      clearManualLocation();
      const res = await refreshDeviceLocation({ timeout: 15000, maximumAge: 0 });
      if (!mountedRef.current) return;
      if (res.ok) {
        setCountryOverride('');
        setCoords({
          latitude: res.coords.latitude,
          longitude: res.coords.longitude,
          accuracy: res.coords.accuracy,
          source: 'gps',
        });
        setStage('ready');
        return;
      }
      if (res.reason === 'denied' || res.reason === 'permanently-denied') {
        setStage('denied');
        setGeoError('تم رفض إذن الموقع. يمكنك فتح الإعدادات لتفعيله أو اختيار دولة ومدينة يدويًا.');
      } else if (res.reason === 'unsupported') {
        setStage('unsupported');
        setGeoError(res.message);
      } else {
        setStage('geo-error');
        setGeoError(res.message);
      }
    })();
  }, []);

  // When returning from Android App Settings after granting location permission, retry GPS automatically.
  useEffect(() => {
    if (stage !== 'denied' || coords) return;
    return addAppResumeListener(() => {
      void (async () => {
        const { syncCentralLocationPermission } = await import('../lib/location-store');
        const p = await syncCentralLocationPermission();
        if (p === 'granted' || p === 'prompt') {
          requestGps();
        }
      })();
    });
  }, [stage, coords, requestGps]);

  // If browser/WebView permission is already granted, locate right away without extra tap.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { syncCentralLocationPermission, getCentralLocationState } = await import('../lib/location-store');
      // المدينة اليدوية المشتركة (من المواقيت أو القبلة) لها الأولوية على GPS.
      const shared = getCentralLocationState().manual;
      if (shared) {
        lastQueryRef.current = null;
        setCoords({ latitude: shared.latitude, longitude: shared.longitude, source: 'manual', label: shared.label });
        setStage('ready');
        return;
      }
      const p = await syncCentralLocationPermission();
      if (cancelled) return;
      if (p === 'granted') {
        requestGps();
      } else if (p === 'denied') {
        setStage('denied');
        setGeoError('تم رفض إذن الموقع. يمكنك فتح الإعدادات لتفعيله أو اختيار دولة ومدينة يدويًا.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestGps]);

  const runSearch = useCallback(
    async (target: ActiveCoords, radius: number, override: string, force = false) => {
      const prev = lastQueryRef.current;
      if (
        !force &&
        prev &&
        prev.radiusMeters === radius &&
        prev.countryOverride === override &&
        haversineMeters(prev.lat, prev.lng, target.latitude, target.longitude) < RECOMPUTE_THRESHOLD_METERS
      ) {
        return;
      }

      setLoadingData(true);
      setDataError(null);
      try {
        const result = await provider.findNearby(
          target.latitude,
          target.longitude,
          radius,
          limit,
          override || undefined,
        );
        if (!mountedRef.current) return;
        lastQueryRef.current = {
          lat: target.latitude,
          lng: target.longitude,
          radiusMeters: radius,
          countryOverride: override,
        };
        setMosques(result.mosques);
        setCountryCode(result.countryCode);
        setCountryNameAr(result.countryNameAr);
        setOutsideRegion(result.outsideCoveredRegion);
        setTimingMs({ parseMs: result.parseMs, searchMs: result.searchMs });
      } catch {
        if (!mountedRef.current) return;
        setDataError('تعذر تحميل بيانات المساجد. تأكد من سلامة ملفات البيانات ثم أعد المحاولة.');
      } finally {
        if (mountedRef.current) setLoadingData(false);
      }
    },
    [limit, provider],
  );

  useEffect(() => {
    if (!coords) return;
    void runSearch(coords, radiusMeters, countryOverride, false);
  }, [coords, radiusMeters, countryOverride, runSearch]);

  const selectManualLocation = useCallback(
    (lat: number, lng: number, label: string, cc = '') => {
      lastQueryRef.current = null;
      setCountryOverride(cc);
      setGeoError(null);
      setCoords({
        latitude: lat,
        longitude: lng,
        source: 'manual',
        label,
      });
      setStage('ready');
      void import('../lib/location-store').then((m) => m.setManualLocation(lat, lng, label));
    },
    [],
  );

  const selectCountryFallback = useCallback(
    (country: CountryMeta) => {
      const capital = COUNTRY_CAPITAL_COORDS[country.code.toUpperCase()];
      const [lat, lng] = capital ?? country.center;
      selectManualLocation(lat, lng, country.nameAr, country.code);
    },
    [selectManualLocation],
  );

  const refresh = useCallback(() => {
    lastQueryRef.current = null;
    if (coords?.source === 'manual') {
      void runSearch(coords, radiusMeters, countryOverride, true);
    } else {
      requestGps();
    }
  }, [coords, countryOverride, radiusMeters, requestGps, runSearch]);

  const widenRadius = useCallback(() => {
    setRadiusMeters(Math.min(MAX_RADIUS_METERS, Math.max(radiusMeters * 2, radiusMeters + 500)));
  }, [radiusMeters]);

  const countriesList = useMemo(
    () => (meta ? Object.values(meta.countries).sort((a, b) => b.count - a.count) : []),
    [meta],
  );

  return {
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
    countryCode,
    countryNameAr,
    outsideRegion,
    loadingData,
    dataError,
    timingMs,
    requestGps,
    refresh,
    selectManualLocation,
    selectCountryFallback,
    retrySearch: () => coords && void runSearch(coords, radiusMeters, countryOverride, true),
  };
}
