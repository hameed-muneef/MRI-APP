// src/lib/location-store.ts
// مخزن مركزي واحد لموقع الجهاز وإذن الموقع. كل أجزاء التطبيق التي تحتاج الموقع
// (مواقيت الصلاة، القبلة، المساجد القريبة، منتقي مدينة الصلاة) تقرأ من هنا بدل
// أن تطلب الإذن كلٌّ على حدة. طلب النظام للموقع يحدث مرة واحدة كحد أقصى في كل
// لحظة (طلب واحد مُدمَج) ونتيجته تنعكس على كل المشتركين.

import {
  checkLocationPermission,
  hasAskedLocation,
  isNativePlatform,
  openLocationSettings as openNativeLocationSettings,
  requestDeviceLocation,
  type LocationPermissionState,
  type LocationResult,
} from './device-location';

export type CentralLocationStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  | 'denied'
  | 'error'
  | 'unsupported';

export interface CentralCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface CentralManualLocation {
  latitude: number;
  longitude: number;
  label: string;
}

export interface CentralLocationState {
  status: CentralLocationStatus;
  permission: LocationPermissionState;
  /** الإحداثيات الفعالة: اليدوية إن وُجدت وإلا إحداثيات الجهاز. */
  coords: CentralCoords | null;
  deviceCoords: CentralCoords | null;
  manual: CentralManualLocation | null;
  source: 'device' | 'manual' | null;
  error: string | null;
  permanentlyDenied: boolean;
  /** آخر نجاح فعلي لتحديد موقع الجهاز (ms epoch). */
  locatedAt: number | null;
}

const DEVICE_KEY = 'rabbani-central-location-v1';
const MANUAL_KEY = 'rabbani-central-location-manual-v1';
/** مفتاح قديم كان يخص القبلة وحدها — يُتبنّى مرة واحدة ثم يُهمل. */
const LEGACY_QIBLA_KEY = 'rabbani-qibla-location-v1';

/** مدة صلاحية إحداثيات الجهاز قبل إعادة الطلب من المستشعر. */
export const DEFAULT_LOCATION_FRESH_MS = 5 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function validCoords(value: unknown): CentralCoords | null {
  const v = value as Partial<CentralCoords> | null;
  if (!v || typeof v.latitude !== 'number' || typeof v.longitude !== 'number') return null;
  if (v.latitude < -90 || v.latitude > 90 || v.longitude < -180 || v.longitude > 180) return null;
  return {
    latitude: v.latitude,
    longitude: v.longitude,
    accuracy: typeof v.accuracy === 'number' && v.accuracy >= 0 ? v.accuracy : 0,
  };
}

function readStoredDevice(): { coords: CentralCoords; locatedAt: number | null } | null {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(DEVICE_KEY) ?? store.getItem(LEGACY_QIBLA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CentralCoords> & { locatedAt?: unknown };
    const coords = validCoords(parsed);
    if (!coords) return null;
    const locatedAt = typeof parsed.locatedAt === 'number' && parsed.locatedAt > 0 ? parsed.locatedAt : null;
    return { coords, locatedAt };
  } catch {
    return null;
  }
}

function readStoredManual(): CentralManualLocation | null {
  try {
    const store = storage();
    if (!store) return null;
    const raw = store.getItem(MANUAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CentralManualLocation>;
    if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') return null;
    if (parsed.latitude < -90 || parsed.latitude > 90 || parsed.longitude < -180 || parsed.longitude > 180) return null;
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      label: typeof parsed.label === 'string' ? parsed.label.slice(0, 120) : '',
    };
  } catch {
    return null;
  }
}

function persistDevice(coords: CentralCoords, locatedAt: number): void {
  try {
    storage()?.setItem(DEVICE_KEY, JSON.stringify({ ...coords, locatedAt }));
  } catch { /* ignore */ }
}

function persistManual(manual: CentralManualLocation | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (manual) store.setItem(MANUAL_KEY, JSON.stringify(manual));
    else store.removeItem(MANUAL_KEY);
  } catch { /* ignore */ }
}

function initialState(): CentralLocationState {
  const device = readStoredDevice();
  const manual = readStoredManual();
  if (manual) {
    return {
      status: 'ready',
      permission: 'prompt',
      coords: { latitude: manual.latitude, longitude: manual.longitude, accuracy: 0 },
      deviceCoords: device?.coords ?? null,
      manual,
      source: 'manual',
      error: null,
      permanentlyDenied: false,
      locatedAt: device?.locatedAt ?? null,
    };
  }
  if (device) {
    return {
      status: 'ready',
      permission: 'prompt',
      coords: device.coords,
      deviceCoords: device.coords,
      manual: null,
      source: 'device',
      error: null,
      permanentlyDenied: false,
      locatedAt: device.locatedAt,
    };
  }
  return {
    status: 'idle',
    permission: 'prompt',
    coords: null,
    deviceCoords: null,
    manual: null,
    source: null,
    error: null,
    permanentlyDenied: false,
    locatedAt: null,
  };
}

let state: CentralLocationState | null = null;
const listeners = new Set<(next: CentralLocationState) => void>();
let inFlight: Promise<LocationResult> | null = null;

function current(): CentralLocationState {
  if (!state) state = initialState();
  return state;
}

function emit(): void {
  const snapshot = current();
  for (const listener of listeners) listener(snapshot);
}

function patch(partial: Partial<CentralLocationState>): void {
  state = { ...current(), ...partial };
  emit();
}

function effectiveCoords(deviceCoords: CentralCoords | null, manual: CentralManualLocation | null): CentralCoords | null {
  if (manual) return { latitude: manual.latitude, longitude: manual.longitude, accuracy: 0 };
  return deviceCoords;
}

export function getCentralLocationState(): CentralLocationState {
  return current();
}

export function subscribeCentralLocation(listener: (next: CentralLocationState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function applyResult(res: LocationResult): LocationResult {
  if (res.ok) {
    const coords: CentralCoords = {
      latitude: res.coords.latitude,
      longitude: res.coords.longitude,
      accuracy: res.coords.accuracy,
    };
    const locatedAt = Date.now();
    persistDevice(coords, locatedAt);
    const s = current();
    patch({
      status: 'ready',
      permission: 'granted',
      deviceCoords: coords,
      coords: effectiveCoords(coords, s.manual),
      source: s.manual ? 'manual' : 'device',
      error: null,
      permanentlyDenied: false,
      locatedAt,
    });
    return res;
  }
  const denied = res.reason === 'denied' || res.reason === 'permanently-denied';
  patch({
    status: res.reason === 'unsupported' ? 'unsupported' : denied ? 'denied' : 'error',
    permission: denied ? 'denied' : res.reason === 'unsupported' ? 'unsupported' : current().permission,
    error: res.message,
    permanentlyDenied: res.reason === 'permanently-denied' || (res.reason === 'denied' && hasAskedLocation()),
  });
  return res;
}

export interface EnsureLocationOptions {
  timeout?: number;
  maximumAge?: number;
  /** أعد استخدام إحداثيات الجهاز المخزنة إن لم يمضِ عليها أكثر من هذه المدة. */
  freshWithinMs?: number;
  /** تجاهل التخزين المؤقت وأعد طلب المستشعر. */
  force?: boolean;
}

/**
 * يضمن توفّر موقع فعال لكل المتصلين. طلب واحد فقط يصل إلى نظام التشغيل مهما
 * تعددت الأجزاء الطالبة في اللحظة نفسها؛ الجميع يشارك النتيجة نفسها.
 */
export async function ensureCentralLocation(options: EnsureLocationOptions = {}): Promise<LocationResult> {
  const s = current();
  // الموقع اليدوي يغلب إلا عند طلب صريح لموقع الجهاز (force).
  if (s.manual && !options.force) {
    return {
      ok: true,
      coords: { latitude: s.manual.latitude, longitude: s.manual.longitude, accuracy: 0 },
      source: isNativePlatform() ? 'native' : 'web',
    };
  }
  const freshWithin = options.freshWithinMs ?? DEFAULT_LOCATION_FRESH_MS;
  if (
    !options.force
    && s.deviceCoords
    && s.locatedAt
    && Date.now() - s.locatedAt <= freshWithin
  ) {
    return {
      ok: true,
      coords: s.deviceCoords,
      source: isNativePlatform() ? 'native' : 'web',
    };
  }
  if (inFlight) return inFlight;
  patch({ status: 'locating', error: null });
  inFlight = requestDeviceLocation({ timeout: options.timeout ?? 15000, maximumAge: options.maximumAge ?? 0 })
    .then((res) => applyResult(res))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** طلب صريح من المستخدم (زر «استخدام موقعي»): يحدّث إحداثيات الجهاز دائمًا. */
export async function refreshDeviceLocation(options: EnsureLocationOptions = {}): Promise<LocationResult> {
  return ensureCentralLocation({ ...options, force: true });
}

/** يزامن حالة الإذن من النظام دون طلبه (لا يُظهر نافذة إذن). */
export async function syncCentralLocationPermission(): Promise<LocationPermissionState> {
  const permission = await checkLocationPermission();
  const s = current();
  const next: Partial<CentralLocationState> = { permission };
  if (permission === 'denied' && !s.deviceCoords && !s.manual && s.status !== 'locating') {
    next.status = 'denied';
    next.error = 'لم يُسمح بالوصول للموقع. يمكنك اختيار مدينتك يدويًا.';
    next.permanentlyDenied = hasAskedLocation();
  }
  patch(next);
  return permission;
}

export function setManualLocation(latitude: number, longitude: number, label: string): void {
  const manual: CentralManualLocation = { latitude, longitude, label: label.slice(0, 120) };
  persistManual(manual);
  const s = current();
  patch({
    status: 'ready',
    manual,
    coords: { latitude, longitude, accuracy: 0 },
    source: 'manual',
    error: null,
    deviceCoords: s.deviceCoords,
  });
}

export function clearManualLocation(): void {
  persistManual(null);
  const s = current();
  patch({
    manual: null,
    coords: s.deviceCoords,
    source: s.deviceCoords ? 'device' : null,
    status: s.deviceCoords ? 'ready' : 'idle',
    error: null,
  });
}

export async function openCentralLocationSettings(): Promise<boolean> {
  return openNativeLocationSettings();
}

/** إعادة ضبط الذاكرة للاختبارات فقط؛ لا تمسح التخزين إلا عند الطلب. */
export function resetCentralLocationForTests(clearStorage = true): void {
  if (clearStorage) {
    try {
      storage()?.removeItem(DEVICE_KEY);
      storage()?.removeItem(MANUAL_KEY);
      storage()?.removeItem(LEGACY_QIBLA_KEY);
    } catch { /* ignore */ }
  }
  state = null;
  inFlight = null;
  listeners.clear();
      }
