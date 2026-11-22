export type AudioCategory = 'quran' | 'azkar' | 'haramain';

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface AudioTrack {
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  fallbackUrls?: string[];
  category: AudioCategory;
  isLive?: boolean;
  meta?: Record<string, string | number>;
}

export interface AudioPlayerState {
  status: AudioStatus;
  category: AudioCategory | null;
  queue: AudioTrack[];
  currentIndex: number;
  currentTrack: AudioTrack | null;
  currentTime: number;
  duration: number;
  error: string | null;
}
