import { Capacitor } from '@capacitor/core';

const BLOCKED_SCHEMES_RE = /^(?:javascript|vbscript|about|chrome|chrome-extension):/i;
const CAPACITOR_ORIGIN_RE = /^(?:https?|capacitor):\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/.*)?$/i;
const LOCAL_DEVICE_PATH_RE = /^(?:\/(?:data|storage|sdcard|mnt|emulated|var\/mobile)\/)/i;
const LOCALHOST_HTTP_RE = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?::\d+)?(?:\/|$)/i;

const AZKAR_RAW_PREFIX = 'https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/';
const AZKAR_JSDELIVR_PREFIX = 'https://cdn.jsdelivr.net/gh/YousefAsalya/Islamic-Pro-azkar-API@main/';

function encodeSpaces(value: string): string {
  return value.replace(/ /g, '%20');
}

function isSafeDataAudioUrl(value: string): boolean {
  return /^data:audio\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*(?:;base64)?,/i.test(value);
}

function isSupportedSchemeOrPath(raw: string): boolean {
  if (!raw || BLOCKED_SCHEMES_RE.test(raw)) return false;
  if (/^data:/i.test(raw)) return isSafeDataAudioUrl(raw);
  if (/^(?:https?:|blob:|capacitor:|file:|content:)/i.test(raw)) return true;
  if (raw.startsWith('//') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return true;
  // Bare relative asset path (e.g. "sounds/adhan/adhan_almulla.ogg") without unknown colon scheme
  return !/^[a-z][a-z0-9+.-]*:/i.test(raw);
}

function getConvertFileSrc(): ((filePath: string) => string) | null {
  try {
    if (typeof window !== 'undefined') {
      const cap = (window as unknown as { Capacitor?: { convertFileSrc?: (p: string) => string } }).Capacitor;
      if (typeof cap?.convertFileSrc === 'function') {
        return (p: string) => cap.convertFileSrc!(p);
      }
    }
    if (typeof Capacitor?.convertFileSrc === 'function') {
      return (p: string) => Capacitor.convertFileSrc(p);
    }
  } catch { /* ignore */ }
  return null;
}

export function isNativeCapacitorWebView(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (typeof cap?.isNativePlatform === 'function') {
        return Boolean(cap.isNativePlatform());
      }
    }
    return Boolean(Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** URLs backed by in-memory WebView objects (`blob:` / `data:audio/...`) cannot be fetched by native BackgroundAudioService. */
export function isWebOnlyAudioUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  return /^blob:/i.test(trimmed) || isSafeDataAudioUrl(trimmed);
}

/** True when the audio path points to a local/app-bundled/Capacitor asset that does not require internet. */
export function isLocalOrBundledAudioUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || !isSupportedSchemeOrPath(trimmed)) return false;
  if (isWebOnlyAudioUrl(trimmed)) return true;
  if (/^(?:file:|content:|capacitor:)/i.test(trimmed)) return true;
  if (CAPACITOR_ORIGIN_RE.test(trimmed) || LOCALHOST_HTTP_RE.test(trimmed)) return true;
  if (trimmed.startsWith('//')) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) return true;
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

/** True when a path resolves to an app-bundled web asset (`/sounds/...`, `/azkar/...`, etc.) served by WebViewLocalServer. */
export function isBundledWebAssetUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.startsWith('//')) return false;
  if (/^file:\/\/\/android_asset\/public\//i.test(trimmed)) return true;
  const capMatch = CAPACITOR_ORIGIN_RE.exec(trimmed);
  if (capMatch) {
    const p = capMatch[1] || '/';
    return !p.startsWith('/_capacitor_file_/');
  }
  if (/^https?:\/\//i.test(trimmed) || isWebOnlyAudioUrl(trimmed) || /^file:/i.test(trimmed) || /^content:/i.test(trimmed)) {
    return false;
  }
  if (LOCAL_DEVICE_PATH_RE.test(trimmed)) return false;
  return true;
}

/**
 * Normalizes and validates an audio path/URL for safe playback in Capacitor/Browser WebView (`<audio>` / `fetch`).
 * - Rejects unsafe schemes (`javascript:`, HTML `data:`, etc.).
 * - Maps `file:///android_asset/public/...` and relative asset paths to root-relative `/...`.
 * - Converts local device `file://` or `/data/...` paths via `Capacitor.convertFileSrc` when in Capacitor WebView.
 * - Upgrades protocol-relative `//` and external `http://` URLs to `https://` to comply with `allowMixedContent: false`.
 */
export function resolveAudioUrlForWeb(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || !isSupportedSchemeOrPath(trimmed)) return null;

  if (isWebOnlyAudioUrl(trimmed)) {
    return trimmed;
  }

  // Unwrap Android bundled asset URL -> WebView origin root path
  if (/^file:\/\/\/android_asset\/public\//i.test(trimmed)) {
    return encodeSpaces('/' + trimmed.replace(/^file:\/\/\/android_asset\/public\/+/i, ''));
  }

  // Device filesystem paths must go through Capacitor's `_capacitor_file_` proxy in WebView
  if (/^file:\/\//i.test(trimmed) || LOCAL_DEVICE_PATH_RE.test(trimmed)) {
    const convert = getConvertFileSrc();
    if (convert && (isNativeCapacitorWebView() || LOCAL_DEVICE_PATH_RE.test(trimmed))) {
      return encodeSpaces(convert(trimmed));
    }
    return encodeSpaces(trimmed);
  }

  if (/^content:\/\//i.test(trimmed)) {
    const convert = getConvertFileSrc();
    return encodeSpaces(convert ? convert(trimmed) : trimmed);
  }

  if (trimmed.startsWith('//')) {
    return encodeSpaces(`https:${trimmed}`);
  }

  if (/^http:\/\//i.test(trimmed)) {
    if (LOCALHOST_HTTP_RE.test(trimmed)) {
      return encodeSpaces(trimmed);
    }
    return encodeSpaces(`https://${trimmed.slice('http://'.length)}`);
  }

  if (/^(?:https|capacitor):\/\//i.test(trimmed)) {
    return encodeSpaces(trimmed);
  }

  // App-bundled relative or root-relative asset path (e.g., "sounds/adhan/adhan_almulla.ogg" or "./sounds/...")
  const normalized = trimmed.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
  return encodeSpaces(`/${normalized}`);
}

/**
 * Normalizes an audio path/URL for the native Android `BackgroundAudioService`:
 * - Returns `null` for `blob:` / `data:` URLs (must play in WebView directly).
 * - Unwraps `https://localhost/...`, `http://localhost/...`, `capacitor://localhost/...`:
 *   - `/_capacitor_file_/data/...` -> real local file path `/data/...`
 *   - `/sounds/...` -> bundled APK asset path `/sounds/...`
 * - Unwraps `file:///android_asset/public/...` -> `/...`
 * - Upgrades `//...` -> `https://...` (keeps explicit `http://` allowed for native HttpURLConnection).
 */
export function resolveAudioUrlForNative(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || !isSupportedSchemeOrPath(trimmed)) return null;
  if (isWebOnlyAudioUrl(trimmed)) return null;

  if (/^file:\/\/\/android_asset\/public\//i.test(trimmed)) {
    return encodeSpaces('/' + trimmed.replace(/^file:\/\/\/android_asset\/public\/+/i, ''));
  }

  const capMatch = CAPACITOR_ORIGIN_RE.exec(trimmed);
  if (capMatch) {
    const rawPath = capMatch[1] || '/';
    if (rawPath.startsWith('/_capacitor_file_/')) {
      return encodeSpaces('/' + rawPath.slice('/_capacitor_file_/'.length).replace(/^\/+/, ''));
    }
    return encodeSpaces(rawPath);
  }

  if (trimmed.startsWith('//')) {
    return encodeSpaces(`https:${trimmed}`);
  }

  if (/^(?:https?|file|content):\/\//i.test(trimmed)) {
    return encodeSpaces(trimmed);
  }

  const normalized = trimmed.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '');
  return encodeSpaces(`/${normalized}`);
}

/** Derives resilient mirror/fallback URLs for known audio CDNs and protocols. */
export function expandAudioFallbackUrls(
  primaryUrl: string,
  explicitFallbacks?: readonly string[],
  target: 'web' | 'native' = 'web',
): string[] {
  const resolveFn = target === 'native' ? resolveAudioUrlForNative : resolveAudioUrlForWeb;
  const candidates: string[] = [];
  const seen = new Set<string>();

  const push = (candidate: string | null | undefined) => {
    const resolved = resolveFn(candidate);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push(resolved);
  };

  const addDerivedMirrors = (url: string | null) => {
    if (!url) return;
    if (url.startsWith(AZKAR_RAW_PREFIX)) {
      push(`${AZKAR_JSDELIVR_PREFIX}${url.slice(AZKAR_RAW_PREFIX.length)}`);
    } else if (url.startsWith(AZKAR_JSDELIVR_PREFIX)) {
      push(`${AZKAR_RAW_PREFIX}${url.slice(AZKAR_JSDELIVR_PREFIX.length)}`);
    }
  };

  const resolvedPrimary = resolveFn(primaryUrl);
  push(resolvedPrimary);
  if (explicitFallbacks) {
    for (const fb of explicitFallbacks) {
      push(fb);
    }
  }
  addDerivedMirrors(resolvedPrimary);
  if (target === 'native' && /^http:\/\//i.test(primaryUrl.trim()) && !LOCALHOST_HTTP_RE.test(primaryUrl.trim())) {
    // Prefer HTTPS first when native supports it, then keep original HTTP as last resort if TLS fails.
    const httpsVariant = `https://${primaryUrl.trim().slice('http://'.length)}`;
    const nativeHttps = resolveFn(httpsVariant);
    if (nativeHttps && !seen.has(nativeHttps)) {
      return [nativeHttps, ...candidates];
    }
  }

  return candidates;
}

/**
 * In Capacitor Android WebView, `WebViewLocalServer` has a known limitation with 206 byte-range
 * responses (`LollipopLazyInputStream` streams from byte 0 even when `Range: bytes=N-` is requested).
 * Fetching small bundled assets as a `Blob` avoids range corruption and lets Chromium `<audio>` seek cleanly.
 */
export async function loadLocalAudioObjectUrlForWebView(
  rawUrl: string,
  signal?: AbortSignal,
): Promise<{ url: string; revoke: () => void } | null> {
  const resolved = resolveAudioUrlForWeb(rawUrl);
  if (!resolved || !isBundledWebAssetUrl(rawUrl)) return null;
  if (!isNativeCapacitorWebView()) return null;
  if (typeof fetch !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return null;
  }

  try {
    const res = await fetch(resolved, { signal, cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    const objectUrl = URL.createObjectURL(blob);
    return {
      url: objectUrl,
      revoke: () => {
        try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ }
      },
    };
  } catch {
    return null;
  }
}
