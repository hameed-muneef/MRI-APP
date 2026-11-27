import {expect, it, vi} from 'vitest';

const mock = vi.hoisted(() => ({
  registered: [] as Array<{extra?: Record<string, unknown>}>,
  queue: [] as Array<Record<string, unknown>>,
  rules: [] as Array<Record<string, unknown>>,
  saved: [] as Array<{key: string; ext: string; len: number}>,
  saveOk: true,
}));
vi.mock('@capacitor/local-notifications', () => ({LocalNotifications: {
  checkPermissions: async () => ({display: 'granted'}),
  checkExactNotificationSetting: async () => ({exact_alarm: 'granted'}),
  listChannels: async () => ({channels: [{id: 'al-rabbani-general-v2'}]}),
  getPending: async () => ({notifications: []}),
  cancel: async () => {},
  schedule: async (x: {notifications: Array<{extra?: Record<string, unknown>}>}) => { mock.registered.push(...x.notifications); return {notifications: x.notifications}; },
}}));
vi.mock('../lib/settings-opener', () => ({
  getAndroidEnvironmentStatus: async () => ({hasAdhanRawSound: true}),
  ensureNativeAdhanChannel: async () => null,
  setNativeReminderQueue: async (_k: string, items: Array<Record<string, unknown>>) => { mock.queue = items; return true; },
  setNativeReminderRules: async (r: Array<Record<string, unknown>>) => { mock.rules = r; return true; },
  rebalanceNativeReminderQueue: async () => true,
  saveNativeCustomSound: async (key: string, b64: string, ext: string) => { if (mock.saveOk) mock.saved.push({key, ext, len: b64.length}); return mock.saveOk; },
  pruneNativeCustomSounds: async () => true,
}));
vi.mock('../sounds/custom-store', () => ({
  listAllCustomSounds: async () => [{slot: 'library:item:abc', name: 'نغمتي.MP3', type: 'audio/mpeg', data: new Uint8Array([1, 2, 3, 4]).buffer, updatedAt: 't1'}],
}));
import {resetNativeSoundCache, nativeSoundExt, nativeSoundKey, isImportedSoundId, soundIdOfSlot} from './native-custom-sounds';
import {scheduleNativePersonalReminders, soundExtra} from './native-prayer-scheduler';
import {DEFAULT_NOTIFICATION_PREFERENCE, type Reminder} from './types';

const now = new Date(2026, 10, 23, 7);
const prefs = () => { const p = structuredClone(DEFAULT_NOTIFICATION_PREFERENCE); p.global_enabled = true; p.dnd_enabled = false; return p; };
const mk = (id: string, sound: string | undefined, alarm?: boolean): Reminder => ({
  id, user_id: '', title: id, scheduled_at: new Date(2026, 10, 1, 9).toISOString(), recurrence: 'daily', category: 'worship',
  enabled: true, created_at: '', updated_at: '', sound_id: sound, ...(alarm ? {alarm_mode: true} : {}),
});

it('pure helpers: ids, keys and extensions', () => {
  expect(isImportedSoundId('library:item:x')).toBe(true);
  expect(isImportedSoundId('custom:alarm')).toBe(true);
  expect(isImportedSoundId('builtin:soft')).toBe(false);
  expect(isImportedSoundId(undefined)).toBe(false);
  expect(soundIdOfSlot('alarm')).toBe('custom:alarm');
  expect(nativeSoundKey('library:item:abc')).toMatch(/^c[0-9a-f]{8}$/);
  expect(nativeSoundKey('library:item:abc')).toBe(nativeSoundKey('library:item:abc'));
  expect(nativeSoundKey('a')).not.toBe(nativeSoundKey('b'));
  expect(nativeSoundExt('x.MP3', '')).toBe('mp3');
  expect(nativeSoundExt('x.opus', '')).toBe('ogg');
  expect(nativeSoundExt('noext', 'audio/mp4')).toBe('m4a');
  expect(nativeSoundExt('x.exe', 'application/zip')).toBe('mp3');
  expect(soundExtra('adhan:almulla', true)).toEqual({rawSound: 'adhan_almulla'});
  expect(soundExtra('adhan:almulla', false)).toEqual({});
  expect(soundExtra('builtin:soft', true)).toEqual({});
});

it('an imported sound is copied to the phone and its rows carry soundKey, in the queue only; alarm flag is independent', async () => {
  const data = new Map<string, string>();
  vi.stubGlobal('window', {localStorage: {getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k)}, Capacitor: {isNativePlatform: () => true}, dispatchEvent: () => {}});
  vi.stubGlobal('CustomEvent', class {});
  mock.registered.length = 0;
  await scheduleNativePersonalReminders([mk('imp', 'library:item:abc'), mk('impalarm', 'library:item:abc', true), mk('plain', 'builtin:soft')], prefs(), now);
  const key = nativeSoundKey('library:item:abc');
  expect(mock.saved).toEqual([{key, ext: 'mp3', len: 8}]);
  const rows = (t: string) => mock.queue.filter(r => r.title === t);
  expect(rows('imp').length).toBeGreaterThan(0);
  expect(rows('imp').every(r => r.soundKey === `${key}.mp3` && !('alarmMode' in r))).toBe(true);
  expect(rows('impalarm').every(r => r.soundKey === `${key}.mp3` && r.alarmMode === true)).toBe(true);
  expect(rows('plain').some(r => 'soundKey' in r || 'alarmMode' in r || 'rawSound' in r)).toBe(false);
  expect(mock.registered.some(p => p.extra?.reminderId === 'imp' || p.extra?.reminderId === 'impalarm')).toBe(false);
  expect(mock.registered.some(p => p.extra?.reminderId === 'plain')).toBe(true);
  const rule = (rid: string) => mock.rules.find(r => r.rid === rid)!;
  expect(rule('imp').soundKey).toBe(`${key}.mp3`);
  expect(rule('plain').soundKey).toBeUndefined();
});

it('when the phone refuses the file the row has no soundKey (normal sound), never a dangling key', async () => {
  resetNativeSoundCache();
  mock.saveOk = false;
  await scheduleNativePersonalReminders([mk('imp2', 'library:item:abc')], prefs(), new Date(2026, 10, 23, 7, 1));
  expect(mock.queue.filter(r => r.title === 'imp2').every(r => !('soundKey' in r))).toBe(true);
  mock.saveOk = true;
});

it('a bundled adhan picked for an alarm reminder sends its raw name', async () => {
  await scheduleNativePersonalReminders([mk('adh', 'adhan:almulla', true)], prefs(), new Date(2026, 10, 23, 7, 2));
  const rows = mock.queue.filter(r => r.title === 'adh');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every(r => r.rawSound === 'adhan_almulla' && r.alarmMode === true)).toBe(true);
});
