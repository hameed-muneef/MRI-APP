import {describe, expect, it} from 'vitest';
import {parseSpecificDates} from './reminder-date-input';

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
