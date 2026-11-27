import {useEffect} from 'react';

/**
 * يقفل تمرير الصفحة خلف أي لوحة/ورقة مفتوحة (مشترك بعدّاد، فتتداخل الطبقات بأمان).
 * يُرفع القفل عند الإغلاق أو إزالة المكوّن. التمرير داخل اللوحة نفسها يبقى متاحًا.
 */
let locks = 0;
let saved: {html: string; body: string} | null = null;

export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (locks === 0) {
    saved = {html: document.documentElement.style.overflow, body: document.body.style.overflow};
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-scroll-locked', 'true');
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      document.documentElement.style.overflow = saved.html;
      document.body.style.overflow = saved.body;
      document.documentElement.removeAttribute('data-scroll-locked');
      saved = null;
    }
  };
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return lockPageScroll();
  }, [active]);
}
