import {expect, test, type Page} from '@playwright/test';

async function checkNoOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    screenScrollWidth: document.querySelector('.hf-screen')?.scrollWidth ?? 0,
    screenClientWidth: document.querySelector('.hf-screen')?.clientWidth ?? 0,
  }));
  expect(
    metrics.docScrollWidth,
    `${label}: document overflow (${metrics.docScrollWidth} > ${metrics.innerWidth})`,
  ).toBeLessThanOrEqual(metrics.innerWidth + 1);
  if (metrics.screenClientWidth > 0) {
    expect(
      metrics.screenScrollWidth,
      `${label}: .hf-screen horizontal overflow (${metrics.screenScrollWidth} > ${metrics.screenClientWidth})`,
    ).toBeLessThanOrEqual(metrics.screenClientWidth + 1);
  }
}

test.describe('Hifz & Mastery mobile viewport fit (360x780)', () => {
  test.use({viewport: {width: 360, height: 780}});

  test('every screen, Mushaf page, plans browser, and sheet fits 360px mobile cleanly', async ({page}) => {
    await page.goto('/');
    await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
    await expect(page.locator('.quran-page')).toBeVisible();

    // Open مصحف الحفظ والإتقان tab
    const hifzTab = page.locator('.quran-section-grid button', {hasText: 'الحفظ'}).first();
    await hifzTab.click();
    await expect(page.locator('.hf-entry')).toBeVisible({timeout: 15_000});
    await checkNoOverflow(page, 'hifz-entry');

    // 1. Range picker (بالآيات + بالصفحات)
    await page.locator('.hf-choice', {hasText: 'حفظ'}).click();
    await expect(page.locator('.hf-range-card')).toBeVisible();
    await checkNoOverflow(page, 'hifz-range-ayah');

    await page.locator('.hf-range-card button[role="tab"]', {hasText: 'بالصفحات'}).click();
    await expect(page.locator('input[type="number"]').first()).toBeVisible();
    await checkNoOverflow(page, 'hifz-range-page');

    // Go back to entry and browse Bil-Quran plans
    await page.locator('.hf-entry-head button[aria-label="رجوع"]').click();
    await page.locator('.hf-plan-launch').click();
    await expect(page.locator('.hf-plans-wrap')).toBeVisible();
    await checkNoOverflow(page, 'hifz-plans-browser');

    // Switch direction & open schedule preview
    await page.locator('.hf-dir-box button', {hasText: 'من الناس ← البقرة'}).click();
    await checkNoOverflow(page, 'hifz-plans-nas-dir');

    await page.locator('.hf-plan-card button', {hasText: 'معاينة الجدول'}).first().click();
    await expect(page.locator('.hf-schedule-list')).toBeVisible();
    await checkNoOverflow(page, 'hifz-plan-schedule-preview');

    // Activate plan and enter Mushaf page reading/memorization screen
    await page.locator('.hf-plan-preview-actions .hf-ok').click();
    await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
    await page.waitForTimeout(300);
    await checkNoOverflow(page, 'hifz-reading-nas');

    // Close tutorial tip and inspect Mushaf page geometry + controls
    const scrim = page.locator('.hf-scrim');
    if (await scrim.count()) await scrim.click();

    const pageGeometry = await page.evaluate(() => {
      const reading = document.querySelector('.hf-reading') as HTMLElement | null;
      const area = document.querySelector('.hf-pagearea') as HTMLElement | null;
      const card = document.querySelector('.hifz-page') as HTMLElement | null;
      const bottom = document.querySelector('.hf-bottom') as HTMLElement | null;
      const linesHost = document.querySelector('.qm-lines-scroll') as HTMLElement | null;
      const lines = document.querySelector('.qm-lines') as HTMLElement | null;
      return {
        readingRect: reading?.getBoundingClientRect(),
        areaRect: area?.getBoundingClientRect(),
        cardRect: card?.getBoundingClientRect(),
        bottomRect: bottom?.getBoundingClientRect(),
        linesOverflow: linesHost && lines ? lines.scrollWidth - linesHost.clientWidth : 0,
      };
    });

    expect(pageGeometry.readingRect?.width).toBeLessThanOrEqual(361);
    expect(pageGeometry.linesOverflow).toBeLessThanOrEqual(2);
    if (pageGeometry.areaRect && pageGeometry.bottomRect) {
      expect(pageGeometry.areaRect.bottom).toBeLessThanOrEqual(pageGeometry.bottomRect.top + 2);
    }

    // Open playback settings sheet
    await page.locator('.hf-top-actions button[aria-label="إعدادات التشغيل"]').click();
    await expect(page.locator('.hf-sheet')).toBeVisible();
    await checkNoOverflow(page, 'hifz-settings-sheet');
    await page.locator('.hf-sheet-x').click();

    // Advance stages to inspect understand, memorize, connect, recite, assess on 360px
    for (const label of ['understand', 'memorize', 'connect', 'recite', 'assess']) {
      await page.locator('.hf-next').click();
      const dismiss = page.locator('.hf-scrim');
      if (await dismiss.count()) await dismiss.click();
      if (label === 'recite') {
        const startRecite = page.locator('.hf-ask .hf-ok');
        if (await startRecite.count()) await startRecite.click();
      }
      await checkNoOverflow(page, `hifz-stage-${label}`);
    }

    // Complete self-assessment and verify entry screen displays Active Plan progress
    await page.locator('.hf-assess button').first().click();
    await expect(page.locator('.hf-active-plan')).toBeVisible();
    await checkNoOverflow(page, 'hifz-entry-active-plan');
  });
});
