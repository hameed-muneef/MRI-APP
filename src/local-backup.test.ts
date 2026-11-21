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
});
