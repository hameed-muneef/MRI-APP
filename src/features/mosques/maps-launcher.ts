import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';
import { buildGoogleMapsDirectionsUrl, type TravelMode } from '../../lib/geo';

export async function openMosqueDirections(
  lat: number,
  lng: number,
  travelMode: TravelMode,
): Promise<{ opened: boolean; url: string }> {
  const url = buildGoogleMapsDirectionsUrl(lat, lng, travelMode);

  if (Capacitor.isNativePlatform()) {
    try {
      const { completed } = await AppLauncher.openUrl({ url });
      if (completed) return { opened: true, url };
    } catch {
      // Fall through to browser open
    }
  }

  const win = typeof window !== 'undefined' ? window.open(url, '_blank', 'noopener,noreferrer') : null;
  return { opened: Boolean(win) || !Capacitor.isNativePlatform(), url };
}
