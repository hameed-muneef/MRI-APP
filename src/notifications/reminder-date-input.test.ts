import {describe, expect, it} from 'vitest';
import {endDateError, parseSpecificDates} from './reminder-date-input';

describe('parseSpecificDates', () => {
  it('يقبل التواريخ الصحيحة المفصولة بفاصلة عربية أو إنجليزية', () => {
    expect(parseSpecificDates('2026-12-01، 2026-12-08').dates).toEqual(['2026-12-01', '2026-12-08']);
    expect(parseSpecificDates('2026-12-01,2026-12-08').dates).toEqual(['2026-12-01', '2026-12-08']);
  });

  it('يرفض ما ليس بصيغة التاريخ أو ليس تاريخًا حقيقيًا', () => {
    const result = parseSpecificDates('abc, 2026-13-45, 2026-02-30');
    expect(result.dates).toEqual([]);
    expect(result.invalid).toEqual(['abc', '2026-13-45', '2026-02-30']);
  });

  it('يحتفظ بالتواريخ الصحيحة ويبلّغ عن الخاطئة معها', () => {
    const result = parseSpecificDates('2026-12-01, oops');
    expect(result.dates).toEqual(['2026-12-01']);
    expect(result.invalid).toEqual(['oops']);
  });

  it('يزيل التكرار ويتجاهل الفراغات', () => {
    expect(parseSpecificDates(' 2026-12-01 , 2026-12-01 , ').dates).toEqual(['2026-12-01']);
    expect(parseSpecificDates('').dates).toEqual([]);
  });
});

describe('endDateError', () => {
  it('يقبل تاريخًا فارغًا (بلا انتهاء)', () => {
    expect(endDateError('2026-12-01', '')).toBeNull();
    expect(endDateError('2026-12-01', '   ')).toBeNull();
  });

  it('يقبل نفس يوم البداية أو ما بعده', () => {
    expect(endDateError('2026-12-01', '2026-12-01')).toBeNull();
    expect(endDateError('2026-12-01', '2027-01-15')).toBeNull();
  });

  it('يرفض تاريخ انتهاء يسبق البداية', () => {
    expect(endDateError('2026-12-01', '2020-01-01')).toBe(
      'تاريخ انتهاء التكرار يجب أن يكون في تاريخ البداية أو بعده.',
    );
  });

  it('يرفض تاريخ انتهاء ليس بصيغة صحيحة', () => {
    expect(endDateError('2026-12-01', '01/12/2026')).toBe('اكتب تاريخ الانتهاء بصيغة YYYY-MM-DD.');
  });
});
