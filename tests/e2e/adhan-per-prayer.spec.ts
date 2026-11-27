import {expect, test, type Page} from '@playwright/test';

// سيناريو تخصيص صلاة: إيقاف أذان الفجر، الحفظ بزر الصلاة السريع، ثم التأكد أنه يبقى بعد إعادة التحميل.
async function openAdhan(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /الأذان/}).first().click();
  await page.locator('.notif-prayer-toggle').first().waitFor({timeout: 10000});
}

test.describe('تخصيص الأذان لكل صلاة', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('turning a prayer off, saving, and reloading keeps it off', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openAdhan(page);

    const fajr = page.locator('.notif-prayer-card').first();
    const toggle = fajr.locator('input[type=checkbox]');
    const before = await toggle.isChecked();
    await fajr.locator('.notif-prayer-toggle').click();
    await page.waitForTimeout(700);
    expect(await toggle.isChecked()).toBe(!before);

    const quickSave = page.locator('.notif-prayer-quick-save').first();
    await expect(quickSave).toBeVisible();
    await quickSave.click();
    await page.waitForTimeout(1500);

    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openAdhan(page);
    expect(await page.locator('.notif-prayer-card').first().locator('input[type=checkbox]').isChecked()).toBe(!before);
    expect(errors).toEqual([]);
  });

  test('an unsaved prayer change is not silently lost when switching tabs', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openAdhan(page);

    const fajr = page.locator('.notif-prayer-card').first();
    const before = await fajr.locator('input[type=checkbox]').isChecked();
    await fajr.locator('.notif-prayer-toggle').click();
    await page.waitForTimeout(600);
    await page.getByRole('tab', {name: /^عام/}).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('tab', {name: /الأذان/}).first().click();
    await page.waitForTimeout(900);
    // التغيير غير المحفوظ يبقى معروضًا مع زر الحفظ السريع
    expect(await page.locator('.notif-prayer-card').first().locator('input[type=checkbox]').isChecked()).toBe(!before);
    await expect(page.locator('.notif-prayer-quick-save').first()).toBeVisible();
  });
});
