import {expect, test, type Page} from '@playwright/test';

// زر الرجوع في الهاتف (يُحاكى برجوع المتصفح عبر popstate، وهو المسار نفسه الذي يستعمله مستمع زر أندرويد في المنطق المشترك):
// يجب أن يعيد إلى الشاشة التي جاء منها المستخدم فعلًا، وليس إلى المصحف دائمًا.
const back = async (page: Page) => { await page.goBack(); await page.waitForTimeout(250); };
const tab = (page: Page, id: string) => page.locator(`.quran-section-grid button[data-quran-tab="${id}"]`);

test.describe('hifz hardware back navigation', () => {
  test.use({viewport: {width: 360, height: 780}});

  test('back inside the hifz mushaf closes the top layer first, then leaves to the screen it came from', async ({page}) => {
    await page.goto('/');
    await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
    await tab(page, 'tafsir').click();
    await tab(page, 'hifz').click();
    await expect(page.locator('.hf-entry')).toBeVisible({timeout: 15_000});

    // شاشة فرعية → الدخول
    await page.locator('.hf-choice', {hasText: 'حفظ'}).first().click();
    await expect(page.locator('.hf-fields')).toBeVisible();
    await back(page);
    await expect(page.locator('.hf-fields')).toHaveCount(0);
    await expect(page.locator('.hf-entry')).toBeVisible();

    // الجلسة → نافذة الإعدادات تُغلق أولًا، ثم الجلسة، دون مغادرة مصحف الحفظ
    await page.locator('.hf-choice', {hasText: 'حفظ'}).first().click();
    await page.locator('.hf-ok', {hasText: 'موافق'}).click();
    await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
    const scrim = page.locator('.hf-scrim');
    if (await scrim.count()) await scrim.click();
    await page.locator('.hf-step', {hasText: 'الاستماع'}).click();
    await expect(page.locator('.hf-sheet')).toBeVisible();
    await back(page);
    await expect(page.locator('.hf-sheet')).toHaveCount(0);
    await expect(page.locator('.hf-reading')).toBeVisible();
    await back(page);
    await expect(page.locator('.hf-reading')).toHaveCount(0);
    await expect(page.locator('.hf-entry')).toBeVisible();

    // من شاشة الدخول: يعود إلى القسم السابق (التفسير) وليس إلى المصحف
    await back(page);
    await expect(page.locator('.hf-entry')).toHaveCount(0);
    await expect(tab(page, 'tafsir')).toHaveAttribute('aria-current', 'page');
    await back(page);
    await expect(tab(page, 'mushaf')).toHaveAttribute('aria-current', 'page');
    await back(page);
    await expect(page.locator('.quran-section-grid')).toHaveCount(0);
  });

  test('opened from the home screen, back returns to home', async ({page}) => {
    await page.goto('/');
    await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
    await tab(page, 'hifz').click();
    await expect(page.locator('.hf-entry')).toBeVisible({timeout: 15_000});
    await back(page);
    await expect(page.locator('.hf-entry')).toHaveCount(0);
    await expect(page.locator('.mobile-nav')).toBeVisible();
  });
});
