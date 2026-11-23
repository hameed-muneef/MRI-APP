// خدمة الجدولة والمنبهات
// تحسب الوقت التالي للتنبيه، وتتعامل مع التكرار والمناطق الزمنية وتوقيت الصيفي.
// لا تعتمد على منصة التوصيل؛ تُستدعى من خدمة التوصيل عند الحاجة.

import type {Reminder} from './types';

const WEEK_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function formatTimeHM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatDateYMD(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function parseLocalDateAtTime(raw: string, base: Date): Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month, day, base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function endOfLocalDay(ymd?: string): Date | null {
  if (!ymd) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function clampEndDate(candidate: Date | null, endDate: Date | null): Date | null {
  if (!candidate) return null;
  if (endDate && candidate.getTime() > endDate.getTime()) return null;
  return candidate;
}

/**
 * يحسب الموعد التالي للتنبيه بناءً على التكرار والوقت الحالي.
 * يعرض null إذا لم يكن هناك موعد قادم (انتهى التكرار أو غير مفعّل).
 */
export function nextDueDate(reminder: Reminder, now: Date = new Date()): Date | null {
  if (!reminder.enabled) return null;
  const base = new Date(reminder.scheduled_at);
  if (isNaN(base.getTime())) return null;

  const recurrence = reminder.recurrence;
  const config = reminder.recurrence_config ?? {};
  const endDate = endOfLocalDay(config.end_date);

  // A recurrence cannot precede its original date or the user's start date.
  const startDate = config.start_date ? parseLocalDateAtTime(config.start_date, base) : null;
  const lowerBound = new Date(Math.max(base.getTime(), startDate?.getTime() ?? base.getTime()));
  const after = new Date(Math.max(now.getTime(), lowerBound.getTime() - 1));

  // مرة واحدة
  if (recurrence === 'none') {
    return base > now ? base : null;
  }

  // يوميًا
  if (recurrence === 'daily') {
    const candidate = new Date(after);
    candidate.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
    if (candidate <= after) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return clampEndDate(candidate, endDate);
  }

  // أيام الأسبوع المختارة
  if (recurrence === 'weekdays' || recurrence === 'weekday') {
    const days = config.days_of_week ?? (recurrence === 'weekday' ? [0] : [1, 2, 3, 4, 5]);
    // ابحث عن اليوم التالي المطابق بعد الوقت الحالي
    for (let offset = 0; offset < 8; offset += 1) {
      const testDay = addDays(after, offset);
      if (!days.includes(testDay.getDay())) continue;
      const candidateTime = new Date(testDay);
      candidateTime.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
      if (candidateTime > after) return clampEndDate(candidateTime, endDate);
    }
    return null;
  }

  // أسبوعيًا
  if (recurrence === 'weekly') {
    const dayOfWeek = base.getDay();
    for (let offset = 0; offset <= 8; offset += 1) {
      const testDay = addDays(after, offset);
      if (testDay.getDay() !== dayOfWeek) continue;
      const candidateTime = new Date(testDay);
      candidateTime.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
      if (candidateTime > after) return clampEndDate(candidateTime, endDate);
    }
    return null;
  }

  // شهريًا
  if (recurrence === 'monthly') {
    const dayOfMonth = base.getDate();
    const hours = base.getHours();
    const minutes = base.getMinutes();
    const seconds = base.getSeconds();

    // جرب هذا الشهر
    const lastDayThisMonth = new Date(after.getFullYear(), after.getMonth() + 1, 0).getDate();
    let candidate = new Date(after.getFullYear(), after.getMonth(), Math.min(dayOfMonth, lastDayThisMonth), hours, minutes, seconds);
    if (candidate <= after) {
      // جرب الشهر التالي
      const nextMonth = after.getMonth() + 1;
      const nextYear = nextMonth > 11 ? after.getFullYear() + 1 : after.getFullYear();
      const normalizedMonth = nextMonth > 11 ? 0 : nextMonth;
      const lastDayNextMonth = new Date(nextYear, normalizedMonth + 1, 0).getDate();
      candidate = new Date(nextYear, normalizedMonth, Math.min(dayOfMonth, lastDayNextMonth), hours, minutes, seconds);
    }
    return candidate > after ? clampEndDate(candidate, endDate) : null;
  }

  // مخصص (فاصل أيام)
  if (recurrence === 'custom') {
    const rawInterval = config.interval_days;
    const interval = typeof rawInterval === 'number' && Number.isFinite(rawInterval) ? Math.max(1, Math.floor(rawInterval)) : 1;
    let candidate = new Date(base);
    const calendarDays = Math.floor((Date.UTC(after.getFullYear(), after.getMonth(), after.getDate()) - Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())) / 86400000);
    if (calendarDays > 0) candidate = addDays(base, Math.floor(calendarDays / interval) * interval);
    while (candidate <= after) {
      candidate = addDays(candidate, interval);
    }
    return clampEndDate(candidate, endDate);
  }

  // تواريخ محددة
  if (recurrence === 'specific_dates') {
    const dates = (config.specific_dates ?? [])
      .map(d => parseLocalDateAtTime(d, base))
      .filter((d): d is Date => d !== null);
    const future = dates.filter(d => d > after);
    if (future.length === 0) return null;
    const earliest = future.reduce((best, d) => (d < best ? d : best), future[0]);
    return clampEndDate(earliest, endDate);
  }

  return null;
}

/**
 * الموعد الفعلي القادم للمنبه مع مراعاة التأجيل المؤقت (snooze_until).
 */
export function effectiveNextDueDate(reminder: Reminder, now: Date = new Date()): Date | null {
  if (!reminder.enabled) return null;
  if (reminder.snooze_until) {
    const snooze = new Date(reminder.snooze_until);
    if (!isNaN(snooze.getTime()) && snooze.getTime() > now.getTime()) {
      return snooze;
    }
  }
  return nextDueDate(reminder, now);
}

/**
 * يحسب قائمة المواعيد القادمة للتنبيه خلال فترة محددة.
 */
export function upcomingOccurrences(reminder: Reminder, from: Date, limit = 10): Date[] {
  const results: Date[] = [];
  let current = new Date(from);
  for (let i = 0; i < limit * 2; i += 1) {
    const next = nextDueDate(reminder, current);
    if (!next) break;
    results.push(next);
    current = new Date(next.getTime()); // nextDueDate is strictly later than its probe
    if (results.length >= limit) break;
  }
  return results;
}

/**
 * يتحقق مما إذا كان التذكير مستحقًا الآن (within a small window).
 */
export function isDue(reminder: Reminder, now: Date = new Date(), windowSeconds = 60): boolean {
  const next = effectiveNextDueDate(reminder, new Date(now.getTime() - windowSeconds * 1000 - 1));
  if (!next) return false;
  return Math.abs(next.getTime() - now.getTime()) <= windowSeconds * 1000;
}

/**
 * يحسب وقت الأذان مع مراعاة التذكير قبل/بعد الصلاة.
 */
export function prayerNotificationTimes(prayerTime: string, beforeMinutes?: number, afterMinutes?: number): {before?: Date; after?: Date; at: Date} {
  const [hours, minutes] = prayerTime.split(':').map(Number);
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  const result: {before?: Date; after?: Date; at: Date} = {at};
  if (beforeMinutes && beforeMinutes > 0) {
    result.before = addMinutes(at, -beforeMinutes);
  }
  if (afterMinutes && afterMinutes > 0) {
    result.after = addMinutes(at, afterMinutes);
  }
  return result;
}

export {WEEK_DAYS};
