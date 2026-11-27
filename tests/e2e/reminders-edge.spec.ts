import {expect, test, type Page} from '@playwright/test';

// حالات حدّية للمنبهات: قائمة طويلة، ومنبّه انتهى موعده، ونصّ طويل جدًا.
const REMINDERS_KEY = 'rabbani-notif-reminders-v1';

async function openReminders(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /المنبهات/}).first().click();
  await page.locator('.notif-add-btn').waitFor({timeout: 10000});
}

async function addReminder(page: Page, title: string, time: string) {
  await page.locator('.notif-add-btn').click();
  await page.getByLabel('العنوان').fill(title);
  await page.getByLabel('الوقت').fill(time);
  await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
  await page.waitForTimeout(350);
}

async function stored(page: Page): Promise<Array<{title?: string; scheduled_at?: string}>> {
  return page.evaluate(key => {
    try {
      const rows = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }, REMINDERS_KEY);
}

test.describe('منبهات: حالات حدّية', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('twelve reminders stay usable and do not push the page sideways', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    for (let i = 1; i <= 12; i += 1) {
      await addReminder(page, `منبه متكرر ${i}`, `0${i % 10}:${String(10 + i).slice(-2)}`);
    }
    const rows = await stored(page);
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const overflow = await page.evaluate(() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth}));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
    // القائمة ما زالت قابلة للاستخدام: زر التعديل موجود لكل منبه ظاهر
    await expect(page.locator('.notif-reminder-card').first().locator('button[aria-label^="تعديل"]')).toBeVisible();
  });

  test('a one-off reminder whose time has passed is shown as past, not dropped', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    // 00:05 اليوم: وقت مضى في كل الأحوال بعد منتصف الليل بدقائق
    await addReminder(page, 'منبه انتهى موعده', '00:05');
    const rows = await stored(page);
    expect(rows.some(r => String(r.title).includes('منبه انتهى موعده'))).toBe(true);
    const card = page.locator('.notif-reminder-card').filter({hasText: 'منبه انتهى موعده'});
    await expect(card).toBeVisible();
    // التطبيق يشرح حالته بدل أن يخفيها (السلوك المتفق عليه: يبقى كما هو)
    await expect(card).toContainText('انتهى موعده');
    await expect(card).not.toContainText('اليوم ·');
  });
});
