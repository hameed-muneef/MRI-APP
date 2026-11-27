import {expect, test} from '@playwright/test';

/**
 * The achievement entry on the home screen keeps its icon beside the title and subtitle, vertically centred in the card, like the
 * other home cards. Checked by geometry with tolerances (no exact heights), at phone widths, in both themes.
 */
for (const selector of ['.home-achievement-entry', '.home-coach-entry'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [360, 390, 412]) {
      // .home-coach-entry was removed from Home on the user's request (suggestion UI removed): skipped, not deleted.
      const t = selector === '.home-coach-entry' ? test.skip : test;
      t(`${selector} is centred on one row, no overflow (${width}px, ${theme})`, async ({page}) => {
        await page.setViewportSize({width, height: 800});
        await page.addInitScript((t) => { try { localStorage.setItem('rabbani-theme-v1', t); } catch { /* ignore */ } }, theme);
        await page.goto('/');
        const card = page.locator(selector);
        await card.waitFor({state: 'visible', timeout: 30_000});
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const g = await page.evaluate((sel) => {
          const rect = (e: Element) => { const b = e.getBoundingClientRect(); return {x: b.x, y: b.y, w: b.width, h: b.height}; };
          const card = document.querySelector(sel) as HTMLElement;
          const icon = card.querySelector('.home-today-icon')!;
          const strong = card.querySelector('strong')!;
          const small = card.querySelector('small')!;
          return {card: rect(card), icon: rect(icon), strong: rect(strong), small: rect(small), scrollW: card.scrollWidth, clientW: card.clientWidth, vw: window.innerWidth, docW: document.documentElement.scrollWidth};
        }, selector);
        const mid = (r: {y: number; h: number}) => r.y + r.h / 2;
        const textTop = g.strong.y, textBottom = g.small.y + g.small.h;
        const textMid = (textTop + textBottom) / 2;
        // icon and text block share one row: their vertical centres agree, and the text does not sit below the icon
        expect(Math.abs(mid(g.icon) - textMid), 'icon centre vs text centre').toBeLessThanOrEqual(3);
        expect(g.strong.y, 'title is not below the icon').toBeLessThan(g.icon.y + g.icon.h);
        // the row is centred in the card
        expect(Math.abs(mid(g.card) - mid(g.icon)), 'icon centre vs card centre').toBeLessThanOrEqual(3);
        expect(Math.abs(mid(g.card) - textMid), 'text centre vs card centre').toBeLessThanOrEqual(3);
        // right-to-left: the icon is on the right of the text
        expect(g.icon.x).toBeGreaterThan(g.strong.x);
        // nothing overflows the card or the page
        expect(g.scrollW).toBeLessThanOrEqual(g.clientW + 1);
        expect(g.docW).toBeLessThanOrEqual(g.vw + 1);
        expect(g.strong.x).toBeGreaterThanOrEqual(g.card.x);
        expect(g.strong.x + g.strong.w).toBeLessThanOrEqual(g.card.x + g.card.w + 1);
      });
    }
  }
}
