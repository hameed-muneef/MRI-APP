import {describe, expect, it} from 'vitest';
import {shouldShowLocationError} from './location-status';

describe('shouldShowLocationError', () => {
  it('يعرض الخطأ عندما يضيف سببًا لا يقوله سطر الحالة', () => {
    expect(shouldShowLocationError('error', 'انتهت مهلة تحديد الموقع.')).toBe(true);
    expect(shouldShowLocationError('idle', 'تعذر قراءة الموقع من الجهاز.')).toBe(true);
  });

  it('لا يكرّر الخطأ عندما يكون سطر الحالة قد شرح السبب', () => {
    expect(shouldShowLocationError('denied', 'لم يُسمح بالوصول للموقع. يمكنك السماح به أو اختيار مدينتك يدويًا.')).toBe(false);
    expect(shouldShowLocationError('unsupported', 'تحديد الموقع غير مدعوم على هذا الجهاز.')).toBe(false);
  });

  it('لا يعرض شيئًا أثناء التحديد أو عند غياب الخطأ', () => {
    expect(shouldShowLocationError('locating', 'جارٍ التحديد')).toBe(false);
    expect(shouldShowLocationError('ready', '')).toBe(false);
    expect(shouldShowLocationError('error', null)).toBe(false);
  });
});
