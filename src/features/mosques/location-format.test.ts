import { describe, expect, it } from 'vitest';
import { formatMosqueLocation } from './location-format';

describe('formatMosqueLocation', () => {
  it('deduplicates repeated Arabic street segments and drops Latin/postcode suffixes when Arabic exists', () => {
    const raw =
      '24 شارع محمد صبري أبو علم، باب اللوق، عابدين،، Bab Al Louq، 24 شارع محمد صبري أبو علم، باب اللوق، عابدين،، Bab Al Louq, Abdeen, Cairo Governorate 4280125, Egypt';
    expect(formatMosqueLocation(raw)).toBe('24 شارع محمد صبري أبو علم، باب اللوق، عابدين');
  });

  it('removes plus codes and caps repeated rural multi-segment strings', () => {
    const raw =
      'كفر الجنينة البحري، طلخا، الدقهلية،، كفر الحصة، نبروه، الدقهلية،، 38J2+RQH، كفر الجنينة البحري، طلخا، الدقهلية،، 38J2+RQH, Kafr Al Hessah, Egypt';
    expect(formatMosqueLocation(raw)).toBe('كفر الجنينة البحري، طلخا، الدقهلية');
  });

  it('deduplicates Latin-only addresses and removes postal code and country', () => {
    const raw =
      '24 Mohammed Sabri Abou Alam، 24 Mohammed Sabri Abou Alam, Bab Al Louq, Abdeen, Cairo Governorate 4280125, Egypt';
    expect(formatMosqueLocation(raw)).toBe('24 Mohammed Sabri Abou Alam، Bab Al Louq، Abdeen');
  });

  it('drops placeholder noise tokens like underconstruction and bare two-digit numbers', () => {
    expect(formatMosqueLocation('مدينة 6 أكتوبر، underconstruction')).toBe('مدينة 6 أكتوبر');
    expect(formatMosqueLocation('07')).toBe('');
    expect(formatMosqueLocation(undefined)).toBe('');
  });
});
