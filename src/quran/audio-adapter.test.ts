import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SessionAudioAdapter,
  SOURCE_CAPABILITIES,
  buildSequentialQueue,
  isHafsQuranComReciter,
  SESSION_AUDIO_OWNER,
  type PlaybackOwner,
} from './audio-adapter';
import type { AudioPlayerState, AudioTrack } from '../audio/types';

function fakePlayer() {
  let state: AudioPlayerState = {
    status: 'idle', category: null, queue: [], currentIndex: -1, currentTrack: null, currentTime: 0, duration: 0, error: null,
  };
  const listeners = new Set<(s: AudioPlayerState) => void>();
  const emit = () => listeners.forEach((l) => l(state));
  const player: PlaybackOwner & {
    played: AudioTrack[][];
    stopped: number;
    setState(s: Partial<AudioPlayerState>): void;
  } = {
    played: [],
    stopped: 0,
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    playQueue: async (tracks) => {
      player.played.push(tracks);
      state = { ...state, status: 'playing', queue: tracks, currentIndex: 0, currentTrack: tracks[0], category: 'quran' };
      emit();
    },
    stop: async () => {
      player.stopped += 1;
      state = { ...INITIAL, queue: [], currentTrack: null };
      emit();
    },
    setState: (s) => { state = { ...state, ...s }; emit(); },
  };
  const INITIAL = state;
  return player;
}

function mockAudioApi(url: string | null) {
  globalThis.fetch = vi.fn(async () => ({
    ok: url !== null,
    json: async () => ({ audio_files: url ? [{ url }] : [] }),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('audio adapter capabilities and narration guard', () => {
  it('exposes a capability entry for every source kind', () => {
    expect(Object.keys(SOURCE_CAPABILITIES).sort()).toEqual(['everyayah-folder', 'live-stream', 'qurancom-ayah', 'qurancom-chapter']);
    expect(SOURCE_CAPABILITIES['qurancom-ayah'].perAyah).toBe(true);
    expect(SOURCE_CAPABILITIES['live-stream'].perAyah).toBe(false);
  });
  it('accepts only known Hafs Quran.com reciters and rejects others without substituting', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    expect(isHafsQuranComReciter(7)).toBe(true);
    mockAudioApi('https://verses.quran.com/x.mp3');
    const rejected = await adapter.playVerse({ reciterId: 999, surah: 1, ayah: 1, title: 't' });
    expect(rejected).toBe('rejected-narration');
    expect(player.played).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('playVerse lifecycle', () => {
  it('resolves ended when the owned track finishes and the player goes idle', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    mockAudioApi('https://verses.quran.com/a.mp3');
    const pending = adapter.playVerse({ reciterId: 7, surah: 1, ayah: 2, title: 't' });
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    expect(player.played[0][0].meta?.owner).toBe(SESSION_AUDIO_OWNER);
    player.setState({ status: 'idle', currentTrack: null, queue: [], completedTrackId: player.played[0][0].id });
    await expect(pending).resolves.toBe('ended');
  });
  it('reports missing audio explicitly and never plays', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    mockAudioApi(null);
    await expect(adapter.playVerse({ reciterId: 7, surah: 1, ayah: 3, title: 't' })).resolves.toBe('missing');
    expect(player.played).toHaveLength(0);
  });
  it('reports playback errors from the player', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    mockAudioApi('https://verses.quran.com/b.mp3');
    const pending = adapter.playVerse({ reciterId: 7, surah: 1, ayah: 4, title: 't' });
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    player.setState({ status: 'error', error: 'boom' });
    await expect(pending).resolves.toBe('error');
  });
  it('detects preemption when another owner takes the player', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    mockAudioApi('https://verses.quran.com/c.mp3');
    const pending = adapter.playVerse({ reciterId: 7, surah: 1, ayah: 5, title: 't' });
    await vi.waitFor(() => expect(player.played).toHaveLength(1));
    player.setState({ currentTrack: { id: 'quran:reader-ayah:1:1', title: 'x', url: 'u', category: 'quran' }, status: 'playing' });
    await expect(pending).resolves.toBe('preempted');
  });
  it('cancel aborts an in-flight resolution and stops only owned playback', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    mockAudioApi('https://verses.quran.com/d.mp3');
    const pending = adapter.playVerse({ reciterId: 7, surah: 1, ayah: 6, title: 't' });
    adapter.cancel();
    await expect(pending).resolves.toBe('cancelled');
    expect(player.played).toHaveLength(0);
    // إيقاف صوت لا نملكه ممنوع
    player.setState({ currentTrack: { id: 'other', title: 'x', url: 'u', category: 'quran' }, status: 'playing' });
    adapter.cancel();
    expect(player.stopped).toBe(0);
  });
  it('a stale resolve after a newer request is cancelled', async () => {
    const player = fakePlayer();
    const adapter = new SessionAudioAdapter(player);
    let release!: (v: unknown) => void;
    globalThis.fetch = vi.fn(() => new Promise((res) => { release = res; })) as unknown as typeof fetch;
    const first = adapter.playVerse({ reciterId: 7, surah: 1, ayah: 7, title: 't' });
    adapter.cancel();
    release({ ok: true, json: async () => ({ audio_files: [{ url: 'https://verses.quran.com/e.mp3' }] }) });
    await expect(first).resolves.toBe('cancelled');
    expect(player.played).toHaveLength(0);
  });
});

describe('completion provenance',()=>{
 it('external stop is not natural completion',async()=>{
   const player=fakePlayer(),adapter=new SessionAudioAdapter(player);mockAudioApi('https://verses.quran.com/stopped.mp3');
   const pending=adapter.playVerse({reciterId:7,surah:2,ayah:1,title:'t'});
   await vi.waitFor(()=>expect(player.played).toHaveLength(1));await player.stop();
   await expect(pending).resolves.toBe('preempted');
 });
 it('cancel settles active playback without waiting on another event',async()=>{
   const player=fakePlayer(),adapter=new SessionAudioAdapter(player);mockAudioApi('https://verses.quran.com/cancel.mp3');
   const pending=adapter.playVerse({reciterId:7,surah:2,ayah:2,title:'t'});
   await vi.waitFor(()=>expect(player.played).toHaveLength(1));adapter.cancel();
   await expect(pending).resolves.toBe('cancelled');
 });
});

describe('buildSequentialQueue never skips silently', () => {
  const base = { surah: 1, surahName: 'الفاتحة', owner: 'reader-ayah', titleFor: (a: number) => `آية ${a}` };
  it('stops at the first missing verse and reports it', () => {
    const urls: Record<number, string> = { 1: 'u1', 2: 'u2', 4: 'u4' };
    const { tracks, firstMissingAyah } = buildSequentialQueue({ ...base, ayahs: [1, 2, 3, 4], urlFor: (a) => urls[a] });
    expect(tracks.map((t) => t.meta?.ayah)).toEqual([1, 2]);
    expect(firstMissingAyah).toBe(3);
  });
  it('returns an empty queue with the first verse reported when nothing resolves', () => {
    const { tracks, firstMissingAyah } = buildSequentialQueue({ ...base, ayahs: [5, 6], urlFor: () => undefined });
    expect(tracks).toHaveLength(0);
    expect(firstMissingAyah).toBe(5);
  });
});
