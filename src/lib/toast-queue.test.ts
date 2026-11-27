import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TOAST_MS, createToastNotifier} from './toast-queue';

// سيناريو: المستخدم ينشئ منبّهًا ثم يستورد نسخة احتياطية بعد أقل من ثانيتين.
// الرسالة الثانية (نتيجة الاستيراد) يجب أن تظهر كاملة، لا أن يمسحها مؤقّت الأولى.
describe('toast notifier', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows one message for its full duration', () => {
    const shown: string[] = [];
    const notifier = createToastNotifier(message => shown.push(message));
    notifier.notify('أُضيف المنبه محليًا');
    vi.advanceTimersByTime(TOAST_MS - 100);
    expect(shown).toEqual(['أُضيف المنبه محليًا']);
    vi.advanceTimersByTime(100);
    expect(shown).toEqual(['أُضيف المنبه محليًا', '']);
  });

  it('does not let the previous timer clear the newer message', () => {
    const shown: string[] = [];
    const notifier = createToastNotifier(message => shown.push(message));
    notifier.notify('أُضيف المنبه محليًا');
    vi.advanceTimersByTime(1000);
    notifier.notify('ملف النسخة الاحتياطية غير صالح أو لا يخص تطبيق الربانيون.');
    vi.advanceTimersByTime(1000); // المؤقّت القديم كان سيُفرغ الرسالة هنا
    expect(shown[shown.length - 1]).toContain('غير صالح');
    vi.advanceTimersByTime(TOAST_MS);
    expect(shown[shown.length - 1]).toBe('');
  });

  it('stops clearing after dispose', () => {
    const shown: string[] = [];
    const notifier = createToastNotifier(message => shown.push(message));
    notifier.notify('رسالة');
    notifier.dispose();
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(shown).toEqual(['رسالة']);
  });
});
