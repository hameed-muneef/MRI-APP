import {expect, test, type Page} from '@playwright/test';

// سيناريو الورد اليومي: إضافة الورد المقترح، إنجاز نشاط، ثم التأكد أنه يبقى بعد إعادة التحميل.
async function openWird(page: Page) {
  await page.locator('.mobile-nav button').filter({hasText: 'القرآن'}).first().click();
  await page.waitForTimeout(1400);
  await page.getByRole('button', {name: /وردي اليومي/}).first().click({force: true});
  await page.waitForTimeout(1500);
}

test.describe('ورد اليوم', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('adding the suggested wird and marking a part done survives a reload', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openWird(page);

    await page.getByRole('button', {name: /أضف الورد المقترح/}).first().click({force: true});
    await page.waitForTimeout(1400);
    const done = page.getByRole('button', {name: 'إنجاز'}).first();
    await expect(done).toBeVisible();
    await done.click();
    await page.waitForTimeout(1000);

    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openWird(page);
    await expect(page.getByText('منجز اليوم').first()).toBeVisible({timeout: 8000});
    expect(errors).toEqual([]);
  });
});
