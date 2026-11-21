import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AudioCategory, AudioStatus, AudioTrack } from './types';

export interface NativeAudioStateSnapshot {
  status: AudioStatus;
  category: AudioCategory | null;
  currentIndex: number;
  currentTrack: {
    id: string;
    title: string;
    subtitle?: string;
    url: string;
    category: AudioCategory;
    isLive?: boolean;
  } | null;
  currentTime: number;
  duration: number;
  error: string | null;
  queueLength: number;
}

export interface BackgroundAudioPluginInterface {
  playQueue(options: {
    queue: Array<{
      id: string;
      title: string;
      subtitle?: string;
      url: string;
      category: AudioCategory;
      isLive?: boolean;
    }>;
    startIndex: number;
    category: AudioCategory;
  }): Promise<{ started: boolean }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(options: { positionSec: number }): Promise<void>;
  getState(): Promise<NativeAudioStateSnapshot>;
  addListener(
    eventName: 'stateChange',
    listenerFunc: (state: NativeAudioStateSnapshot) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeBackgroundAudio = registerPlugin<BackgroundAudioPluginInterface>('BackgroundAudio');

export function isNativeBackgroundAudioSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function getNativeBackgroundAudioPlugin(): BackgroundAudioPluginInterface | null {
  if (!isNativeBackgroundAudioSupported()) return null;
  return NativeBackgroundAudio;
}
