import {describe, expect, it, vi} from 'vitest';
import {playAudio, stopAudio} from './audio';

describe('audio fallback handling', () => {
  it('invokes fallback when audio file fails to play or errors', async () => {
    const fakeAudio = {
      src: '',
      onerror: null as (() => void) | null,
      onended: null as (() => void) | null,
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn(),
      play: vi.fn<() => Promise<void>>(() => Promise.reject(new Error('not supported'))),
    };
    const origAudio = globalThis.Audio;
    globalThis.Audio = function FakeAudio() {
      return fakeAudio;
    } as unknown as typeof Audio;
    try {
      const onFallback = vi.fn();
      playAudio('/sounds/adhan/missing.mp3', onFallback);
      await Promise.resolve();
      await Promise.resolve();
      expect(onFallback).toHaveBeenCalledTimes(1);
      // Subsequent error callback after already falling back must not fire twice
      fakeAudio.onerror?.();
      expect(onFallback).toHaveBeenCalledTimes(1);

      // Stopping audio suppresses stale fallback triggers
      const onFallback2 = vi.fn();
      fakeAudio.play = vi.fn(() => new Promise<void>(() => {}));
      playAudio('/sounds/adhan/missing2.mp3', onFallback2);
      stopAudio();
      fakeAudio.onerror?.();
      expect(onFallback2).not.toHaveBeenCalled();
    } finally {
      stopAudio();
      globalThis.Audio = origAudio;
    }
  });
});
