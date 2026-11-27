// متى تُعرض تفاصيل خطأ الموقع؟ الحالة نفسها تشرح السبب في حالات الرفض وعدم الدعم،
// فلا نكرّر الجملة نفسها مرتين تحت سطر الحالة.
export function shouldShowLocationError(status: string, error: string | null | undefined): boolean {
  if (!error) return false;
  if (status === 'locating') return false;
  if (status === 'denied' || status === 'unsupported') return false;
  return true;
}
