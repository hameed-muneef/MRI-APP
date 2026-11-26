import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const nativeCheckPermissions = vi.fn();
const nativeSchedule = vi.fn();
const isNativeMock = vi.fn(() => false);

vi.mock('../lib/device-location', () => ({
  isNativePlatform: () => isNativeMock(),
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: (...args: unknown[]) => nativeCheckPermissions(...args),
    schedule: (...args: unknown[]) => nativeSchedule(...args),
  },
}));
vi.mock('./native-prayer-scheduler', () => ({
  ensureChannels: async () => ({adhanChannelId: 'adhan', soundFile: 'x.ogg', soundTitle: 'x', soundMode: 'adhan'}),
  GENERAL_CHANNEL_ID: 'al-rabbani-general-v2',
}));
vi.mock('../lib/prayer-schedule', () => ({
  prayerId: () => 424242,
}));
vi.mock('../auth', () => ({authClient: null}));

import {chooseSystemDeliveryRoute, deliverNotification, deliverReminder} from './delivery';
import type {Reminder} from './types';

const reminder: Reminder = {
  id: 'r1',
  user_id: '',
  title: 'أذكار الصباح',
  description: 'ورد الذكر',
  scheduled_at: '2026-11-23T06:30:00',
  recurrence: 'none',
  recurrence_config: {},
  enabled: true,
  category: 'worship',
  created_at: '',
  updated_at: '',
};

function stubBrowserNotification(permission: NotificationPermission) {
  const show = vi.fn();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
    Notification: undefined,
    dispatchEvent: () => true,
  });
  vi.stubGlobal('Notification', {permission});
  return show;
}

beforeEach(() => {
  nativeCheckPermissions.mockReset().mockResolvedValue({display: 'granted'});
  nativeSchedule.mockReset().mockResolvedValue({notifications: [{id: 424242}]});
  isNativeMock.mockReset().mockReturnValue(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chooseSystemDeliveryRoute', () => {
  it('prefers the phone on native when the OS permission is granted', () => {
    expect(chooseSystemDeliveryRoute({
      isNative: true,
      nativePermission: 'granted',
      browserSupported: true,
      browserPermission: 'granted',
    })).toBe('native');
  });

  it('never falls back to WebView browser notifications on the phone', () => {
    for (const nativePermission of ['denied', 'prompt', 'unsupported'] as const) {
      expect(chooseSystemDeliveryRoute({
        isNative: true,
        nativePermission,
        browserSupported: true,
        browserPermission: 'granted',
      })).toBeNull();
    }
  });

  it('uses the browser only on the web with a granted permission', () => {
    expect(chooseSystemDeliveryRoute({
      isNative: false,
      nativePermission: 'unsupported',
      browserSupported: true,
      browserPermission: 'granted',
    })).toBe('browser');
    expect(chooseSystemDeliveryRoute({
      isNative: false,
      nativePermission: 'unsupported',
      browserSupported: true,
      browserPermission: 'default',
    })).toBeNull();
    expect(chooseSystemDeliveryRoute({
      isNative: false,
      nativePermission: 'unsupported',
      browserSupported: false,
      browserPermission: null,
    })).toBeNull();
  });
});

describe('deliverReminder routing', () => {
  it('delivers through the phone (LocalNotifications) on native, not the WebView Notification API', async () => {
    isNativeMock.mockReturnValue(true);
    stubBrowserNotification('default');
    await deliverReminder(reminder, 'system');
    expect(nativeSchedule).toHaveBeenCalledTimes(1);
    const payload = (nativeSchedule.mock.calls[0][0] as {notifications: {title: string; channelId: string}[]}).notifications[0];
    expect(payload.title).toBe('أذكار الصباح');
    expect(payload.channelId).toBe('al-rabbani-general-v2');
  });

  it('does not touch the phone when the native permission is denied', async () => {
    isNativeMock.mockReturnValue(true);
    nativeCheckPermissions.mockResolvedValue({display: 'denied'});
    stubBrowserNotification('default');
    await deliverReminder(reminder, 'system');
    expect(nativeSchedule).not.toHaveBeenCalled();
  });

  it('keeps the in-app inbox record even on the native route', async () => {
    isNativeMock.mockReturnValue(true);
    const writes: string[] = [];
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: (_k: string, v: string) => void writes.push(v),
        removeItem: () => undefined,
      },
      dispatchEvent: () => true,
    });
    await deliverNotification('reminder', 'اختبار', 'نص', 'settings');
    expect(nativeSchedule).toHaveBeenCalledTimes(1);
    expect(writes.length).toBeGreaterThan(0);
  });
});
