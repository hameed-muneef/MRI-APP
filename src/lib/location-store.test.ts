import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const requestDeviceLocation = vi.fn();
const checkLocationPermission = vi.fn();
const hasAskedLocation = vi.fn(() => false);

vi.mock('./device-location', () => ({
  requestDeviceLocation: (...args: unknown[]) => requestDeviceLocation(...args),
  checkLocationPermission: (...args: unknown[]) => checkLocationPermission(...args),
  hasAskedLocation: () => hasAskedLocation(),
  isNativePlatform: () => false,
  openLocationSettings: async () => false,
}));

import {
  ensureCentralLocation,
  getCentralLocationState,
  refreshDeviceLocation,
  resetCentralLocationForTests,
  setManualLocation,
  clearManualLocation,
  subscribeCentralLocation,
  syncCentralLocationPermission,
  type CentralLocationState,
} from './location-store';

const OK = {ok: true as const, coords: {latitude: 30.04, longitude: 31.23, accuracy: 25}, source: 'web' as const};
const DENIED = {ok: false as const, reason: 'denied' as const, message: 'مرفوض'};

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
    },
  });
  return data;
}

beforeEach(() => {
  stubStorage();
  resetCentralLocationForTests();
  requestDeviceLocation.mockReset();
  checkLocationPermission.mockReset();
  hasAskedLocation.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetCentralLocationForTests();
});

describe('central location store', () => {
  it('merges concurrent requests into ONE OS location request shared by every caller', async () => {
    requestDeviceLocation.mockResolvedValue(OK);
    const [a, b, c] = await Promise.all([
      ensureCentralLocation(),
      ensureCentralLocation(),
      ensureCentralLocation(),
    ]);
    expect(requestDeviceLocation).toHaveBeenCalledTimes(1);
    expect(a).toEqual(OK);
    expect(b).toEqual(OK);
    expect(c).toEqual(OK);
    expect(getCentralLocationState().status).toBe('ready');
  });

  it('reuses fresh device coords instead of hitting the sensor again', async () => {
    requestDeviceLocation.mockResolvedValue(OK);
    await ensureCentralLocation();
    await ensureCentralLocation();
    expect(requestDeviceLocation).toHaveBeenCalledTimes(1);
    await refreshDeviceLocation();
    expect(requestDeviceLocation).toHaveBeenCalledTimes(2);
  });

  it('notifies every subscriber of the same state change', async () => {
    requestDeviceLocation.mockResolvedValue(OK);
    const seenA: CentralLocationState[] = [];
    const seenB: CentralLocationState[] = [];
    subscribeCentralLocation((s) => seenA.push(s));
    subscribeCentralLocation((s) => seenB.push(s));
    await ensureCentralLocation();
    expect(seenA.length).toBeGreaterThan(0);
    expect(seenB.map((s) => s.status)).toEqual(seenA.map((s) => s.status));
    expect(seenA[seenA.length - 1]?.coords?.latitude).toBe(30.04);
  });

  it('propagates denial to all features from the single shared request', async () => {
    requestDeviceLocation.mockResolvedValue(DENIED);
    hasAskedLocation.mockReturnValue(true);
    const res = await ensureCentralLocation();
    expect(res.ok).toBe(false);
    const s = getCentralLocationState();
    expect(s.status).toBe('denied');
    expect(s.permission).toBe('denied');
    expect(s.permanentlyDenied).toBe(true);
    expect(s.error).toBe('مرفوض');
  });

  it('manual city override is the shared fallback and needs no GPS', async () => {
    setManualLocation(21.42, 39.82, 'مكة المكرمة');
    const res = await ensureCentralLocation();
    expect(requestDeviceLocation).not.toHaveBeenCalled();
    expect(res.ok && res.coords.latitude).toBe(21.42);
    const s = getCentralLocationState();
    expect(s.source).toBe('manual');
    expect(s.manual?.label).toBe('مكة المكرمة');
  });

  it('explicit GPS refresh bypasses the manual override but keeps it effective', async () => {
    setManualLocation(21.42, 39.82, 'مكة المكرمة');
    requestDeviceLocation.mockResolvedValue(OK);
    const res = await refreshDeviceLocation();
    expect(res.ok && res.coords.latitude).toBe(30.04);
    const s = getCentralLocationState();
    expect(s.source).toBe('manual');
    expect(s.deviceCoords?.latitude).toBe(30.04);
    expect(s.coords?.latitude).toBe(21.42);
  });

  it('clearing the manual city falls back to the shared device coords', async () => {
    requestDeviceLocation.mockResolvedValue(OK);
    await ensureCentralLocation();
    setManualLocation(21.42, 39.82, 'مكة المكرمة');
    clearManualLocation();
    const s = getCentralLocationState();
    expect(s.manual).toBeNull();
    expect(s.source).toBe('device');
    expect(s.coords?.latitude).toBe(30.04);
  });

  it('manual override survives a reload via shared persistence', () => {
    setManualLocation(21.42, 39.82, 'مكة المكرمة');
    resetCentralLocationForTests(false);
    const s = getCentralLocationState();
    expect(s.source).toBe('manual');
    expect(s.coords?.latitude).toBe(21.42);
  });

  it('device coords survive a reload via shared persistence', async () => {
    requestDeviceLocation.mockResolvedValue(OK);
    await ensureCentralLocation();
    resetCentralLocationForTests(false);
    const s = getCentralLocationState();
    expect(s.source).toBe('device');
    expect(s.deviceCoords?.longitude).toBe(31.23);
  });

  it('adopts the legacy qibla-only saved location once', () => {
    window.localStorage.setItem('rabbani-qibla-location-v1', JSON.stringify({latitude: 24.7, longitude: 46.7, accuracy: 10}));
    resetCentralLocationForTests(false);
    expect(getCentralLocationState().deviceCoords?.latitude).toBe(24.7);
  });

  it('rejects corrupt stored coordinates instead of trusting them', () => {
    window.localStorage.setItem('rabbani-central-location-v1', JSON.stringify({latitude: 500, longitude: 31.2}));
    window.localStorage.setItem('rabbani-central-location-manual-v1', '{"latitude":"x"}');
    resetCentralLocationForTests(false);
    const s = getCentralLocationState();
    expect(s.deviceCoords).toBeNull();
    expect(s.manual).toBeNull();
    expect(s.status).toBe('idle');
  });

  it('syncCentralLocationPermission reflects denial without prompting', async () => {
    checkLocationPermission.mockResolvedValue('denied');
    const p = await syncCentralLocationPermission();
    expect(p).toBe('denied');
    expect(requestDeviceLocation).not.toHaveBeenCalled();
    expect(getCentralLocationState().status).toBe('denied');
  });
});
