// src/hooks/useCentralLocation.ts
// واجهة React للمخزن المركزي للموقع. استخدم هذا الخطاف في أي شاشة تحتاج الموقع
// بدل طلب الإذن مباشرة، كي يبقى الطلب والحالة مشتركين بين كل الأجزاء.

import { useCallback, useSyncExternalStore } from 'react';
import {
  clearManualLocation,
  ensureCentralLocation,
  getCentralLocationState,
  openCentralLocationSettings,
  refreshDeviceLocation,
  setManualLocation,
  subscribeCentralLocation,
  syncCentralLocationPermission,
  type CentralLocationState,
  type EnsureLocationOptions,
} from '../lib/location-store';
import type { LocationResult } from '../lib/device-location';

export interface UseCentralLocation extends CentralLocationState {
  ensure: (options?: EnsureLocationOptions) => Promise<LocationResult>;
  refresh: (options?: EnsureLocationOptions) => Promise<LocationResult>;
  setManual: (latitude: number, longitude: number, label: string) => void;
  clearManual: () => void;
  openSettings: () => Promise<boolean>;
  syncPermission: () => Promise<CentralLocationState['permission']>;
}

export function useCentralLocation(): UseCentralLocation {
  const state = useSyncExternalStore(
    subscribeCentralLocation,
    getCentralLocationState,
    getCentralLocationState,
  );
  const ensure = useCallback((options?: EnsureLocationOptions) => ensureCentralLocation(options), []);
  const refresh = useCallback((options?: EnsureLocationOptions) => refreshDeviceLocation(options), []);
  const setManual = useCallback((latitude: number, longitude: number, label: string) => {
    setManualLocation(latitude, longitude, label);
  }, []);
  const clearManual = useCallback(() => clearManualLocation(), []);
  const openSettings = useCallback(() => openCentralLocationSettings(), []);
  const syncPermission = useCallback(() => syncCentralLocationPermission(), []);
  return { ...state, ensure, refresh, setManual, clearManual, openSettings, syncPermission };
}
