import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Uses the real, pinned @capacitor/core registerPlugin proxy set up as on Android (androidBridge present, plugin
// header from the native side), not a hand-written mock. On Android that proxy rejects any `.then` lookup with
// '"LocalNotifications.then()" is not implemented on android'. Returning the plugin from an async function triggers
// that lookup, so the awaiting caller never gets the plugin (the promise neither resolves nor rejects) and the error
// surfaces as an unhandled rejection. checkPermissions() below only resolves if loadPlugin() avoids that.
const calls: string[] = [];

beforeEach(() => {
  vi.resetModules();
  calls.length = 0;
  const g = globalThis as Record<string, unknown>;
  g.window = globalThis;
  g.androidBridge = {};
  g.Capacitor = {
    isNativePlatform: () => true,
    PluginHeaders: [{
      name: 'LocalNotifications',
      methods: [
        { name: 'checkPermissions', rtype: 'promise' },
        { name: 'checkExactNotificationSetting', rtype: 'promise' },
      ],
    }],
    nativePromise: async (_plugin: string, method: string) => {
      calls.push(method);
      return method === 'checkPermissions' ? { display: 'granted' } : { exact_alarm: 'granted' };
    },
  };
  vi.doMock('@capacitor/local-notifications', async () => {
    const { registerPlugin } = await vi.importActual<typeof import('@capacitor/core')>('@capacitor/core');
    return { LocalNotifications: registerPlugin('LocalNotifications') };
  });
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.window; delete g.androidBridge; delete g.Capacitor;
  vi.doUnmock('@capacitor/local-notifications');
});

describe('loadPlugin with the real Capacitor plugin proxy (android)', () => {
  it('premise: the proxy answers a `.then` lookup with the not-implemented error (so it cannot be a promise result)', async () => {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const thenLookup = (LocalNotifications as unknown as { then: (a: () => void, b: () => void) => Promise<unknown> }).then(() => {}, () => {});
    await expect(thenLookup).rejects.toThrow(/LocalNotifications\.then\(\)" is not implemented on android/);
  });

  it('the scheduler gets the plugin without a then() rejection and its native calls go through', async () => {
    const { checkPermissions } = await import('./native-prayer-scheduler');
    await expect(checkPermissions()).resolves.toEqual({ display: 'granted', exact: 'granted' });
    expect(calls).toEqual(['checkPermissions', 'checkExactNotificationSetting']);
  });
});
