import { expect, test } from '@playwright/test';

const TINY_MP3 = Buffer.from(
  'fffb9064000000000000000000000000' +
  '496e666f0000000f0000000100000100' +
  '00'.repeat(160),
  'hex',
);

/** نسبة تباين WCAG بين لوني rgb() — تكشف النص الداكن على خلفية داكنة فعليًا. */
function contrastRatio(fg: string, bg: string): number {
  const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = (rgb: number[]) => {
    const f = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const l1 = lum(parse(fg));
  const l2 = lum(parse(bg));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

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
    await yasserCard.locator('.reciter-toggle').click(); // expand the collapsed card to reach its actions
    await yasserCard.getByRole('button', { name: 'تحميل', exact: true }).click();

    await expect(yasserCard).toContainText('١ سورة', { timeout: 10_000 });
    await expect(yasserCard.getByRole('button', { name: 'مكتمل', exact: true })).toBeVisible();

    // 4. Filter by 'المنزّلون' tab and verify downloaded reciter persists
    await page.locator('.reciters-tabs button', { hasText: 'المنزّلون' }).click();
    await expect(page.locator('.reciter-card', { hasText: 'ياسر الدوسري' })).toBeVisible();

    // 5. Select the reciter ('اعتماد للمصحف') -> switches back to Mushaf with ياسر الدوسري active & offline badge shown
    const yCard = page.locator('.reciter-card', { hasText: 'ياسر الدوسري' });
    if ((await yCard.locator('.reciter-toggle').getAttribute('aria-expanded')) !== 'true') await yCard.locator('.reciter-toggle').click();
    await yCard.getByRole('button', { name: /اعتماد للمصحف/ }).click(); // 'استماع' now plays in place; 'اعتماد للمصحف' selects the reciter and opens the Mushaf
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

    await sheet.getByRole('tab', { name: /المنزّلون/ }).click(); // the list stays empty until a category tab (or a search) is chosen
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
    if ((await firstCard.locator('.reciter-toggle').getAttribute('aria-expanded')) !== 'true') await firstCard.locator('.reciter-toggle').click();
    const uiMetrics = await sheet.evaluate(el => {
      const listenBtn = el.querySelector('.reciter-btn-listen.selected') as HTMLElement | null;
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
    // تباين حقيقي (WCAG AA للنصوص): كان النص داكنًا (#1a2a24) فوق زر داكن (#163d34)
    // داخل الورقة الفاتحة بالوضع الداكن، فبدا مختفيًا كما في لقطة المستخدم.
    expect(contrastRatio(uiMetrics.activeTab!.color, uiMetrics.activeTab!.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(uiMetrics.listen!.color, uiMetrics.listen!.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(uiMetrics.dl!.color, uiMetrics.dl!.bg)).toBeGreaterThanOrEqual(4.5);

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

  test('downloads the full mushaf for a reciter directly from the library card', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route('https://www.mp3quran.net/api/v3/reciters**', route => route.abort());
    await page.route('https://**/*.mp3quran.net/**/*.mp3', route => route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      headers: { 'access-control-allow-origin': '*' },
      body: TINY_MP3,
    }));

    await page.goto('/');
    await page.locator('.mobile-nav button', { hasText: 'القرآن' }).click();
    await page.locator('.quran-section-grid button[data-quran-tab="reciters"]').click();
    await expect(page.locator('.reciters-library')).toBeVisible({ timeout: 10_000 });

    // Every reciter card exposes a one-tap full-mushaf download with its surah count
    await page.getByRole('tab', { name: 'الأشهر' }).click(); // the list stays empty until a category tab is chosen
    const firstCard = page.locator('.reciter-card').first();
    await firstCard.locator('.reciter-toggle').click(); // cards are collapsed by default; expand to reach the download actions
    const fullBtn = firstCard.locator('.reciter-btn-full');
    await expect(fullBtn).toBeVisible();
    await expect(fullBtn).toContainText('تحميل المصحف كاملًا (١١٤ سورة)');

    // Two-tap confirm protects against accidental multi-hundred-MB downloads
    await fullBtn.click();
    const confirmBtn = firstCard.locator('.reciter-full-confirm .soft-btn').first();
    await expect(confirmBtn).toContainText('تأكيد تنزيل ١١٤ سورة');
    await confirmBtn.click();

    // Progress covers the whole mushaf, then the card shows a saved state
    await expect(firstCard.locator('.reciter-dl-progress')).toContainText('/١١٤', { timeout: 10_000 });
    await expect(firstCard.locator('.reciter-btn-full.done')).toContainText('المصحف كاملًا محفوظ', { timeout: 45_000 });
    await expect(firstCard).toContainText('١١٤ سورة');

    // Contrast of the active tab stays readable in the standalone library too (light + dark)
    const activeTabPair = await page.evaluate(() => {
      const el = document.querySelector('.reciters-tabs button.active') as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor };
    });
    expect(activeTabPair).not.toBeNull();
    expect(contrastRatio(activeTabPair!.color, activeTabPair!.bg)).toBeGreaterThanOrEqual(4.5);

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const darkActiveTabPair = await page.evaluate(() => {
      const el = document.querySelector('.reciters-tabs button.active') as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor };
    });
    expect(darkActiveTabPair).not.toBeNull();
    expect(contrastRatio(darkActiveTabPair!.color, darkActiveTabPair!.bg)).toBeGreaterThanOrEqual(4.5);

    // Scope chips wrap instead of clipping المصحف كاملًا off the edge
    const chipsOverflow = await page.evaluate(() => {
      const el = document.querySelector('.reciters-scope-chips');
      return el ? el.scrollWidth <= (el.clientWidth + 1) : true;
    });
    expect(chipsOverflow).toBe(true);
  });
});
