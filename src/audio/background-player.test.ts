import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { backgroundAudio } from './background-player';
import type { AudioTrack } from './types';

const FAKE_AUDIO = {
  src: '',
  currentTime: 0,
  duration: 100,
  paused: true,
  error: null as MediaError | null,
  onerror: null as (() => void) | null,
  onended: null as (() => void) | null,
  onloadedmetadata: null as (() => void) | null,
  onplay: null as (() => void) | null,
  volume: 1,
  muted: false,
  loop: false,
  preload: 'auto',
  listeners: null as Record<string, Array<() => void>> | null,
  addEventListener: null,
  removeEventListener: null,
  dispatchEvent: null,
  pause: vi.fn(),
  load: vi.fn(),
  removeAttribute: vi.fn(),
  play: null,
};

let origAudio: typeof Audio;

beforeEach(() => {
  origAudio = globalThis.Audio;
  globalThis.Audio = function FakeAudio() {
    const listeners: Record<string, Array<() => void>> = {};
    const a: any = { ...FAKE_AUDIO };
    a.listeners = listeners;
    a.addEventListener = vi.fn(function (this: any, ev: string, fn: () => void) {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(fn);
    });
    a.removeEventListener = vi.fn(function (this: any, ev: string, fn: () => void) {
      listeners[ev] = (listeners[ev] || []).filter((f: () => void) => f !== fn);
    });
    a.dispatchEvent = vi.fn(function (this: any, ev: string) {
      (listeners[ev] || []).forEach((fn: () => void) => fn());
    });
    a.pause = vi.fn();
    a.load = vi.fn();
    a.removeAttribute = vi.fn();
    a.play = vi.fn<() => Promise<void>>(function (this: any) {
      (listeners['playing'] || []).forEach((fn: () => void) => fn());
      return Promise.resolve();
    });
    return a as unknown as HTMLAudioElement;
  } as unknown as typeof Audio;
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.Audio = origAudio;
  vi.useRealTimers();
});

const TRACKS: AudioTrack[] = [
  {id: 't1', title: 'Track 1', url: 'https://example.com/t1.mp3', category: 'quran', isLive: false},
  {id: 't2', title: 'Track 2', url: 'https://example.com/t2.mp3', category: 'quran', isLive: false},
  {id: 't3', title: 'Track 3', url: 'https://example.com/t3.mp3', category: 'quran', isLive: false},
];

describe('background player queue logic', () => {
  beforeEach(() => { void backgroundAudio.stop(); });
  it('playQueue sets status to playing and queue length', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    const s = backgroundAudio.getState();
    expect(s.status).toBe('playing');
    expect(s.queue.length).toBe(3);
    expect(s.currentIndex).toBe(0);
    expect(s.currentTrack?.id).toBe('t1');
  });

  it('pause toggles to paused', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.pause();
    expect(backgroundAudio.getState().status).toBe('paused');
  });

  it('resume goes back to playing', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.pause();
    await backgroundAudio.resume();
    expect(backgroundAudio.getState().status).toBe('playing');
  });

  it('next advances the index', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.next();
    expect(backgroundAudio.getState().currentIndex).toBe(1);
    expect(backgroundAudio.getState().currentTrack?.id).toBe('t2');
  });

  it('next at end of queue does nothing', async () => {
    await backgroundAudio.playQueue(TRACKS, 2, 'quran');
    await backgroundAudio.next();
    expect(backgroundAudio.getState().currentIndex).toBe(2);
  });

  it('previous goes back when currentTime <= 4', async () => {
    await backgroundAudio.playQueue(TRACKS, 1, 'quran');
    await backgroundAudio.previous();
    expect(backgroundAudio.getState().currentIndex).toBe(0);
  });

  it('stop resets to idle', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.stop();
    const s = backgroundAudio.getState();
    expect(s.status).toBe('idle');
    expect(s.queue.length).toBe(0);
    expect(s.currentIndex).toBe(-1);
    expect(s.currentTrack).toBeNull();
  });

  it('playQueue with startIndex picks the right track', async () => {
    await backgroundAudio.playQueue(TRACKS, 2, 'quran');
    expect(backgroundAudio.getState().currentTrack?.id).toBe('t3');
  });

  it('playSingle wraps in a queue of 1', async () => {
    await backgroundAudio.playSingle(TRACKS[1]);
    expect(backgroundAudio.getState().queue.length).toBe(1);
    expect(backgroundAudio.getState().currentTrack?.id).toBe('t2');
  });

  it('seekTo clamps to duration', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.seekTo(50);
    expect(backgroundAudio.getState().currentTime).toBe(50);
  });

  it('seekTo is a no-op for live tracks', async () => {
    const liveTrack: AudioTrack = {id: 'live', title: 'Live', url: 'https://example.com/live.m3u8', category: 'haramain', isLive: true};
    await backgroundAudio.playSingle(liveTrack);
    await backgroundAudio.seekTo(50);
    expect(backgroundAudio.getState().currentTime).toBe(0);
  });

  it('setSleepTimer cancels with 0', async () => {
    const r = await backgroundAudio.setSleepTimer(0);
    expect(r.minutes).toBe(0);
  });

  it('setSleepTimer returns minutes', async () => {
    const r = await backgroundAudio.setSleepTimer(5);
    expect(r.minutes).toBe(5);
  });
});

describe('player state machine', () => {
  beforeEach(() => { void backgroundAudio.stop(); });
  it('initial state is idle', () => {
    const s = backgroundAudio.getState();
    expect(s.status).toBe('idle');
    expect(s.currentIndex).toBe(-1);
    expect(s.currentTrack).toBeNull();
    expect(s.queue).toEqual([]);
  });

  it('togglePlayPause: playing → pause', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.togglePlayPause();
    expect(backgroundAudio.getState().status).toBe('paused');
  });

  it('togglePlayPause: paused → resume', async () => {
    await backgroundAudio.playQueue(TRACKS, 0, 'quran');
    await backgroundAudio.pause();
    await backgroundAudio.togglePlayPause();
    expect(backgroundAudio.getState().status).toBe('playing');
  });
});
describe('lazy reader repetition',()=>{
 beforeEach(async()=>{await backgroundAudio.stop();});
 it('resolves only the current track, retains pause and navigation, and never allocates the expanded queue',async()=>{
  const resolve=vi.fn(async(i:number)=>({...TRACKS[0],id:String(i),meta:{ayah:i+1}}));
  await backgroundAudio.playLazy(10000,resolve,vi.fn());
  expect(resolve.mock.calls.map(c=>c[0])).toEqual([0]);expect(backgroundAudio.getState().queue).toHaveLength(1);
  await backgroundAudio.pause();expect(backgroundAudio.getState().status).toBe('paused');
  await backgroundAudio.resume();expect(backgroundAudio.getState().status).toBe('playing');
  await backgroundAudio.next();expect(resolve.mock.calls.map(c=>c[0])).toEqual([0,1]);
  await backgroundAudio.previous();expect(resolve.mock.calls.map(c=>c[0])).toEqual([0,1,0]);
 });
 it('reports missing current audio, never requests later indexes',async()=>{
  const resolve=vi.fn(async(i:number)=>i===0?TRACKS[0]:null),missing=vi.fn();
  await backgroundAudio.playLazy(4,resolve,missing);await backgroundAudio.next();
  expect(missing).toHaveBeenCalledWith(1);expect(resolve.mock.calls.map(c=>c[0])).toEqual([0,1]);
  expect(backgroundAudio.getState().status).toBe('idle');
 });
 it('external playback cancels pending lazy resolution without preempting the new owner',async()=>{
  let finish!:(t:AudioTrack)=>void;
  const pending=backgroundAudio.playLazy(3,()=>new Promise(r=>finish=r),vi.fn());
  await Promise.resolve();await backgroundAudio.playSingle(TRACKS[1]);finish(TRACKS[0]);await pending;
  expect(backgroundAudio.getState().currentTrack?.id).toBe('t2');
 });
});

describe('lazy natural completion',()=>{
 it('advances after a natural receipt and stops at the configured final track',async()=>{
  await backgroundAudio.stop();const resolve=vi.fn(async(i:number)=>({...TRACKS[0],id:String(i)}));
  await backgroundAudio.playLazy(2,resolve,vi.fn());
  const first=(backgroundAudio as unknown as {audioEl:{dispatchEvent:(e:string)=>void}}).audioEl;
  first.dispatchEvent('ended');await vi.runAllTimersAsync();
  expect(resolve.mock.calls.map(c=>c[0])).toEqual([0,1]);
  const second=(backgroundAudio as unknown as {audioEl:{dispatchEvent:(e:string)=>void}}).audioEl;
  second.dispatchEvent('ended');await vi.runAllTimersAsync();
  expect(backgroundAudio.getState().status).toBe('idle');expect(resolve).toHaveBeenCalledTimes(2);
 });
});
