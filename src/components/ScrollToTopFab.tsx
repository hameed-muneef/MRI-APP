import { useCallback, useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export interface ScrollTopVisibilityInput {
  enabled: boolean;
  scrollY: number;
  scrollHeight: number;
  innerHeight: number;
  threshold: number;
  minOverflow: number;
}

export function shouldShowScrollTop({
  enabled,
  scrollY,
  scrollHeight,
  innerHeight,
  threshold,
  minOverflow,
}: ScrollTopVisibilityInput): boolean {
  if (!enabled) return false;
  const overflow = Math.max(0, scrollHeight - innerHeight);
  return overflow >= minOverflow && scrollY >= threshold;
}

export function scrollPageToTop(behaviorOverride?: ScrollBehavior): void {
  if (typeof window === 'undefined') return;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = behaviorOverride ?? (reduced ? 'auto' : 'smooth');

  window.dispatchEvent(new CustomEvent('rabbani:scroll-top'));

  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, behavior });
  }
  if (typeof document !== 'undefined' && document.documentElement) {
    if (typeof document.documentElement.scrollTo === 'function') {
      document.documentElement.scrollTo({ top: 0, behavior });
    } else {
      document.documentElement.scrollTop = 0;
    }
  }
}

export interface ScrollToTopFabProps {
  enabled?: boolean;
  threshold?: number;
  minOverflow?: number;
  label?: string;
}

export default function ScrollToTopFab({
  enabled = true,
  threshold = 360,
  minOverflow = 240,
  label = 'العودة إلى أعلى الصفحة',
}: ScrollToTopFabProps) {
  const [visible, setVisible] = useState(false);

  const measure = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setVisible(false);
      return;
    }
    const doc = document.documentElement;
    const scrollY = Math.max(window.scrollY || 0, doc?.scrollTop || 0);
    const scrollHeight = doc?.scrollHeight || 0;
    const next = shouldShowScrollTop({
      enabled,
      scrollY,
      scrollHeight,
      innerHeight: window.innerHeight || 0,
      threshold,
      minOverflow,
    });
    setVisible((prev) => (prev === next ? prev : next));
  }, [enabled, threshold, minOverflow]);

  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }
    let frame = 0;
    const scheduleMeasure = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [enabled, measure]);

  return (
    <div
      className={`scroll-top-fab-dock${visible ? ' is-visible' : ''}`}
      aria-hidden={!visible}
    >
      <button
        type="button"
        className="scroll-top-fab"
        onClick={() => scrollPageToTop()}
        aria-label={label}
        title={label}
        tabIndex={visible ? 0 : -1}
      >
        <ArrowUp size={20} strokeWidth={2.25} aria-hidden="true" />
      </button>
    </div>
  );
}
