import {expect, test, type Page} from '@playwright/test';

// إنجاز مقرر الخطة من مركز المهام: تأكيد، تقدّم الخطة، سجل الإنجاز. متصفح Chromium فقط.
const PLAN_KEY = 'rabbani-bilquran-plan-v1';

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
const plan = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), PLAN_KEY);

test.describe('manual completion of a plan day', () => {
  test.use({viewport: {width: 390, height: 800}});
  test('asks first, cancel changes nothing, confirm advances the plan and logs it', async ({page}) => {
    await activate(page);
    await page.goto('/');
    await page.locator('.home-today-list').click();
    await expect(page.locator('.today-tasks-view')).toContainText('مقرر اليوم');
    const before = await plan(page);
    const card = page.locator('.today-task-card, li, article').filter({hasText: 'مقرر اليوم'}).first();
    await card.getByRole('button', {name: 'إنجاز', exact: true}).click();
    await expect(page.getByRole('alertdialog', {name: 'تأكيد إنجاز المقرر'})).toBeVisible();
    await page.getByRole('button', {name: 'إلغاء'}).click();
    expect((await plan(page)).currentIndex).toBe(before.currentIndex);

    await card.getByRole('button', {name: 'إنجاز', exact: true}).click();
    await page.getByRole('button', {name: 'نعم، اعتبره منجزًا'}).click();
    await expect(page.getByText(/لم تُجدول مراجعة/).first()).toBeVisible();
    await expect.poll(async () => (await plan(page)).currentIndex).toBe(before.currentIndex + 1);
    expect((await plan(page)).completedIndices).toContain(before.currentIndex);
    const log = await page.evaluate(() => (JSON.parse(localStorage.getItem('rabbani-v1') || '{}').achievementLog || []).map((e: {kind: string}) => e.kind));
    expect(log).toContain('bilquran_step');
  });
});

test.describe('goal step completion can be undone', () => {
  test.use({viewport: {width: 390, height: 800}});
  test('إنجاز on a goal step then تراجع restores it', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.home-dashboard')).toBeVisible();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rabbani-v1') || '{}');
      s.goals = [{id: 'g-e2e', title: 'هدف اختباري', benefit: 'x', period: 'daily', steps: [{id: 's-e2e', title: 'خطوة اختبارية', period: 'daily', done: {}}]}];
      localStorage.setItem('rabbani-v1', JSON.stringify(s));
    });
    await page.reload();
    await page.locator('.mobile-nav').getByRole('button', {name: 'حياتي'}).click();
    await page.getByRole('button', {name: 'مهام اليوم'}).first().click();
    const row = page.locator('.today-tasks-view').locator('li, article, div').filter({hasText: 'خطوة اختبارية'}).filter({has: page.getByRole('button', {name: 'إنجاز', exact: true})}).last();
    await row.getByRole('button', {name: 'إنجاز', exact: true}).click();
    await expect(page.getByText(/أُنجزت «هدف اختباري»/)).toBeVisible();
    await page.getByRole('button', {name: 'تراجع'}).click();
    const done = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('rabbani-v1') || '{}').goals?.[0]?.steps?.[0]?.done ?? {}));
    expect(done).toBe('{}');
  });
});
