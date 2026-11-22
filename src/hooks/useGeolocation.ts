// src/hooks/useGeolocation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  requestDeviceLocation,
  checkLocationPermission,
  openLocationSettings as openLocSettings,
  hasAskedLocation,
} from '../lib/device-location';

export type GeoStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unsupported' | 'error';
export type GeoPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
}

export interface GeoState {
  status: GeoStatus;
  coords: GeoCoords | null;
  error: string | null;
  permission: GeoPermission;
  permanentlyDenied: boolean;
  request: () => void;
  openSettings: () => Promise<void>;
}

const STORAGE_KEY = 'rabbani-qibla-location-v1';

export function loadSavedLocation(): GeoCoords | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GeoCoords>;
    if (typeof v.latitude !== 'number' || typeof v.longitude !== 'number') return null;
    return { latitude: v.latitude, longitude: v.longitude, accuracy: typeof v.accuracy === 'number' ? v.accuracy : 0 };
  } catch {
    return null;
  }
}

export function saveLocation(c: GeoCoords): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function useGeolocation(autoRequest = true): GeoState {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [coords, setCoords] = useState<GeoCoords | null>(loadSavedLocation());
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<GeoPermission>('prompt');
  const [permanentlyDenied, setPermanentlyDenied] = useState(false);
  const mounted = useRef(true);

  const request = useCallback(() => {
    setStatus('loading');
    setError(null);
    void requestDeviceLocation({ timeout: 15000, maximumAge: 0 }).then((res) => {
      if (!mounted.current) return;
      if (res.ok) {
        const c: GeoCoords = {
          latitude: res.coords.latitude,
          longitude: res.coords.longitude,
          accuracy: res.coords.accuracy,
        };
        setCoords(c);
        saveLocation(c);
        setStatus('ready');
        setPermission('granted');
        setPermanentlyDenied(false);
      } else {
        const denied = res.reason === 'denied' || res.reason === 'permanently-denied';
        if (res.reason === 'unsupported') {
          setStatus('unsupported');
        } else if (denied) {
          setStatus('denied');
        } else {
          setStatus('error');
        }
        setError(res.message);
        setPermission(denied ? 'denied' : permission);
        setPermanentlyDenied(res.reason === 'permanently-denied' || (res.reason === 'denied' && hasAskedLocation()));
      }
    });
  }, [permission]);

  const openSettings = useCallback(async () => {
    const opened = await openLocSettings();
    if (!opened) {
      setError('افتح إعدادات الهاتف ← التطبيقات ← الربانيون ← الأذونات ← الموقع.');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (autoRequest) {
      // Check permission first; only auto-request if not denied.
      void checkLocationPermission().then((p) => {
        if (!mounted.current) return;
        setPermission(p);
        if (p === 'granted' || p === 'prompt') {
          request();
        } else {
          setStatus('denied');
          setError('لم يُسمح بالوصول للموقع. يمكنك اختيار مدينتك يدويًا.');
          setPermanentlyDenied(true);
        }
      });
    }
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, coords, error, permission, permanentlyDenied, request, openSettings };
}