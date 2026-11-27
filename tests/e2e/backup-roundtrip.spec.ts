import {expect, test, type Page} from '@playwright/test';
import {readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// سيناريو مستخدم حقيقي: منبه -> تصدير نسخة -> حذف البيانات -> استيراد -> كل شيء يعود.
// ونسخة تالفة أو من إصدار آخر يجب أن تُرفض دون أن تمسّ البيانات القائمة.

const REMINDERS_KEY = 'rabbani-notif-reminders-v1';
const PREFS_KEY = 'rabbani-notif-prefs-v1';

async function openSettings(page: Page) {
  await page.getByRole('button', {name: 'الإعدادات', exact: true}).first().click();
  await page.getByRole('tab', {name: /المنبهات/}).first().waitFor({timeout: 10000});
  await page.getByRole('tab', {name: /المنبهات/}).first().click();
  await page.locator('.notif-add-btn').waitFor({timeout: 10000});
}

async function openGeneralTab(page: Page) {
  await page.getByRole('tab', {name: /^عام/}).first().click();
  await page.waitForTimeout(600);
}

async function reminderTitles(page: Page): Promise<string[]> {
  return page.evaluate(key => {
    try {
      const rows = JSON.parse(window.localStorage.getItem(key) || '[]');
      return Array.isArray(rows) ? rows.map((r: {title?: string}) => String(r.title ?? '')) : [];
    } catch {
      return [];
    }
  }, REMINDERS_KEY);
}

async function importBackup(page: Page, file: string) {
  const chooser = page.waitForEvent('filechooser', {timeout: 15000});
  await page.getByRole('button', {name: /استيراد نسخة احتياطية/}).first().click();
  const fc = await chooser;
  await fc.setFiles(file);
  await page.waitForTimeout(1800);
}

test.describe('نسخة احتياطية: تصدير واستيراد', () => {
  test.use({viewport: {width: 390, height: 844}, acceptDownloads: true});

  test('round trip restores the reminder, the preferences and the theme', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);

    // منبه واحد قبل التصدير
    await openSettings(page);
    await page.getByRole('button', {name: /منبه جديد/}).first().click();
    await page.getByLabel('العنوان').fill('منبه النسخة الاحتياطية');
    await page.getByLabel('الوقت').fill('05:45');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(900);
    expect(await reminderTitles(page)).toContain('منبه النسخة الاحتياطية');

    // تفضيلات ووضع ليلي قبل التصدير
    await page.evaluate(key => {
      const raw = JSON.parse(window.localStorage.getItem(key) || '{}');
      window.localStorage.setItem(key, JSON.stringify({...raw, global_enabled: false}));
      window.localStorage.setItem('rabbani-theme-v1', 'dark');
    }, PREFS_KEY);

    // تصدير
    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openSettings(page);
    await openGeneralTab(page);
    const download = await Promise.all([
      page.waitForEvent('download', {timeout: 20000}),
      page.getByRole('button', {name: /تصدير نسخة احتياطية/}).first().click(),
    ]).then(([dl]) => dl);
    const file = join(tmpdir(), `rabbani-backup-${Date.now()}.json`);
    await download.saveAs(file);
    const payload = JSON.parse(readFileSync(file, 'utf8')) as {storage?: Record<string, string>};
    const storedKeys = Object.keys(payload.storage ?? {});
    expect(storedKeys).toContain(REMINDERS_KEY);
    expect(storedKeys).toContain(PREFS_KEY);
    expect(storedKeys).toContain('rabbani-v1');
    expect(storedKeys).toContain('rabbani-theme-v1');

    // حذف البيانات المحلية ثم استيراد
    await page.getByRole('button', {name: /حذف البيانات المحلية/}).first().click();
    await page.waitForTimeout(400);
    const confirm = page.getByRole('button', {name: 'تأكيد الحذف النهائي'});
    if (await confirm.count()) {
      await confirm.click();
      await page.waitForTimeout(1200);
    }
    expect(await page.evaluate(key => window.localStorage.getItem(key), REMINDERS_KEY)).toBeNull();

    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openSettings(page);
    await openGeneralTab(page);
    await importBackup(page, file);

    expect(await reminderTitles(page)).toContain('منبه النسخة الاحتياطية');
    expect(await page.evaluate(key => JSON.parse(window.localStorage.getItem(key) || '{}').global_enabled, PREFS_KEY)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('dark');
    expect(errors).toEqual([]);
  });

  test('a corrupted backup file is refused and leaves the data alone', async ({page}) => {
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openSettings(page);
    await page.getByRole('button', {name: /منبه جديد/}).first().click();
    await page.getByLabel('العنوان').fill('منبه يبقى بعد الملف التالف');
    await page.getByLabel('الوقت').fill('06:10');
    await page.getByRole('button', {name: /إضافة المنبه/}).first().click();
    await page.waitForTimeout(900);

    const broken = join(tmpdir(), `rabbani-backup-broken-${Date.now()}.json`);
    writeFileSync(broken, '{"version": "1.0.0", "app": "rabbaniyun", "storage": {');
    await openGeneralTab(page);
    await importBackup(page, broken);

    const toast = page.locator('[role="status"], [role="alert"], .toast');
    await expect(toast.filter({hasText: /تعذر|غير صالح|لا يخص/}).first()).toBeVisible({timeout: 8000});
    expect(await reminderTitles(page)).toContain('منبه يبقى بعد الملف التالف');
  });
});
