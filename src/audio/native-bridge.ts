import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AudioCategory, AudioStatus, AudioTrack } from './types';

export interface NativeAudioStateSnapshot {
  completedTrackId?: string;
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
      fallbackUrls?: string[];
      category: AudioCategory;
      isLive?: boolean;
      playbackRate?:number;
    }>;
    startIndex: number;
    category: AudioCategory;
  }): Promise<{ started: boolean }>;
  playSingle(track: AudioTrack): Promise<void>;
  setPlaybackRate(options:{rate:number}):Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
  seekTo(options: { positionSec: number }): Promise<void>;
  getState(): Promise<NativeAudioStateSnapshot>;
  setSleepTimer(options: { minutes: number }): Promise<{ minutes: number }>;
  /** شاشة التشخيص — حالة المشغل (volume, status, error). */
  diagnosticInfo(): Promise<NativeAudioStateSnapshot & {volumeL?: number; volumeR?: number; hasFocus?: boolean; prepared?: boolean; audioVolumeMusic?: number; audioVolumeMaxMusic?: number; audioVolumeWeb?: number; error?: string | null; currentTrack: NativeAudioStateSnapshot['currentTrack']}>;
  /** إرسال إشعار تجريبي للأذان (مع دعم اختيار المؤذن والتشغيل الفوري/الكامل). */
  testAdhanNotification(options?: { rawSound?: string; soundTitle?: string; full?: boolean; delayMs?: number }): Promise<{scheduled: boolean; channelId?: string}>;
  /** فتح إعدادات قناة الأذان (ACTION_CHANNEL_NOTIFICATION_SETTINGS). */
  openAdhanChannelSettings(options?: { rawSound?: string }): Promise<{opened: boolean; error?: string}>;
  downloadOfflineAudio?(options: {id: string; url: string}): Promise<{id: string; bytes: number; alreadyExists?: boolean}>;
  cancelOfflineDownloads?(): Promise<{cancelled: boolean}>;
  deleteOfflineAudio?(options: {id?: string; prefix?: string}): Promise<{deletedCount: number; freedBytes: number}>;
  listOfflineAudio?(): Promise<{totalBytes: number; files: Array<{name: string; bytes: number}>}>;
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
