import {expect, test, type Page} from '@playwright/test';

// حدود الجدولة: تغيّر المنطقة الزمنية، وساعات الهدوء (حفظها، وبقاء حدودها).
const REMINDERS_KEY = 'rabbani-notif-reminders-v1';
const PREFS_KEY = 'rabbani-notif-prefs-v1';

async function openReminders(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /المنبهات/}).first().click();
  await page.locator('.notif-add-btn').waitFor({timeout: 10000});
}

async function openQuiet(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /الهدوء/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /الهدوء/}).first().click();
  await page.locator('.notif-general-panel').waitFor({timeout: 10000});
}

test.describe('حدود الجدولة', () => {
  test.use({viewport: {width: 390, height: 844}, timezoneId: 'Asia/Aden'});

  test('reminders survive a device time-zone change', async ({page, browser}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    await page.locator('.notif-add-btn').click();
    await page.getByLabel('العنوان').fill('منبه عبر المناطق الزمنية');
    await page.getByLabel('الوقت').fill('09:30');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(800);
    const storage = await page.evaluate(() => JSON.stringify(window.localStorage));

    // جهاز آخر بمنطقة زمنية مختلفة، بنفس التخزين
    const other = await browser.newContext({viewport: {width: 390, height: 844}, timezoneId: 'America/New_York'});
    await other.addInitScript(data => {
      const entries = JSON.parse(data) as Record<string, string>;
      for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
    }, storage);
    const page2 = await other.newPage();
    const errors: string[] = [];
    page2.on('pageerror', err => errors.push(err.message));
    await page2.goto('/');
    await page2.locator('.home-dashboard').waitFor();
    await page2.waitForTimeout(1200);
    await openReminders(page2);
    await expect(page2.locator('.notif-reminder-card').filter({hasText: 'منبه عبر المناطق الزمنية'})).toBeVisible();
    const rows = await page2.evaluate(key => JSON.parse(window.localStorage.getItem(key) || '[]') as Array<{scheduled_at?: string}>, REMINDERS_KEY);
    expect(rows.some(r => typeof r.scheduled_at === 'string' && r.scheduled_at.length > 0)).toBe(true);
    expect(errors).toEqual([]);
    await other.close();
  });

  test('quiet hours save, persist, and show their boundaries', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openQuiet(page);

    // تشغيل ساعات الهدوء وضبط حدودها
    const quietToggle = page.locator('.notif-switch', {hasText: 'ساعات الهدوء'}).locator('input[type=checkbox]');
    if (!(await quietToggle.isChecked())) await quietToggle.click();
    await page.waitForTimeout(500);
    const from = page.locator('input[type=time]').first();
    const to = page.locator('input[type=time]').last();
    await from.fill('22:00');
    await to.fill('06:00');
    await page.getByRole('button', {name: /حفظ التغييرات/}).first().click();
    await page.waitForTimeout(1200);

    const saved = await page.evaluate(key => {
      const prefs = JSON.parse(window.localStorage.getItem(key) || '{}') as {quiet_hours?: {enabled?: boolean; start?: string; end?: string}};
      return prefs.quiet_hours ?? null;
    }, PREFS_KEY);
    expect(saved).not.toBeNull();
    expect(saved?.enabled).toBe(true);
    expect(saved?.start).toBe('22:00');
    expect(saved?.end).toBe('06:00');

    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openQuiet(page);
    await expect(page.locator('input[type=time]').first()).toHaveValue('22:00');
    await expect(page.locator('input[type=time]').last()).toHaveValue('06:00');
  });
});

test.describe('تغيّر التاريخ', () => {
  test.use({viewport: {width: 390, height: 844}, timezoneId: 'Asia/Aden'});

  test('a daily reminder re-arms for the new date after midnight', async ({page}) => {
    await page.clock.install({time: new Date('2026-11-27T23:50:00+03:00')});
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    await page.locator('.notif-add-btn').click();
    await page.getByLabel('العنوان').fill('منبه يومي عند منتصف الليل');
    await page.getByLabel('الوقت').fill('23:55');
    await page.locator('select').filter({has: page.locator('option[value="daily"]')}).selectOption('daily');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(600);
    const card = page.locator('.notif-reminder-card').filter({hasText: 'منبه يومي عند منتصف الليل'});
    await expect(card).toContainText('اليوم · بعد 5 د');

    // تجاوز منتصف الليل: التاريخ يتغيّر، والمنبه اليومي يُعاد ضبطه لليوم الجديد نفسه
    await page.clock.fastForward('00:10:00');
    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    const after = page.locator('.notif-reminder-card').filter({hasText: 'منبه يومي عند منتصف الليل'});
    await expect(after).toContainText('اليوم · بعد 23 س');
    await expect(after).toContainText('١١:٥٥ م');
    await expect(page.locator('.notif-reminder-card').filter({hasText: 'منبه يومي عند منتصف الليل'})).toHaveCount(1);
  });
});
