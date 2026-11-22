import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollPageToTop, shouldShowScrollTop } from './ScrollToTopFab';

describe('shouldShowScrollTop', () => {
  const base = {
    enabled: true,
    scrollHeight: 2400,
    innerHeight: 800,
    threshold: 360,
    minOverflow: 240,
  };

  it('stays hidden near the top of the page', () => {
    expect(shouldShowScrollTop({ ...base, scrollY: 0 })).toBe(false);
    expect(shouldShowScrollTop({ ...base, scrollY: 359 })).toBe(false);
  });

  it('becomes visible once scrolled past the threshold on a long page', () => {
    expect(shouldShowScrollTop({ ...base, scrollY: 360 })).toBe(true);
    expect(shouldShowScrollTop({ ...base, scrollY: 1200 })).toBe(true);
  });

  it('stays hidden on short pages without enough overflow', () => {
    expect(
      shouldShowScrollTop({
        ...base,
        scrollHeight: 980,
        innerHeight: 800,
        scrollY: 400,
      }),
    ).toBe(false);
  });

  it('stays hidden when disabled', () => {
    expect(shouldShowScrollTop({ ...base, enabled: false, scrollY: 900 })).toBe(false);
  });
});

describe('scrollPageToTop', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scrolls window smoothly to top and dispatches rabbani:scroll-top', () => {
    const winScroll = vi.fn();
    const docScroll = vi.fn();
    const eventSpy = vi.fn();

    vi.stubGlobal('window', {
      scrollTo: winScroll,
      dispatchEvent: eventSpy,
      matchMedia: () => ({ matches: false }),
    });
    vi.stubGlobal('document', {
      documentElement: { scrollTo: docScroll, scrollTop: 500 },
    });

    scrollPageToTop();

    expect(eventSpy).toHaveBeenCalledTimes(1);
    expect(eventSpy.mock.calls[0][0]?.type).toBe('rabbani:scroll-top');
    expect(winScroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(docScroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('uses auto scroll when prefers-reduced-motion matches', () => {
    const winScroll = vi.fn();
    const docScroll = vi.fn();

    vi.stubGlobal('window', {
      scrollTo: winScroll,
      dispatchEvent: vi.fn(),
      matchMedia: () => ({ matches: true }),
    });
    vi.stubGlobal('document', {
      documentElement: { scrollTo: docScroll, scrollTop: 500 },
    });

    scrollPageToTop();

    expect(winScroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    expect(docScroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
