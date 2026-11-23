// src/hooks/useGeolocation.ts
// غلاف توافقي فوق المخزن المركزي للموقع (location-store). كان يملك طلب إذن خاصًا
// به؛ الآن يشارك الطلب المركزي الواحد مع بقية أجزاء التطبيق.

import { useCallback, useEffect, useState } from 'react';
import { useCentralLocation } from './useCentralLocation';
import {
  ensureCentralLocation,
  getCentralLocationState,
  refreshDeviceLocation,
} from '../lib/location-store';

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

function toGeoStatus(status: ReturnType<typeof getCentralLocationState>['status']): GeoStatus {
  return status === 'locating' ? 'loading' : status;
}

export function useGeolocation(autoRequest = true): GeoState {
  const central = useCentralLocation();
  const [localError, setLocalError] = useState<string | null>(null);

  const request = useCallback(() => {
    setLocalError(null);
    void refreshDeviceLocation({ timeout: 15000, maximumAge: 0 });
  }, []);

  const openSettings = useCallback(async () => {
    const opened = await central.openSettings();
    if (!opened) {
      setLocalError('افتح إعدادات الهاتف ← التطبيقات ← الربانيون ← الأذونات ← الموقع.');
    }
  }, [central]);

  useEffect(() => {
    if (!autoRequest) return;
    let cancelled = false;
    void central.syncPermission().then((p) => {
      if (cancelled) return;
      if (p === 'granted' || p === 'prompt') {
        void ensureCentralLocation();
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest]);

  return {
    status: toGeoStatus(central.status),
    coords: central.deviceCoords ? { ...central.deviceCoords } : null,
    error: central.error ?? localError,
    permission: central.permission,
    permanentlyDenied: central.permanentlyDenied,
    request,
    openSettings,
  };
}
