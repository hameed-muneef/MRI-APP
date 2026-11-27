import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  test(`notification panel locks page scroll and back closes it first (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => { localStorage.setItem('rabbani-theme-v1', t); }, theme);
    await page.goto('/');
    await page.locator('.notif-bell').click();
    const panel = page.locator('.notif-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked', 'true');
    const before = await panel.boundingBox();
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const after = await panel.boundingBox();
    expect(Math.round(after!.y)).toBe(Math.round(before!.y));
    // browser back stands in for the Android back button: the panel closes first, the page stays
    await page.goBack();
    await expect(panel).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked', 'true');
    await page.evaluate(() => window.scrollTo(0, 300));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(0);
  });
}
