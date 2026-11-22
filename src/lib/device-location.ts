// src/lib/device-location.ts
// Unified coarse-location helper for native (Capacitor Geolocation) and web.
// Native Android only requests ACCESS_COARSE_LOCATION (see AndroidManifest.xml).
// Never requests ACCESS_FINE_LOCATION.

import { Capacitor } from '@capacitor/core';

export type DeviceCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type LocationFailureReason =
  | 'denied'
  | 'permanently-denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export type LocationResult =
  | { ok: true; coords: DeviceCoords; source: 'native' | 'web' }
  | { ok: false; reason: LocationFailureReason; message: string };

export type LocationPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported';

const ASKED_KEY = 'rabbani-location-asked-v1';

export function isNativePlatform(): boolean {
  try {
    return typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function hasAskedLocation(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markLocationAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

function deniedMessage(): string {
  return 'لم يُسمح بالوصول للموقع. يمكنك السماح به أو اختيار مدينتك يدويًا.';
}

function mapError(err: unknown): { reason: LocationFailureReason; message: string } {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (lower.includes('denied') || lower.includes('permission')) {
    if (hasAskedLocation()) {
      return { reason: 'permanently-denied', message: deniedMessage() };
    }
    return { reason: 'denied', message: deniedMessage() };
  }
  if (lower.includes('disabled') || lower.includes('services') || lower.includes('unavailable') || lower.includes('position unavailable')) {
    return { reason: 'unavailable', message: 'تعذر تحديد موقعك. تحقق من تفعيل GPS ثم أعد المحاولة.' };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { reason: 'timeout', message: 'انتهت مهلة تحديد الموقع. أعد المحاولة.' };
  }
  return { reason: 'unavailable', message: msg || 'تعذر تحديد موقعك.' };
}

export async function checkLocationPermission(): Promise<LocationPermissionState> {
  if (isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const s = await Geolocation.checkPermissions();
      if (s.coarseLocation === 'granted' || s.location === 'granted') return 'granted';
      if (s.coarseLocation === 'denied' && s.location === 'denied') return 'denied';
      // coarse denied but location prompt etc.
      if (s.coarseLocation === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }
  if (typeof navigator === 'undefined') return 'unsupported';
  const perms = navigator.permissions;
  if (!perms?.query) return 'prompt';
  try {
    const res = await perms.query({ name: 'geolocation' as PermissionName });
    if (res.state === 'granted') return 'granted';
    if (res.state === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  if (isNativePlatform()) {
    markLocationAsked();
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const s = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
      if (s.coarseLocation === 'granted' || s.location === 'granted') return 'granted';
      return 'denied';
    } catch {
      return 'denied';
    }
  }
  return checkLocationPermission();
}

export async function requestDeviceLocation(options?: { timeout?: number; maximumAge?: number }): Promise<LocationResult> {
  const timeout = options?.timeout ?? 15000;
  const maximumAge = options?.maximumAge ?? 0;

  if (isNativePlatform()) {
    const wasAsked = hasAskedLocation();
    let perm = await checkLocationPermission();
    if (perm !== 'granted') {
      const previouslyAsked = hasAskedLocation();
      perm = await requestLocationPermission();
      // requestLocationPermission marks asked; decide permanent based on prior state.
      if (perm !== 'granted') {
        const permanent = previouslyAsked || wasAsked;
        return {
          ok: false,
          reason: permanent ? 'permanently-denied' : 'denied',
          message: deniedMessage(),
        };
      }
    }
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout,
        maximumAge,
      });
      return {
        ok: true,
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
        },
        source: 'native',
      };
    } catch (e) {
      const m = mapError(e);
      if (m.reason === 'denied' || m.reason === 'permanently-denied') {
        m.message = deniedMessage();
      }
      return { ok: false, reason: m.reason, message: m.message };
    }
  }

  // Web fallback.
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: 'unsupported', message: 'تحديد الموقع غير مدعوم في هذا المتصفح.' };
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { ok: false, reason: 'unsupported', message: 'تحديد الموقع يتطلب اتصالًا آمنًا (HTTPS).' };
  }
  return new Promise<LocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          ok: true,
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
          },
          source: 'web',
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          resolve({
            ok: false,
            reason: hasAskedLocation() ? 'permanently-denied' : 'denied',
            message: deniedMessage(),
          });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          resolve({ ok: false, reason: 'unavailable', message: 'تعذر تحديد موقعك. تحقق من GPS ثم أعد المحاولة.' });
        } else {
          resolve({ ok: false, reason: 'timeout', message: 'انتهت مهلة تحديد الموقع. أعد المحاولة.' });
        }
      },
      { enableHighAccuracy: false, timeout, maximumAge },
    );
  });
}

export async function openLocationSettings(): Promise<boolean> {
  if (!isNativePlatform()) return false;
  try {
    const { openAppSettings } = await import('./settings-opener');
    const res = await openAppSettings();
    return Boolean(res.opened);
  } catch {
    return false;
  }
}