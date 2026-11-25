import {expect, test, type Page} from '@playwright/test';
// انحدار: الرجوع في اللحظة نفسها التي تظهر فيها طبقة القراءة (قبل تسجيل معالجها) كان يغادر الشاشة كلها.

// زر الرجوع في الهاتف (يُحاكى برجوع المتصفح عبر popstate، وهو المسار نفسه الذي يستعمله مستمع زر أندرويد في المنطق المشترك):
// يجب أن يعيد إلى الشاشة التي جاء منها المستخدم فعلًا، وليس إلى المصحف دائمًا.
const back = async (page: Page) => { await page.goBack(); await page.waitForTimeout(250); };
const tab = (page: Page, id: string) => page.locator(`.quran-section-grid button[data-quran-tab="${id}"]`);

test.describe('hifz back pressed in the instant the reading layer mounts', () => {
  test.use({viewport: {width: 360, height: 780}});
  test('back pressed on the same DOM mutation that mounts the reading layer closes that layer, not the screen', async ({page}) => {
    await page.goto('/');
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const k = Object.keys(localStorage).find(x => /rabbani-v1$/.test(x))!;
      const st = JSON.parse(localStorage.getItem(k)!);
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      st.tasks = [...(st.tasks || []), {id: 't-hifz', title: 'تسميع الإخلاص', period: 'daily', done: false, optional: false, scheduledDate: day, hifz: {passageId: 'p1', sessionId: 's1', surah: 112, from: 1, to: 4}}];
      localStorage.setItem(k, JSON.stringify(st));
    });
    await page.reload();
    await page.locator('.mobile-nav button', {hasText: 'حياتي'}).click();
    await page.locator('button', {hasText: 'مهام اليوم'}).first().click();
    await expect(page.getByText('مركز المهام').first()).toBeVisible();
    await page.evaluate(() => { new MutationObserver((_m, o) => { if (document.querySelector('.hf-reading')) { o.disconnect(); history.back(); } }).observe(document.body, {childList: true, subtree: true}); });
    await page.locator('button', {hasText: 'ابدأ التسميع'}).first().click();
    await page.waitForTimeout(800);
    await expect(page.locator('.hf-entry')).toBeVisible();
  });
});
