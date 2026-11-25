import {beforeEach, describe, expect, it, vi} from 'vitest';
import {loadPrefs} from './prefs-store';
import {getTaskNotificationSettings} from './types';

describe('legacy in_app channel migration', () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('window', {localStorage: {getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k)}});
  });

  it('migrates saved in_app to both for every category and keeps disabled/silent', async () => {
    const saved = {
      prayer_settings: {
        'الظهر': {enabled: true, channel: 'in_app'},
        'العصر': {enabled: false, adhan_type: 'silent', channel: 'in_app'},
        'الفجر': {enabled: true, channel: 'system'},
      },
      reminder_settings: {default_channel: 'in_app', task_notifications: {channel: 'in_app'}},
    };
    // مفتاح التخزين يُكتشف عبر الحفظ الأول
    const {prefs: base} = await loadPrefs();
    const merged = {...base, ...saved, prayer_settings: {...base.prayer_settings, ...saved.prayer_settings}};
    const key = 'rabbani-notif-prefs-v1';
    mem.set(key, JSON.stringify(merged));
    const {prefs} = await loadPrefs();
    expect(prefs.prayer_settings['الظهر'].channel).toBe('both');
    expect(prefs.prayer_settings['العصر'].channel).toBe('both');
    expect(prefs.prayer_settings['العصر'].enabled).toBe(false);
    expect(prefs.prayer_settings['العصر'].adhan_type).toBe('silent');
    expect(prefs.prayer_settings['الفجر'].channel).toBe('system');
    expect(prefs.reminder_settings.default_channel).toBe('both');
    expect(getTaskNotificationSettings({reminder_settings: {task_notifications: {channel: 'in_app'}}} as never).channel).toBe('both');
  });
});
