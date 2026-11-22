import { afterEach, describe, expect, it } from 'vitest';
import {
  expandAudioFallbackUrls,
  isBundledWebAssetUrl,
  isLocalOrBundledAudioUrl,
  isWebOnlyAudioUrl,
  resolveAudioUrlForNative,
  resolveAudioUrlForWeb,
} from './url-resolver';
import { azkarAudioFallbackUrls, azkarAudioUrl } from '../azkar/content';

describe('audio url-resolver', () => {
  const prevWin = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (prevWin === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWin;
    }
  });

  it('normalizes local bundled asset paths for WebView', () => {
    expect(resolveAudioUrlForWeb('/sounds/adhan/adhan_almulla.ogg')).toBe('/sounds/adhan/adhan_almulla.ogg');
    expect(resolveAudioUrlForWeb('sounds/adhan/adhan_almulla.ogg')).toBe('/sounds/adhan/adhan_almulla.ogg');
    expect(resolveAudioUrlForWeb('./sounds/adhan/adhan_madinah.ogg')).toBe('/sounds/adhan/adhan_madinah.ogg');
    expect(resolveAudioUrlForWeb('file:///android_asset/public/sounds/adhan/adhan_ahmad.ogg')).toBe('/sounds/adhan/adhan_ahmad.ogg');
    expect(isBundledWebAssetUrl('/sounds/adhan/adhan_almulla.ogg')).toBe(true);
    expect(isBundledWebAssetUrl('https://localhost/sounds/adhan/adhan_almulla.ogg')).toBe(true);
    expect(isBundledWebAssetUrl('https://localhost/_capacitor_file_/data/user/0/test.mp3')).toBe(false);
  });

  it('converts device file paths with Capacitor.convertFileSrc inside Capacitor WebView', () => {
    (globalThis as { window: unknown }).window = {
      Capacitor: {
        isNativePlatform: () => true,
        convertFileSrc: (p: string) => `https://localhost/_capacitor_file_${p.replace(/^file:\/\//, '')}`,
      },
    };
    expect(resolveAudioUrlForWeb('file:///data/user/0/com.alrabbaniyoon.app/files/custom.mp3')).toBe(
      'https://localhost/_capacitor_file_/data/user/0/com.alrabbaniyoon.app/files/custom.mp3',
    );
    expect(resolveAudioUrlForWeb('/storage/emulated/0/Music/adhan test.mp3')).toBe(
      'https://localhost/_capacitor_file_/storage/emulated/0/Music/adhan%20test.mp3',
    );
  });

  it('upgrades external http:// and protocol-relative // URLs to https:// for WebView mixed-content safety', () => {
    expect(resolveAudioUrlForWeb('//verses.quran.com/Alafasy/mp3/001001.mp3')).toBe(
      'https://verses.quran.com/Alafasy/mp3/001001.mp3',
    );
    expect(resolveAudioUrlForWeb('http://cdn.mp3quran.net/audio/afs/001.mp3')).toBe(
      'https://cdn.mp3quran.net/audio/afs/001.mp3',
    );
    expect(resolveAudioUrlForWeb('http://localhost:3000/sounds/adhan/adhan_almulla.ogg')).toBe(
      'http://localhost:3000/sounds/adhan/adhan_almulla.ogg',
    );
  });

  it('rejects dangerous schemes and non-audio data URIs', () => {
    expect(resolveAudioUrlForWeb('javascript:alert(1)')).toBeNull();
    expect(resolveAudioUrlForWeb('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(resolveAudioUrlForWeb('')).toBeNull();
    expect(resolveAudioUrlForWeb('data:audio/mpeg;base64,SUQz')).toBe('data:audio/mpeg;base64,SUQz');
    expect(resolveAudioUrlForWeb('blob:https://localhost/1234')).toBe('blob:https://localhost/1234');
  });

  it('unwraps Capacitor WebView origins and flags Web-only schemes for native service', () => {
    expect(resolveAudioUrlForNative('https://localhost/sounds/adhan/adhan_almulla.ogg')).toBe(
      '/sounds/adhan/adhan_almulla.ogg',
    );
    expect(resolveAudioUrlForNative('capacitor://localhost/sounds/adhan/adhan_hamad.ogg')).toBe(
      '/sounds/adhan/adhan_hamad.ogg',
    );
    expect(resolveAudioUrlForNative('https://localhost/_capacitor_file_/data/user/0/app/a.mp3')).toBe(
      '/data/user/0/app/a.mp3',
    );
    expect(resolveAudioUrlForNative('file:///android_asset/public/sounds/adhan/adhan_madinah2.ogg')).toBe(
      '/sounds/adhan/adhan_madinah2.ogg',
    );
    expect(isWebOnlyAudioUrl('blob:https://localhost/abc')).toBe(true);
    expect(resolveAudioUrlForNative('blob:https://localhost/abc')).toBeNull();
    expect(isLocalOrBundledAudioUrl('sounds/adhan/adhan_almulla.ogg')).toBe(true);
    expect(isLocalOrBundledAudioUrl('https://cdn.mp3quran.net/audio/afs/001.mp3')).toBe(false);
  });

  it('expands Azkar audio URLs with jsDelivr CDN mirror fallback', () => {
    const primary = azkarAudioUrl('/audio/75.mp3');
    const explicit = azkarAudioFallbackUrls('/audio/75.mp3');
    expect(primary).toBe('https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/audio/75.mp3');
    expect(explicit).toEqual(['https://cdn.jsdelivr.net/gh/YousefAsalya/Islamic-Pro-azkar-API@main/audio/75.mp3']);

    const candidates = expandAudioFallbackUrls(primary!, [], 'web');
    expect(candidates).toEqual([
      'https://raw.githubusercontent.com/YousefAsalya/Islamic-Pro-azkar-API/main/audio/75.mp3',
      'https://cdn.jsdelivr.net/gh/YousefAsalya/Islamic-Pro-azkar-API@main/audio/75.mp3',
    ]);
  });
});
