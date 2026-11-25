import {expect, test, type Page} from '@playwright/test';

// خطة الحفظ الموحّدة: التفعيل ← إتمام مقرر اليوم مرة واحدة ← التقدم يُحفظ بعد إعادة التحميل ← بطاقة الخطط تطابق المصحف.
const PLAN_KEY = 'rabbani-bilquran-plan-v1';
const planState = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), PLAN_KEY);

async function openHifz(page: Page) {
  await page.goto('/');
  await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
  await page.locator('.quran-section-grid button[data-quran-tab="hifz"]').click();
  await expect(page.locator('.hf-entry')).toBeVisible({timeout: 15_000});
}

async function finishDay(page: Page) {
  const scrim = page.locator('.hf-scrim');
  if (await scrim.count()) await scrim.click();
  for (let i = 0; i < 5; i += 1) {
    await page.locator('.hf-next').click();
    const startRecite = page.locator('.hf-ask .hf-ok');
    if (await startRecite.count()) await startRecite.click();
    const dismiss = page.locator('.hf-scrim');
    if (await dismiss.count()) { try { await dismiss.click({timeout: 3000}); } catch { /* gone */ } }
  }
  await page.locator('.hf-assess button').first().click();
}

test.describe('hifz plan integration', () => {
  test.use({viewport: {width: 360, height: 780}});

  test('daily completion advances once, persists on reload, and the plans card matches', async ({page}) => {
    await openHifz(page);
    await page.locator('.hf-plan-launch').click();
    await page.locator('.hf-plan-card button', {hasText: 'معاينة الجدول'}).first().click();
    await page.locator('.hf-plan-preview-actions .hf-ok').click();
    await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
    const before = await planState(page);
    expect(before.currentIndex).toBe(0);
    expect(before.completedIndices).toEqual([]);

    await finishDay(page);
    await expect(page.locator('.hf-active-plan')).toBeVisible();
    const after = await planState(page);
    expect(after.planId).toBe(before.planId);
    expect(after.completedIndices).toEqual([0]);
    expect(after.currentIndex).toBe(1);

    // المصحف يعرض الخطة نفسها بعد إعادة التحميل، وبدون تقدّم مضاعف
    await page.reload();
    const reloaded = await planState(page);
    expect(reloaded.completedIndices).toEqual([0]);
    expect(reloaded.currentIndex).toBe(1);
    await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
    await page.locator('.quran-section-grid button[data-quran-tab="plans"]').click();
    const card = page.locator('.quran-plans-card');
    await expect(card).toContainText('اليوم ٢');
    await expect(card).toContainText('١ مكتمل');

    // فتح مقرر اليوم من البطاقة يبدأ المقرر رقم 2 في المصحف ولا يغيّر التقدم قبل الإتمام
    await card.locator('button', {hasText: 'ابدأ مقرر اليوم'}).click();
    await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
    const reopened = await planState(page);
    expect(reopened.currentIndex).toBe(1);
    expect(reopened.completedIndices).toEqual([0]);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`small short phone 320x568 ${theme}: no overflow, sheet scrolls to play and close`, async ({page}) => {
      await page.setViewportSize({width: 320, height: 568});
      await openHifz(page);
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.locator('.hf-plan-launch').click();
      await page.locator('.hf-plan-card button', {hasText: 'معاينة الجدول'}).first().click();
      await page.locator('.hf-plan-preview-actions .hf-ok').click();
      await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
      const scrim = page.locator('.hf-scrim');
      if (await scrim.count()) await scrim.click();
      await page.locator('.hf-top-actions button[aria-label="إعدادات التشغيل"]').click();
      const sheet = page.locator('.hf-sheet');
      await expect(sheet).toBeVisible();
      const m = await page.evaluate(() => {
        const s = document.querySelector('.hf-sheet') as HTMLElement;
        const r = s.getBoundingClientRect();
        return {top: r.top, bottom: r.bottom, vh: window.innerHeight, scrollable: s.scrollHeight > s.clientHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth};
      });
      expect(m.top).toBeGreaterThanOrEqual(0);
      expect(m.bottom).toBeLessThanOrEqual(m.vh + 1);
      expect(m.sw).toBeLessThanOrEqual(m.iw + 1);
      // زر التشغيل يصل إليه التمرير داخل الورقة، وزر الإغلاق ظاهر
      const play = sheet.locator('.hf-ok');
      await play.scrollIntoViewIfNeeded();
      const pb = await play.boundingBox();
      expect(pb && pb.y >= 0 && pb.y + pb.height <= 568).toBeTruthy();
      await expect(sheet.locator('.hf-sheet-x')).toBeVisible();
      await page.screenshot({path: `/tmp/shots/small-${theme}-sheet.png`});
      await sheet.locator('.hf-sheet-x').click();
      await expect(sheet).toBeHidden();
      await page.screenshot({path: `/tmp/shots/small-${theme}-reading.png`});
    });
  }
});
