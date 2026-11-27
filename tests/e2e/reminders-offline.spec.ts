import {expect, test, type Page} from '@playwright/test';

// سيناريو مستخدم بلا إنترنت: ينشئ منبّهًا، يعدّله، يحذفه، ويبقى كل ذلك بعد إعادة التحميل.
const REMINDERS_KEY = 'rabbani-notif-reminders-v1';

async function openReminders(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /المنبهات/}).first().click();
  await page.locator('.notif-add-btn').waitFor({timeout: 10000});
}

async function titles(page: Page): Promise<string[]> {
  return page.evaluate(key => {
    try {
      const rows = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(rows) ? rows.map((r: {title?: string}) => String(r.title ?? '')) : [];
    } catch {
      return [];
    }
  }, REMINDERS_KEY);
}

test.describe('المنبهات بلا اتصال', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('create, edit and delete all work offline and survive a reload', async ({page, context}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);

    await page.locator('.notif-add-btn').click();
    await page.getByLabel('العنوان').fill('منبه بلا اتصال');
    await page.getByLabel('الوقت').fill('07:15');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(800);
    expect(await titles(page)).toContain('منبه بلا اتصال');

    await context.setOffline(true);
    await page.locator('.notif-reminder-card').filter({hasText: 'منبه بلا اتصال'}).locator('button[aria-label^="تعديل"]').click();
    await page.getByLabel('العنوان').fill('منبه بلا اتصال — معدّل');
    await page.getByRole('button', {name: /حفظ|تحديث/}).first().click();
    await page.waitForTimeout(900);
    expect(await titles(page)).toContain('منبه بلا اتصال — معدّل');

    await page.locator('.notif-reminder-card').filter({hasText: 'منبه بلا اتصال'}).locator('button[aria-label^="حذف"]').click();
    await page.waitForTimeout(400);
    await page.getByRole('button', {name: 'تأكيد الحذف'}).first().click();
    await page.waitForTimeout(900);
    expect(await titles(page)).not.toContain('منبه بلا اتصال — معدّل');

    await context.setOffline(false);
    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    expect(await titles(page)).not.toContain('منبه بلا اتصال — معدّل');
  });

  test('a very long title is accepted and shown without breaking the card', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    const long = 'منبه '.repeat(30).trim().slice(0, 180);
    await page.locator('.notif-add-btn').click();
    await page.getByLabel('العنوان').fill(long);
    await page.getByLabel('الوقت').fill('08:20');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(900);
    expect((await titles(page)).some(t => t.startsWith('منبه منبه'))).toBe(true);
    const overflow = await page.evaluate(() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth}));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
  });
});
