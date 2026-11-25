import {test, expect, type Page} from '@playwright/test';

async function seed(page: Page, mutate: string) {
  await page.goto('/');
  await page.evaluate(async source => {
    const modulePath = '/src/app-state.ts';
    const {createSeed} = await import(/* @vite-ignore */ modulePath);
    const state = createSeed();
    // Test fixtures only, never evaluated by the application.
    new Function('state', source)(state);
    localStorage.setItem('rabbani-v1', JSON.stringify(state));
  }, mutate);
  await page.reload();
}

async function openRevision(page: Page) {
  await page.locator('.mobile-nav button').filter({hasText: 'القرآن'}).click();
  // Legacy passage review lives in the "previous plans and records" tile (the hifz screen is a full-screen overlay).
  await page.locator('[data-quran-tab="legacy"]').click();
}

test.describe('review and midnight regressions', () => {
  test.use({viewport: {width: 400, height: 850}, timezoneId: 'Africa/Cairo'});

  test('reviewing the second row updates only the second passage', async ({page}) => {
    await seed(page, `state.quran.passages = ['first','second'].map((id,index) => ({
      id, planId:'plan', contentType:'quran', surah:1, ayahStart:index+1, ayahEnd:index+1,
      state:'learning', ease:2.5, intervalDays:0, reviewCount:0, lapses:0,
      dueDate:'2026-01-01', createdAt:'2026-01-01T00:00:00Z', updatedAt:'2026-01-01T00:00:00Z'
    }));`);
    await openRevision(page);
    await expect(page.locator('.quran-passage-list li')).toHaveCount(2);
    await page.locator('.quran-passage-list li').nth(1).locator('.rev-btn-success').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('rabbani-v1')!).quran.passages.map((passage: {reviewCount: number}) => passage.reviewCount))).toEqual([0, 1]);
    await expect(page.locator('.quran-passage-list li')).toHaveCount(1);
  });

  test('mastered passages appear in upcoming, become due, and produce review notifications', async ({page}) => {
    await page.clock.install({time: new Date('2026-11-23T10:00:00+02:00')});
    await seed(page, `state.quran.passages = [{id:'mastered', planId:'plan', contentType:'quran',
      surah:1, ayahStart:1, ayahEnd:3, state:'mastered', ease:2.5, intervalDays:30,
      reviewCount:5, lapses:0, dueDate:'2026-11-24', createdAt:'', updatedAt:''}];`);
    await openRevision(page);
    await expect(page.locator('.quran-mini-list')).toContainText('2026-11-24');
    await page.clock.fastForward(24 * 60 * 60 * 1000);
    await page.reload();
    await openRevision(page);
    await expect(page.locator('.quran-passage-list li')).toHaveCount(1);
    const reviewCount = await page.evaluate(async () => {
      const enginePath = '/src/notifications/engine.ts';
      const typesPath = '/src/notifications/types.ts';
      const {pickDueItems} = await import(/* @vite-ignore */ enginePath);
      const {DEFAULT_NOTIFICATION_PREFERENCE} = await import(/* @vite-ignore */ typesPath);
      const state = JSON.parse(localStorage.getItem('rabbani-v1')!);
      return pickDueItems([], null, DEFAULT_NOTIFICATION_PREFERENCE, new Set(), new Date(), state.quran.passages).filter((item: {kind: string}) => item.kind === 'review').length;
    });
    expect(reviewCount).toBe(1);
  });

  test('midnight edits use the new daily key and survive reload', async ({page}) => {
    await page.clock.install({time: new Date('2026-11-23T23:59:00+02:00')});
    await seed(page, `state.wirds[0].count=30; state.wirds[0].periodKey='2026-11-23';`);
    await page.locator('.wide-card').filter({hasText:'حاسب نفسك'}).click();
    await page.getByRole('tab', {name:'زكِّ نفسك'}).click();
    await expect(page.locator('.count-row strong').first()).toHaveText('٣٠');
    await page.clock.fastForward(120000);
    await expect(page.locator('.count-row strong').first()).toHaveText('٠');
    await page.locator('.counter-actions button').first().click();
    await expect(page.locator('.count-row strong').first()).toHaveText('١');
    await page.reload();
    await page.locator('.wide-card').filter({hasText:'حاسب نفسك'}).click();
    await page.getByRole('tab', {name:'زكِّ نفسك'}).click();
    await expect(page.locator('.count-row strong').first()).toHaveText('١');
    await page.screenshot({path:'test-results/dhikr-midnight-fixed.png'});
  });
});
