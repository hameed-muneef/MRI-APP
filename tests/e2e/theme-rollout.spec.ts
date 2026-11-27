import { test, expect } from '@playwright/test';

// Palette roll-out: no horizontal overflow at small widths, local Cairo font, in both themes.
for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 360, 390]) {
    for (const [name, tab] of [['home', 0], ['day', 1], ['quran', 2]] as const) {
      test(`no overflow and Cairo UI font: ${name} ${width}px ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.addInitScript(t => localStorage.setItem('rabbani-theme-v1', t), theme);
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.locator('.mobile-nav button').nth(tab).click();
        await page.waitForTimeout(1200);
        const r = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          font: getComputedStyle(document.body).fontFamily,
          h: getComputedStyle(document.querySelector('h1, h2, h3') as Element).fontFamily,
        }));
        expect(r.sw).toBeLessThanOrEqual(width);
        expect(r.font).toMatch(/^"?Cairo/);
        expect(r.h).toMatch(/Cairo|Amiri|KFGQPC|Uthmanic/);
      });
    }
  }
}
