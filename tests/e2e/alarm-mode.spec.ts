import {expect, test, type Page} from '@playwright/test';

// نمط منبه: مفتاح لكل تذكير، يُحفظ ويُعرض، والافتراضي مغلق. (متصفح، لا هاتف.)
const REMINDERS_KEY = 'rabbani-notif-reminders-v1';

async function openReminders(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().click();
  await page.locator('.notif-add-btn').waitFor({timeout: 10000});
}

async function stored(page: Page): Promise<Array<{title?: string; alarm_mode?: boolean}>> {
  return page.evaluate(key => JSON.parse(window.localStorage.getItem(key) || '[]'), REMINDERS_KEY);
}

test.describe('نمط منبه للتذكيرات', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('off by default, saved when on, shown on the row, and switchable off again', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);

    await page.locator('.notif-add-btn').click();
    await page.getByLabel('العنوان').fill('تذكير عادي');
    const box = page.getByLabel(/نمط منبه/);
    await expect(box).not.toBeChecked();
    await page.getByLabel('الوقت').fill('09:10');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(350);

    await page.locator('.notif-add-btn').click();
    await page.getByLabel('العنوان').fill('تذكير بنمط منبه');
    await page.getByLabel(/نمط منبه/).check();
    await page.getByLabel('الوقت').fill('09:20');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(350);

    const rows = await stored(page);
    expect(rows.find(r => r.title === 'تذكير عادي')?.alarm_mode).toBeFalsy();
    expect(rows.find(r => r.title === 'تذكير بنمط منبه')?.alarm_mode).toBe(true);
    await expect(page.locator('.notif-reminder-card').filter({hasText: 'تذكير بنمط منبه'})).toContainText('نمط منبه');
    await expect(page.locator('.notif-reminder-card').filter({hasText: 'تذكير عادي'})).not.toContainText('نمط منبه');

    // بعد إعادة التحميل يبقى المفتاح محفوظًا (تُطبَّع القائمة عند القراءة)
    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    await page.locator('.notif-reminder-card').filter({hasText: 'تذكير بنمط منبه'}).locator('button[aria-label^="تعديل"]').click();
    await expect(page.getByLabel(/نمط منبه/)).toBeChecked();
    await page.getByLabel(/نمط منبه/).uncheck();
    await page.getByRole('button', {name: /حفظ/}).first().click();
    await page.waitForTimeout(350);
    expect((await stored(page)).find(r => r.title === 'تذكير بنمط منبه')?.alarm_mode).toBeFalsy();
  });
});
