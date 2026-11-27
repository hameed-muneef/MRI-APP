import { afterEach, describe, expect, it, vi } from 'vitest';
import { playAudio, stopAudio } from './audio';
import { playBuiltInTone } from './builtin-sounds';
import {
  buildNativeReminderPayloads,
  buildNativeTaskPayloads,
  channelIdForRawSound,
  GENERAL_CHANNEL_ID,
  resolveNativeReminderChannel,
  SILENT_REMINDER_CHANNEL_ID,
} from './native-prayer-scheduler';
import { DEFAULT_NOTIFICATION_PREFERENCE, type Reminder } from './types';

describe('audio playback & native channel routing', () => {
  afterEach(() => {
    stopAudio();
    vi.unstubAllGlobals();
  });

  it('calls HTMLAudioElement.play() synchronously on Web without waiting for a microtask', () => {
    let playCalls = 0;
    const fakeAudio = {
      src: '',
      currentSrc: '',
      currentTime: 0,
      muted: false,
      volume: 1,
      paused: true,
      onerror: null as (() => void) | null,
      onended: null as (() => void) | null,
      pause: vi.fn(),
      play: vi.fn(() => {
        playCalls += 1;
        return Promise.resolve();
      }),
    };
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => false } });
    vi.stubGlobal('Audio', vi.fn(function MockAudio() { return fakeAudio; }));

    playAudio('/sounds/adhan/adhan_alafasy.ogg');

    // Must already be invoked synchronously inside the gesture call stack.
    expect(playCalls).toBe(1);
    expect(fakeAudio.src).toBe('/sounds/adhan/adhan_alafasy.ogg');
  });

  it('resumes a suspended AudioContext before scheduling built-in oscillator tones', async () => {
    let startCalls = 0;
    const fakeCtx = {
      state: 'suspended' as 'suspended' | 'running',
      currentTime: 10,
      destination: {},
      resume: vi.fn(async () => {
        fakeCtx.state = 'running';
      }),
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn().mockReturnThis(),
        start: vi.fn(() => { startCalls += 1; }),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(() => fakeCtx.destination),
      })),
    };
    vi.stubGlobal('window', {
      AudioContext: vi.fn(function MockAudioContext() { return fakeCtx; }),
    });

    const ok = playBuiltInTone('builtin:soft');
    expect(ok).toBe(true);
    expect(fakeCtx.resume).toHaveBeenCalledTimes(1);
    expect(startCalls).toBe(0);

    // After resume resolves, the melody is scheduled on the running AudioContext.
    await Promise.resolve();
    await Promise.resolve();
    expect(startCalls).toBeGreaterThan(0);
  });

  it('routes native reminder and task payloads to silent or selected Adhan voice channels', () => {
    expect(resolveNativeReminderChannel('builtin:silent', GENERAL_CHANNEL_ID)).toBe(SILENT_REMINDER_CHANNEL_ID);
    expect(resolveNativeReminderChannel('adhan:alafasy', GENERAL_CHANNEL_ID)).toBe(channelIdForRawSound('adhan_alafasy'));
    expect(resolveNativeReminderChannel('builtin:soft', GENERAL_CHANNEL_ID)).toBe(GENERAL_CHANNEL_ID);

    const now = new Date('2026-11-26T08:00:00');
    const reminder: Reminder = {
      id: 'rem-silent-1',
      user_id: '',
      title: 'ذكر هادئ',
      description: 'تنبيه صامت',
      scheduled_at: '2026-11-26T10:00:00',
      recurrence: 'daily',
      recurrence_config: { start_date: '2026-11-26' },
      sound_id: 'builtin:silent',
      category: 'worship',
      enabled: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const remPayloads = buildNativeReminderPayloads([reminder], DEFAULT_NOTIFICATION_PREFERENCE, now);
    expect(remPayloads.length).toBeGreaterThan(0);
    expect(remPayloads[0].channelId).toBe(SILENT_REMINDER_CHANNEL_ID);

    const prefsWithAdhanTask = {
      ...DEFAULT_NOTIFICATION_PREFERENCE,
      reminder_settings: {
        ...DEFAULT_NOTIFICATION_PREFERENCE.reminder_settings,
        task_notifications: {
          enabled: true,
          remind_before_minutes: 0,
          notify_at_time: true,
          channel: 'both' as const,
          sound_id: 'adhan:hadrawi',
          include_initial: true,
          include_day_plan: true,
        },
      },
    };
    const taskPayloads = buildNativeTaskPayloads(
      {
        tasks: [{ id: 't1', title: 'قراءة ورد', done: false, period: 'daily', optional: false }],
        goals: [],
        taskSchedules: {
          t1: {
            title: 'قراءة ورد',
            sourceLabel: 'مهام اليوم',
            initialDate: '2026-11-26',
            initialTime: '11:00',
          },
        },
      },
      prefsWithAdhanTask,
      now,
    );
    expect(taskPayloads.length).toBeGreaterThan(0);
    expect(taskPayloads[0].channelId).toBe(channelIdForRawSound('adhan_hadrawi'));
  });
});
