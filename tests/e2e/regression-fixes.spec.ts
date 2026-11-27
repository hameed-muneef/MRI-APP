import {test, expect} from '@playwright/test';

// Regression checks for fixes made on the smart-coach branch. Browser (Chromium) only, not an Android device.

test.describe('settings tabs keep unsaved changes', () => {
  test.use({viewport: {width: 390, height: 844}});
  test('quiet-hours change survives switching to the adhan tab and back', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.home-dashboard')).toBeVisible();
    await page.locator('.home-next-card-reminders').click();
    const tab = (n: string) => page.locator('.settings-tabs button[role="tab"]', {hasText: n});
    await tab('الهدوء').click();
    const cb = page.locator('label', {hasText: 'ساعات الهدوء (لا'}).locator('input[type=checkbox]').first();
    const before = await cb.isChecked();
    await cb.click();
    await tab('الأذان').click();
    await expect(cb).toBeHidden();
    await tab('الهدوء').click();
    await expect(cb).toBeChecked({checked: !before});
  });
});

test.describe('notification panel position', () => {
  for (const width of [360, 390, 1280]) {
    test(`panel stays inside the viewport at ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 800});
      await page.goto('/');
      await expect(page.locator('.home-dashboard')).toBeVisible();
      await page.locator('.notif-bell').first().click();
      const box = await page.locator('.notif-panel').boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y).toBeGreaterThanOrEqual(0);
    });
  }
});

test.describe('wird delete asks first', () => {
  test.use({viewport: {width: 390, height: 844}});
  test('cancel keeps the wird, confirm removes it', async ({page}) => {
    await page.goto('/');
    await page.locator('.mobile-nav').getByRole('button', {name: 'المحاسبة'}).click();
    await page.getByRole('tab', {name: 'زكِّ نفسك'}).click();
    const cards = page.locator('.wird-card');
    await expect(cards.first()).toBeVisible();
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    const title = (await cards.first().locator('h3').innerText()).trim();
    await cards.first().getByRole('button', {name: `حذف ${title}`}).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    expect(await cards.count()).toBe(n);
    await page.getByRole('button', {name: 'إلغاء'}).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(await cards.count()).toBe(n);
    await cards.first().getByRole('button', {name: `حذف ${title}`}).click();
    await page.getByRole('button', {name: 'تأكيد الحذف'}).click();
    await expect(cards).toHaveCount(n - 1);
  });
});
