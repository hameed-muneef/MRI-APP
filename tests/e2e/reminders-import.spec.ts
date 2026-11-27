import {expect, test, type Page} from '@playwright/test';

// استيراد تذكيرات من ملف: مراجعة قبل الإضافة، ونمط منبه أو تنبيه لكل صفّ أو للملف كله. Chromium فقط.
const REMINDERS_KEY = 'rabbani-notif-reminders-v1';

async function openReminders(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /المنبهات/}).first().click();
  await page.locator('.notif-add-btn').waitFor({timeout: 10000});
}

async function importFile(page: Page, name: string, body: string) {
  await page.locator('.notif-import-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(body, 'utf8'),
  });
}

const stored = (page: Page) =>
  page.evaluate((key: string) => JSON.parse(window.localStorage.getItem(key) || '[]') as Array<{title: string; alarm_mode?: boolean}>, REMINDERS_KEY);

test.describe('استيراد التذكيرات من ملف', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('review first, alarm for the whole file, one row overridden, then saved', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);

    await importFile(page, 'reminders.json', JSON.stringify([
      {title: 'ورد الصباح', time: '06:30'},
      {title: 'مراجعة الحفظ', time: '20:00'},
    ]));
    const sheet = page.locator('.notif-import');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.notif-import-row')).toHaveCount(2);
    await expect(sheet).toContainText('reminders.json');

    // النمط للملف كله: منبه
    await sheet.locator('.notif-import-mode select').selectOption('alarm');
    await expect(sheet.locator('.notif-import-toggle').first()).toHaveText('منبه');
    await expect(sheet.locator('.notif-import-toggle').nth(1)).toHaveText('منبه');

    // صفّ واحد يعود تنبيهًا عاديًا
    await sheet.locator('.notif-import-toggle').nth(1).click();
    await expect(sheet.locator('.notif-import-toggle').nth(1)).toHaveText('تنبيه');

    await sheet.locator('.notif-import-apply').click();
    await expect(page.locator('.notif-import')).toHaveCount(0);
    const rows = await stored(page);
    expect(rows.map(row => row.title)).toEqual(expect.arrayContaining(['ورد الصباح', 'مراجعة الحفظ']));
    expect(rows.find(row => row.title === 'ورد الصباح')?.alarm_mode).toBe(true);
    expect(rows.find(row => row.title === 'مراجعة الحفظ')?.alarm_mode).toBeUndefined();
    await expect(page.locator('.notif-reminder-card').filter({hasText: 'ورد الصباح'})).toBeVisible();
  });

  test('a broken file is refused in Arabic and adds nothing', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    await importFile(page, 'broken.json', '[{"title":"ناقص"');
    await expect(page.locator('.notif-import')).toHaveCount(0);
    await expect(page.locator('.notif-reminders')).toContainText('ملف التذكيرات غير صالح');
    expect((await stored(page)).length).toBe(0);
  });

  test('importing the same file twice marks every row as a duplicate', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    const body = JSON.stringify([{title: 'تذكير واحد', time: '09:15'}]);
    await importFile(page, 'one.json', body);
    await page.locator('.notif-import-apply').click();
    await expect(page.locator('.notif-reminder-card').filter({hasText: 'تذكير واحد'})).toBeVisible();

    await importFile(page, 'one.json', body);
    const sheet = page.locator('.notif-import');
    await expect(sheet).toContainText('مكرّر');
    await expect(sheet.locator('.notif-import-apply')).toBeDisabled();
    expect((await stored(page)).length).toBe(1);
  });

  test('a row the file marks as an alarm keeps it without touching the others', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openReminders(page);
    await importFile(page, 'mixed.json', JSON.stringify([
      {title: 'منبه الملف', time: '05:00', mode: 'alarm'},
      {title: 'تنبيه الملف', time: '21:00', mode: 'تنبيه'},
    ]));
    const sheet = page.locator('.notif-import');
    await expect(sheet.locator('.notif-import-toggle').first()).toHaveText('منبه');
    await expect(sheet.locator('.notif-import-toggle').nth(1)).toHaveText('تنبيه');
    await sheet.locator('.notif-import-apply').click();
    const rows = await stored(page);
    expect(rows.find(row => row.title === 'منبه الملف')?.alarm_mode).toBe(true);
    expect(rows.find(row => row.title === 'تنبيه الملف')?.alarm_mode).toBeUndefined();
  });
});
