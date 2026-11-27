import {expect, test, type Page} from '@playwright/test';

// سيناريو الورد اليومي: إضافة الورد المقترح، إنجاز نشاط، ثم التأكد أنه يبقى بعد إعادة التحميل.
/**
 * يفتح «وردي اليومي» وينتظر حالة الصفحة لا مدة ثابتة: زرّ الإضافة في أول زيارة،
 * وعلامة «منجز اليوم» بعد إعادة التحميل حين يكون الورد قد أُضيف وأُنجز.
 */
async function openWird(page: Page, state: 'empty' | 'done') {
  await page.locator('.mobile-nav button').filter({hasText: 'القرآن'}).first().click();
  // تبويب الورد يظهر مع القسم بعد التحميل؛ ننتظره ثم نضغطه من داخل الصفحة،
  // لأن فحص الجاهزية (scroll/stability) يتعلّق حين يعمل أكثر من متصفح في وقت واحد.
  const wirdEntry = page.locator('button[data-quran-tab="routine"]').first();
  await wirdEntry.waitFor({state: 'visible', timeout: 20000});
  await wirdEntry.evaluate((element: HTMLElement) => element.click());
  if (state === 'empty') {
    await page.getByRole('button', {name: /أضف الورد المقترح/}).first().waitFor({timeout: 15000});
  } else {
    await page.getByText('منجز اليوم').first().waitFor({timeout: 20000});
  }
}

test.describe('ورد اليوم', () => {
  test.use({viewport: {width: 390, height: 844}});

  test('adding the suggested wird and marking a part done survives a reload', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openWird(page, 'empty');

    await page.getByRole('button', {name: /أضف الورد المقترح/}).first().click({force: true});
    const done = page.getByRole('button', {name: 'إنجاز'}).first();
    await expect(done).toBeVisible({timeout: 15000});
    await done.click();
    await page.waitForTimeout(1000);

    await page.reload();
    await page.locator('.home-dashboard').waitFor();
    await page.waitForTimeout(900);
    await openWird(page, 'done');
    await expect(page.getByText('منجز اليوم').first()).toBeVisible({timeout: 5000});
    expect(errors).toEqual([]);
  });
});
