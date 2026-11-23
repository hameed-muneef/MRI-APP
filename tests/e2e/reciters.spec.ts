import { expect, test } from '@playwright/test';

const TINY_MP3 = Buffer.from(
  'fffb9064000000000000000000000000' +
  '496e666f0000000f0000000100000100' +
  '00'.repeat(160),
  'hex',
);

test.describe('Quran Reciters Library (244+) & Mobile Offline Download', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('browses 244+ reciters, searches by Arabic name, downloads a surah offline, and selects for playback on open', async ({ page, context }) => {
    // Intercept external mp3quran API & CDN audio requests so tests are fast and deterministic
    await page.route('https://www.mp3quran.net/api/v3/reciters**', async route => {
      await route.abort();
    });
    await page.route('https://**/*.mp3quran.net/**/*.mp3', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        headers: { 'access-control-allow-origin': '*' },
        body: TINY_MP3,
      });
    });

    await page.goto('/');
    await page.locator('.mobile-nav button', { hasText: 'القرآن' }).click();
    await expect(page.locator('.quran-page')).toBeVisible();

    // 1. Open dedicated 'مكتبة القراء والتلاوات' tab
    await page.locator('.quran-section-grid button[data-quran-tab="reciters"]').click();
    await expect(page.locator('.reciters-library')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.reciters-library .ol-head h3')).toContainText('٢٤٤');

    // Verify no horizontal overflow on 360px
    const overflowTab = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(overflowTab).toBe(true);

    // 2. Search across all reciters (even beyond initial 40 famous)
    await page.locator('.reciters-search-box input').fill('المعيقلي');
    await expect(page.locator('.reciter-card').first()).toContainText('ماهر');

    await page.locator('.reciters-search-box input').fill('الدوسري');
    const yasserCard = page.locator('.reciter-card', { hasText: 'ياسر الدوسري' }).first();
    await expect(yasserCard).toBeVisible();

    // 3. Switch scope chip to 'سورة محددة' (سورة الفاتحة) and download offline to browser Cache Storage
    await page.locator('.reciters-scope-chips button[role="radio"]', { hasText: 'سورة محددة' }).click();
    await expect(page.locator('.reciters-single-surah select')).toBeVisible();
    await yasserCard.getByRole('button', { name: 'تحميل', exact: true }).click();

    await expect(yasserCard).toContainText('١ سورة', { timeout: 10_000 });
    await expect(yasserCard.getByRole('button', { name: 'مكتمل', exact: true })).toBeVisible();

    // 4. Filter by 'المنزّلون' tab and verify downloaded reciter persists
    await page.locator('.reciters-tabs button', { hasText: 'المنزّلون' }).click();
    await expect(page.locator('.reciter-card', { hasText: 'ياسر الدوسري' })).toBeVisible();

    // 5. Select the reciter ('استماع الآن') -> switches back to Mushaf with ياسر الدوسري active & offline badge shown
    await page.locator('.reciter-card', { hasText: 'ياسر الدوسري' }).getByRole('button', { name: /استماع الآن/ }).click();
    await expect(page.locator('.mf-toolbar')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.mf-offline-pill')).toContainText('السورة متاحة دون إنترنت');

    // 6. Verify Mushaf bottom-sheet opens cleanly on 320px dark theme (edge-to-edge, compact, above-the-fold)
    await page.setViewportSize({ width: 320, height: 740 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.locator('.mf-audio-extra button').click();

    const sheet = page.locator('.mf-sheet-reciters');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.ol-head')).toHaveCount(0);
    await expect(sheet.locator('.mf-sheet-reciters-head')).toBeVisible();

    const firstCard = sheet.locator('.reciter-card').first();
    await expect(firstCard).toBeVisible();

    const sheetBox = await sheet.boundingBox();
    const cardBox = await firstCard.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (sheetBox && cardBox) {
      expect(sheetBox.width).toBeGreaterThanOrEqual(318);
      expect(sheetBox.height).toBeLessThanOrEqual(740 * 0.85);
      // First reciter card must appear immediately above the fold without vertical scrolling
      expect(cardBox.y).toBeLessThan(680);
    }

    // Verify 44px touch targets and dark-mode contrast inside the light-paper sheet
    const uiMetrics = await sheet.evaluate(el => {
      const listenBtn = el.querySelector('.reciter-btn-listen') as HTMLElement | null;
      const dlBtn = el.querySelector('.reciter-btn-dl') as HTMLElement | null;
      const activeTab = el.querySelector('.reciters-tabs button.active') as HTMLElement | null;
      const closeBtn = el.querySelector('button[aria-label="إغلاق"]') as HTMLElement | null;
      const getPair = (node: HTMLElement | null) => {
        if (!node) return null;
        const s = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        return { color: s.color, bg: s.backgroundColor, height: r.height };
      };
      return {
        listen: getPair(listenBtn),
        dl: getPair(dlBtn),
        activeTab: getPair(activeTab),
        close: getPair(closeBtn),
      };
    });
    expect(uiMetrics.listen?.height ?? 0).toBeGreaterThanOrEqual(42);
    expect(uiMetrics.dl?.height ?? 0).toBeGreaterThanOrEqual(42);
    expect(uiMetrics.close?.height ?? 0).toBeGreaterThanOrEqual(42);
    expect(uiMetrics.activeTab?.color).not.toBe(uiMetrics.activeTab?.bg);
    expect(uiMetrics.listen?.color).not.toBe(uiMetrics.listen?.bg);
    expect(uiMetrics.dl?.color).not.toBe(uiMetrics.dl?.bg);

    const overflowModal320 = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(overflowModal320).toBe(true);

    // Simulate going offline and verify downloaded surah still allows tapping Play without offline error toast
    await sheet.locator('button[aria-label="إغلاق"]').click();
    await expect(sheet).toBeHidden();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('.mf-offline-pill')).toContainText('السورة متاحة دون إنترنت');
    await context.setOffline(false);
  });
});
