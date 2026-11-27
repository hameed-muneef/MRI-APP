import {expect, test} from '@playwright/test';

// نمط منبه لمهمة مجدولة: يُحفظ مع الجدولة ويبقى بعد إعادة التحميل. متصفح Chromium فقط.
const state = (page: import('@playwright/test').Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rabbani-v1') || '{}'));

test.describe('نمط منبه للمهام', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('off by default, saved with the schedule, kept after reload', async ({page}) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('rabbani-v1')) {
        localStorage.setItem('rabbani-v1', JSON.stringify({tasks: [{id: 'alarm-t1', title: 'مهمة اختبار المنبه', period: 'daily', done: false, optional: true}]}));
      }
    });
    await page.goto('/');
    await page.locator('.home-today-list').click();
    const card = page.locator('.today-task-card').filter({hasText: 'مهمة اختبار المنبه'});
    await expect(card).toBeVisible();
    const box = card.getByLabel(/نمط منبه/);
    await expect(box).not.toBeChecked();
    await box.check();
    await card.getByRole('button', {name: 'تأكيد الجدولة'}).click();
    await expect.poll(async () => (await state(page)).taskSchedules?.['alarm-t1']?.alarmMode).toBe(true);
    await expect(card).toContainText('نمط منبه');

    await page.reload();
    await page.locator('.home-today-list').click();
    const again = page.locator('.today-task-card').filter({hasText: 'مهمة اختبار المنبه'});
    await expect(again.getByLabel(/نمط منبه/)).toBeChecked();

    await again.getByLabel(/نمط منبه/).uncheck();
    await expect.poll(async () => (await state(page)).taskSchedules?.['alarm-t1']?.alarmMode).toBeFalsy();
  });
});
