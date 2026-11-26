import {expect, test, type Page} from '@playwright/test';

// مهام خطة الحفظ: يومي + أسبوعي + شهري، بلا تكرار، تبقى بعد إعادة التحميل وبلا شبكة وعند رجوع الجهاز.
const PLAN_KEY = 'rabbani-bilquran-plan-v1';
const planTasks = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('rabbani-v1') || '{}').tasks || []).filter((t: {plan?: unknown}) => t.plan).map((t: {id: string; plan: {kind: string}; scheduledDate?: string}) => `${t.plan.kind}|${t.id}|${t.scheduledDate}`).sort());

async function activate(page: Page) {
  await page.goto('/');
  await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
  await page.locator('.quran-section-grid button[data-quran-tab="hifz"]').click();
  await expect(page.locator('.hf-entry')).toBeVisible({timeout: 15_000});
  await page.locator('.hf-plan-launch').click();
  await page.locator('.hf-plan-card button', {hasText: 'معاينة الجدول'}).first().click();
  await page.locator('.hf-plan-preview-actions .hf-ok').click();
  await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
}

test.describe('hifz plan tasks e2e', () => {
  test.use({viewport: {width: 390, height: 800}});
  test('daily, weekly and monthly plan tasks appear once, survive reload, offline and back', async ({page, context}) => {
    await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'));
    await activate(page);
    await page.evaluate(k => {const p = JSON.parse(localStorage.getItem(k)!); p.currentIndex = 9; p.completedIndices = [0,1,2,3,4,5,6,7,8]; p.updatedAt = '2026-11-19T08:00:00'; localStorage.setItem(k, JSON.stringify(p));}, PLAN_KEY);
    await page.clock.setFixedTime(new Date('2026-11-30T09:00:00')); // Monday, month end
    await page.reload();
    await expect.poll(() => planTasks(page).then(a => a.length), {timeout: 15_000}).toBe(3);
    const first = await planTasks(page);
    expect(first.map(s => s.split('|')[0])).toEqual(['day', 'month', 'week']);
    expect(first.find(s => s.startsWith('month'))).toContain('2026-11-30');

    await page.goto('/'); await page.locator('.home-today-list').click();
    await expect(page.locator('.today-tasks-view')).toContainText('مقرر اليوم 10');
    await expect(page.locator('.today-tasks-view')).toContainText('مراجعة الشهر');

    await context.setOffline(true);
    await page.goBack().catch(() => {});
    await page.goForward().catch(() => {});
    await page.locator('body').waitFor();
    expect(await planTasks(page)).toEqual(first);
    await context.setOffline(false);

    for (let i = 0; i < 2; i += 1) { await page.reload(); await page.waitForTimeout(1500); expect(await planTasks(page)).toEqual(first); }
  });
});
