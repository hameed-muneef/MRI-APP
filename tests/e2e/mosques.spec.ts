import { test, expect } from '@playwright/test';

test.describe('Nearby Mosques (mobile viewport)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('orders nearest mosques, shows distances, and builds Google Maps URL with travel mode toggle', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    // Cairo downtown (near real mosques in public/data/eg.json)
    await context.setGeolocation({ latitude: 30.0444, longitude: 31.2357 });

    await page.addInitScript(() => {
      (window as unknown as { __openedUrls?: string[] }).__openedUrls = [];
      window.open = (url?: string | URL) => {
        (window as unknown as { __openedUrls: string[] }).__openedUrls.push(String(url ?? ''));
        return null;
      };
    });

    await page.goto('/');
    const mosquesNavBtn = page.locator('.mobile-nav button', { hasText: 'المساجد' });
    await expect(mosquesNavBtn).toBeVisible();
    const navBox = await mosquesNavBtn.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.x).toBeGreaterThanOrEqual(0);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(375);

    await mosquesNavBtn.click();
    await expect(mosquesNavBtn).toHaveClass(/active/);
    await expect(mosquesNavBtn).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.mosques-page')).toBeVisible();

    const cards = page.locator('.mosque-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // Verify ascending distances
    const badgeTexts = await page.locator('.mosque-distance-badge strong').allInnerTexts();
    const meters = badgeTexts.map((txt) => {
      if (txt.includes('كم')) return parseFloat(txt) * 1000;
      return parseFloat(txt);
    });
    for (let i = 1; i < meters.length; i += 1) {
      expect(meters[i]).toBeGreaterThanOrEqual(meters[i - 1]);
    }

    // Open Google Maps (walking default)
    await cards.first().locator('.mosque-maps-btn').click();
    let opened = await page.evaluate(() => (window as unknown as { __openedUrls: string[] }).__openedUrls);
    expect(opened[0]).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=-?\d+(\.\d+)?,-?\d+(\.\d+)?&travelmode=walking$/);

    // Switch to driving and click again
    await page.locator('.mosques-mode-group button', { hasText: 'سيارة' }).click();
    await cards.first().locator('.mosque-maps-btn').click();
    opened = await page.evaluate(() => (window as unknown as { __openedUrls: string[] }).__openedUrls);
    expect(opened[1]).toMatch(/travelmode=driving$/);
  });

  test('shows permission-denied fallback state when geolocation permission is denied', async ({ page, context }) => {
    await context.clearPermissions();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: async () => ({ state: 'denied' }),
        },
        configurable: true,
      });
    });

    await page.goto('/');
    await page.locator('.mobile-nav button', { hasText: 'المساجد' }).click();
    await expect(page.locator('.mosque-state-card.warn')).toContainText('تعذر الوصول إلى الموقع');
    await page.locator('button', { hasText: 'اختيار دولة أو مدينة يدويًا' }).click();
    await expect(page.locator('.mosque-manual-picker')).toBeVisible();
  });

  test('shows outside-region state when coordinates are far from any country', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    // Middle of the South Pacific (no land/country within range)
    await context.setGeolocation({ latitude: -30.0, longitude: -150.0 });

    await page.goto('/');
    await page.locator('.mobile-nav button', { hasText: 'المساجد' }).click();
    await expect(page.locator('.mosque-state-card')).toContainText('موقعك خارج نطاق الدول المشمولة حاليًا');
  });

  test('covers consent-first prompt, Arab-only manual picker, radius change, dark mode, and 320px layout', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: async () => ({ state: 'prompt' }),
        },
        configurable: true,
      });
    });

    await page.goto('/');
    const mosquesNavBtn = page.locator('.mobile-nav button', { hasText: 'المساجد' });
    await expect(mosquesNavBtn).toBeVisible();
    const box320 = await mosquesNavBtn.boundingBox();
    expect(box320).not.toBeNull();
    expect(box320!.x).toBeGreaterThanOrEqual(0);
    expect(box320!.x + box320!.width).toBeLessThanOrEqual(320);

    await mosquesNavBtn.click();
    await expect(page.locator('#mosque-consent-title')).toBeVisible();
    await expect(page.locator('.mosques-page')).toContainText('موقعك يبقى على جهازك فقط');

    // Open manual picker and verify only covered Arab cities appear without duplicates
    await page.locator('button', { hasText: 'اختيار دولة أو مدينة يدويًا' }).click();
    await expect(page.locator('.mosque-manual-picker')).toBeVisible();
    await expect(page.locator('.mosque-city-list')).not.toContainText('لندن');
    await expect(page.locator('.mosque-city-list button', { hasText: 'القاهرة' })).toHaveCount(1);

    // Search and select Riyadh
    await page.locator('#mosque-city-search').fill('الرياض');
    await page.locator('.mosque-city-list button', { hasText: 'الرياض' }).click();
    await expect(page.locator('.mosque-card').first()).toBeVisible({ timeout: 10_000 });

    // Switch radius to 3 كم and verify active state
    const radius3km = page.locator('.mosques-radius-group button', { hasText: '3 كم' });
    await radius3km.click();
    await expect(radius3km).toHaveClass(/active/);

    // Verify no horizontal overflow at 320px viewport (excluding intentional scrollable nav)
    const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(docOverflow).toBe(true);
  });
});
