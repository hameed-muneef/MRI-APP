// منطق أوضاع الإخفاء (A/B/D/E) — حساب خالص لا يلمس نص الآيات أبدًا:
// الإخفاء بصري فقط على العرض، وتبقى بايتات المصدر كما هي (يفحصها quran:check).
// الوضع C (إخفاء على مستوى الكلمة) غير موجود هنا عمدًا: يبقى مقيَّدًا حتى
// تتوفر حدود كلمات موثوقة؛ لا يُشحَّن إخفاء جزئي على تقسيم المسافات.

import {HideMode} from './types';

export type HideState = {
  mode: HideMode;
  /** أرقام الآيات (داخل السورة) الظاهرة حاليًا. */
  revealed: Set<number>;
};

/** الحالة الابتدائية لكل وضع. */
export function initialHide(mode: HideMode, ayahs: number[]): HideState {
  if (mode === 'B') return {mode, revealed: new Set(ayahs)};
  if (mode === 'D') return {mode, revealed: new Set(ayahs)};
  return {mode, revealed: new Set()};
}

export const isHidden = (state: HideState, ayah: number): boolean => !state.revealed.has(ayah);

export function hiddenCount(state: HideState, ayahs: number[]): number {
  return ayahs.filter(ayah => !state.revealed.has(ayah)).length;
}

/** هل يجوز كشف هذه الآية بعينها في الوضع الحالي؟ */
export function canRevealVerse(state: HideState, ayahs: number[], ayah: number): boolean {
  if (!isHidden(state, ayah)) return false;
  // Every mode retains an immediate per-verse reveal escape hatch.
  if (!ayahs.includes(ayah)) return false;
  return true; // A وB: كشف فردي حر.
}

export function revealVerse(state: HideState, ayahs: number[], ayah: number): HideState {
  if (!canRevealVerse(state, ayahs, ayah)) return state;
  return {...state, revealed: new Set([...state.revealed, ayah])};
}

/** «إظهار الكل» متاح دائمًا في كل الأوضاع، بما فيها E (للمراجعة بعد الاسترجاع). */
export function revealAll(state: HideState, ayahs: number[]): HideState {
  return {...state, revealed: new Set(ayahs)};
}

/** هل يجوز إخفاء هذه الآية؟ B أساسه الإخفاء الفردي؛ A وD يدعمان إعادة الإخفاء؛ E يخفي كله دفعة واحدة فقط. */
export function canHideVerse(state: HideState, ayah: number): boolean {
  if (state.mode === 'E') return false;
  return state.revealed.has(ayah);
}

export function hideVerse(state: HideState, ayah: number): HideState {
  if (!canHideVerse(state, ayah)) return state;
  const revealed = new Set(state.revealed);
  revealed.delete(ayah);
  return {...state, revealed};
}

export function hideAll(state: HideState): HideState {
  return {...state, revealed: new Set()};
}

/** إعلان نصي لقارئ الشاشة عن الحالة المخفية. */
export function hiddenAriaLabel(mode: HideMode): string {
  if (mode === 'E') return 'آية مخفية ضمن اختبار استرجاع كامل';
  if (mode === 'D') return 'آية مخفية تُكشف بالتدريج بعد استرجاع ما قبلها';
  return 'آية مخفية للاختبار';
}
