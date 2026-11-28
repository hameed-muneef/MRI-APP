import {expect, test, type Page} from '@playwright/test';

// سيناريو هدف جديد: تعبئة الهدف والنية والتاريخ، ظهوره في قائمة الأهداف، بقاؤه بعد التحميل، ثم ظهوره في السجل.
async function openGoals(page: Page) {
  await page.locator('.mobile-nav button').filter({hasText: 'حياتي'}).first().click();
  await page.waitForTimeout(1300);
  await page.getByRole('button', {name: /المؤمن القوي/}).first().click({force: true});
  await page.waitForTimeout(1400);
}

test.describe('الأهداف', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('a new goal with a date is listed, survives a reload and appears in the history', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openGoals(page);

    await page.getByRole('button', {name: /إضافة الهدف/}).first().click({force: true});
    await page.waitForTimeout(700);
    await page.locator('input[placeholder*="قراءة كتاب"]').fill('هدف اختبار آلي');
    await page.locator('textarea').first().fill('نية اختبار آلي');
    await page.locator('input[type=date]').first().fill('2027-03-01');
    await page.getByRole('button', {name: /إضافة الهدف/}).last().click({force: true});
    await page.waitForTimeout(1500);
    await expect(page.getByText('هدف اختبار آلي').first()).toBeVisible();

    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openGoals(page);
    await expect(page.getByText('هدف اختبار آلي').first()).toBeVisible({timeout: 8000});
    await expect(page.getByRole('tab', {name: /خطوات يومية/})).toBeVisible();
    expect(errors).toEqual([]);
  });
});
