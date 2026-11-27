import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportLocalBackup,
  formatStorageBytes,
  getLocalStorageSummary,
  importLocalBackup,
} from './local-backup';

function installMockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const mockLocalStorage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  const mockDocument = {
    documentElement: {
      dataset: {} as Record<string, string>,
      style: { colorScheme: '' },
      setAttribute() {},
    },
    querySelector() {
      return null;
    },
  };
  const mockWindow = {
    localStorage: mockLocalStorage,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    },
  };
  vi.stubGlobal('window', mockWindow);
  vi.stubGlobal('document', mockDocument);
  return store;
}

describe('local-backup', () => {
  beforeEach(() => {
    installMockStorage({
      'rabbani-v1': JSON.stringify({ tasks: [], prayers: { الفجر: '04:30', الظهر: '12:00', العصر: '15:30', المغرب: '18:10', العشاء: '19:30' } }),
      'rabbani-theme-v1': 'dark',
      'unrelated-key': 'ignored',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exports only app-scoped local storage keys and restores them safely', () => {
    const payload = exportLocalBackup();
    expect(payload.app).toBe('al-rabbaniyyun-local');
    expect(Object.keys(payload.storage).sort()).toEqual(['rabbani-theme-v1', 'rabbani-v1']);

    const freshStore = installMockStorage();
    const restoredState = importLocalBackup(JSON.stringify(payload));
    expect(freshStore.get('rabbani-theme-v1')).toBe('dark');
    expect(restoredState?.prayers?.الفجر).toBe('04:30');
  });

  it('rejects invalid backup payloads and reports summary + byte formatting', async () => {
    expect(() => importLocalBackup(JSON.stringify({ app: 'other', storage: {} }))).toThrow();
    const summary = await getLocalStorageSummary();
    expect(summary.localKeysCount).toBe(2);
    expect(formatStorageBytes(512)).toBe('512 بايت');
    expect(formatStorageBytes(null)).toBe('غير متاح');
  });
  it('round-trips coach fields (Goal.coach, Wird.coach, courseCoach, coachSettings) through export and import', () => {
    const coachState = {
      tasks: [],
      goals: [{ id: 'g1', title: 'هدف', benefit: 'فائدة', coach: { enabled: true, enabledAt: '2026-11-26', dismissed: ['k1'], mode: 'inherit' as const } }],
      wirds: [{ id: 'w1', title: 'ورد', target: 3, count: 1, period: 'daily', periodKey: '2026-11-26', coach: { enabled: false, enabledAt: '2026-11-26', dismissed: ['d'], log: ['2026-11-25'], mode: 'off' as const } }],
      courseCoach: { enabled: true, enabledAt: '2026-11-26', dismissed: ['c'], log: { day: ['2026-11-25'], week: ['2026-W47'], month: ['2026-10'] } },
      coachSettings: { globalEnabled: true, enabledAt: '2026-11-26', recovery: { startedAt: '2026-11-26' }, dismissedWeekly: ['w1'] },
      prayers: {},
    };
    installMockStorage({ 'rabbani-v1': JSON.stringify(coachState) });
    const payload = exportLocalBackup();
    const store = installMockStorage();
    const restored = importLocalBackup(JSON.stringify(payload));
    const saved = JSON.parse(store.get('rabbani-v1') as string);
    expect(saved.goals[0].coach).toEqual(coachState.goals[0].coach);
    expect(saved.wirds[0].coach).toEqual(coachState.wirds[0].coach);
    expect(saved.courseCoach).toEqual(coachState.courseCoach);
    expect(saved.coachSettings).toEqual(coachState.coachSettings);
    expect(restored?.goals[0].coach?.enabled).toBe(true);
    expect(restored?.wirds[0].coach?.log).toEqual(['2026-11-25']);
    expect(restored?.courseCoach?.log?.week).toEqual(['2026-W47']);
    expect(restored?.coachSettings?.globalEnabled).toBe(true);
  });

  it('still imports an old backup with no coach fields', () => {
    installMockStorage({ 'rabbani-v1': JSON.stringify({ tasks: [], goals: [{ id: 'g', title: 't', benefit: 'b' }], wirds: [{ id: 'w', title: 't', target: 1, count: 0, period: 'daily', periodKey: 'x' }], prayers: {} }) });
    const payload = exportLocalBackup();
    installMockStorage();
    const restored = importLocalBackup(JSON.stringify(payload));
    expect(restored?.goals[0].coach).toBeUndefined();
    expect(restored?.courseCoach).toBeUndefined();
  });
});
