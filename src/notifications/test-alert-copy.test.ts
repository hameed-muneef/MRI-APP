import {describe, expect, it} from 'vitest';
import {testAlertMessage} from './test-alert-copy';

describe('testAlertMessage', () => {
  it('يقول إن الصوت شُغِّل عندما تكون التنبيهات مفعّلة', () => {
    expect(testAlertMessage('tone', true)).toBe('أُرسل التنبيه التجريبي وشُغِّل الصوت.');
    expect(testAlertMessage('file', true)).toBe('أُرسل التنبيه التجريبي وشُغِّل الصوت.');
  });

  it('يذكر الصمت عندما يكون الصوت صامتًا', () => {
    expect(testAlertMessage('none', true)).toBe('أُرسل التنبيه التجريبي (صامت).');
  });

  it('ينبّه أن التنبيهات متوقفة عندما يكون المفتاح العام مغلقًا', () => {
    const message = testAlertMessage('tone', false);
    expect(message).toContain('أُرسل التنبيه التجريبي وشُغِّل الصوت.');
    expect(message).toContain('تنبيهاتك متوقفة');
    expect(message).toContain('اختبار للصوت فقط');
  });
});
