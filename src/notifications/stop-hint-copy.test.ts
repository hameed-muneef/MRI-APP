import {describe, expect, it} from 'vitest';
import {NOTIFICATION_SNOOZE_MINUTES, STOP_HINT_TEXT} from './stop-hint-copy';

// سيناريو: مستخدم يقرأ الإعدادات ويريد أن يعرف كيف يوقف الأذان أو المنبه الآن.
describe('stop hint copy', () => {
  it('names every way to stop a playing adhan or alarm', () => {
    expect(STOP_HINT_TEXT).toContain('إيقاف الصوت'); // الزر داخل التطبيق
    expect(STOP_HINT_TEXT).toContain('«إيقاف»'); // زر على الإشعار
    expect(STOP_HINT_TEXT).toContain('تأجيل'); // تأجيل التذكير
    expect(STOP_HINT_TEXT).toContain('مفتاح الطاقة'); // إطفاء الشاشة يُسكت الرنين (ScreenOffStopReceiver)
  });

  it('keeps the snooze delay it promises in step with the notification action', () => {
    const arabicDigits = String(NOTIFICATION_SNOOZE_MINUTES).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
    expect(NOTIFICATION_SNOOZE_MINUTES).toBe(10);
    expect(STOP_HINT_TEXT).toContain(arabicDigits);
  });
});
