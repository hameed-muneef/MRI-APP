// src/lib/native-compass.ts
import { registerPlugin } from '@capacitor/core';
import { isNativePlatform } from './device-location';

export interface NativeCompassHeading {
  heading: number;
  magneticHeading: number;
  pitch: number;
  roll: number;
}

interface NativeCompassPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  setDeclination(opts: { latitude: number; longitude: number; altitude?: number }): Promise<{ declination: number }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(eventName: 'heading', cb: (data: NativeCompassHeading) => void): Promise<{ remove: () => Promise<void> }>;
}

export const NativeCompass = registerPlugin<NativeCompassPlugin>('NativeCompass');

export { isNativePlatform };
