import {expect, test, type Page} from '@playwright/test';

// إنجاز مقرر الخطة وخطوات الأهداف من مركز المهام. متصفح Chromium فقط، وليس جهاز أندرويد.
const PLAN_KEY = 'rabbani-bilquran-plan-v1';
const confirmDialog = (page: Page) => page.getByRole('alertdialog', {name: 'تأكيد إنجاز المقرر'});

async function activatePlan(page: Page) {
  await page.goto('/');
  await page.locator('.mobile-nav button', {hasText: 'القرآن'}).click();
  await page.locator('.quran-section-grid button[data-quran-tab="hifz"]').click();
  await expect(page.locator('.hf-entry')).toBeVisible({timeout: 15_000});
  await page.locator('.hf-plan-launch').click();
  await page.locator('.hf-plan-card button', {hasText: 'معاينة الجدول'}).first().click();
  await page.locator('.hf-plan-preview-actions .hf-ok').click();
  await expect(page.locator('.hf-reading')).toBeVisible({timeout: 15_000});
}
const plan = (page: Page) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), PLAN_KEY);
const state = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rabbani-v1') || '{}'));

async function openTasks(page: Page) {
  await page.locator('.mobile-nav').getByRole('button', {name: 'حياتي'}).click();
  await page.getByRole('button', {name: 'مهام اليوم'}).first().click();
}
const planDayButton = (page: Page) =>
  page.locator('.today-tasks-view').locator('li, article, div')
    .filter({hasText: /مقرر اليوم \d+/}).filter({has: page.getByRole('button', {name: 'إنجاز', exact: true})}).last()
    .getByRole('button', {name: 'إنجاز', exact: true});

test.describe('manual completion of a plan day', () => {
  test.use({viewport: {width: 390, height: 800}});

  test('confirm is modal-like: focus, Escape, cancel returns focus; confirm advances once, task leaves, survives reload', async ({page}) => {
    await activatePlan(page);
    await page.goto('/');
    await page.locator('.home-today-list').click();
    await expect(page.locator('.today-tasks-view')).toContainText(/مقرر اليوم \d+/);
    const before = await plan(page);

    // Escape cancels and returns focus to the button
    const btn = planDayButton(page);
    await btn.focus();
    await btn.click();
    await expect(confirmDialog(page)).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByRole('button', {name: 'نعم، اعتبره منجزًا'})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmDialog(page)).toHaveCount(0);
    await expect(btn).toBeFocused();
    expect((await plan(page)).currentIndex).toBe(before.currentIndex);

    // cancel button, then confirm
    await btn.click();
    await page.getByRole('button', {name: 'إلغاء'}).click();
    await expect(confirmDialog(page)).toHaveCount(0);
    expect((await plan(page)).currentIndex).toBe(before.currentIndex);

    await btn.click();
    await page.getByRole('button', {name: 'نعم، اعتبره منجزًا'}).click();
    await expect(page.getByText(/وتقدّمت الخطة/).first()).toBeVisible();
    await expect.poll(async () => (await plan(page)).currentIndex).toBe(before.currentIndex + 1);
    expect((await plan(page)).completedIndices.filter((i: number) => i === before.currentIndex)).toHaveLength(1);
    const kinds = (await state(page)).achievementLog.map((e: {kind: string; refId: string}) => `${e.kind}:${e.refId}`);
    expect(kinds.filter((k: string) => k === `bilquran_step:${before.planId}#${before.currentIndex}`)).toHaveLength(1);
    // the finished day's task is gone from the list
    await expect.poll(async () => (await state(page)).tasks.filter((t: {plan?: {kind: string}}) => t.plan?.kind === 'day').length).toBe(0);

    await page.reload();
    await page.waitForTimeout(1000);
    expect((await plan(page)).currentIndex).toBe(before.currentIndex + 1);
    const logAfter = (await state(page)).achievementLog.filter((e: {kind: string}) => e.kind === 'bilquran_step');
    expect(logAfter).toHaveLength(1);
  });

  test('a stale task (plan already moved on) changes nothing and says so', async ({page}) => {
    await activatePlan(page);
    await page.goto('/');
    await page.locator('.home-today-list').click();
    await expect(page.locator('.today-tasks-view')).toContainText(/مقرر اليوم \d+/);
    const before = await plan(page);
    const btn = planDayButton(page);
    await btn.click();
    // plan moves on behind the dialog (for example from another tab)
    await page.evaluate(k => {const p = JSON.parse(localStorage.getItem(k)!); p.currentIndex += 1; localStorage.setItem(k, JSON.stringify(p));}, PLAN_KEY);
    await page.getByRole('button', {name: 'نعم، اعتبره منجزًا'}).click();
    await expect(page.getByText(/لم يتغيّر شيء/).first()).toBeVisible();
    expect((await plan(page)).currentIndex).toBe(before.currentIndex + 1);
    expect((await plan(page)).completedIndices).not.toContain(before.currentIndex);
    const log = (await state(page)).achievementLog ?? [];
    expect(log.filter((e: {kind: string}) => e.kind === 'bilquran_step')).toHaveLength(0);
  });
});

test.describe('stale undo', () => {
  test.use({viewport: {width: 390, height: 800}});
  test('opening the plan-day confirm clears an older undo banner', async ({page}) => {
    await activatePlan(page);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rabbani-v1') || '{}');
      s.goals = [{id: 'g-e2e', title: 'هدف اختباري', benefit: 'x', period: 'daily', steps: [{id: 's-e2e', title: 'خطوة اختبارية', period: 'daily', done: {}}]}];
      localStorage.setItem('rabbani-v1', JSON.stringify(s));
    });
    await page.reload();
    await openTasks(page);
    const goalRow = page.locator('.today-tasks-view').locator('li, article, div').filter({hasText: 'خطوة اختبارية'}).filter({has: page.getByRole('button', {name: 'إنجاز', exact: true})}).last();
    await goalRow.getByRole('button', {name: 'إنجاز', exact: true}).click();
    await expect(page.getByRole('button', {name: 'تراجع'})).toBeVisible();
    await planDayButton(page).click();
    await expect(confirmDialog(page)).toBeVisible();
    await expect(page.getByRole('button', {name: 'تراجع'})).toHaveCount(0);
  });
});

test.describe('hifz task completion', () => {
  test.use({viewport: {width: 390, height: 800}});
  test('has its own copy, does not touch a plan, marks the task done', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('.home-dashboard')).toBeVisible();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rabbani-v1') || '{}');
      s.tasks = [{id: 'h-e2e', title: 'تسميع اختباري', period: 'daily', done: false, optional: true, hifz: {passageId: 'x', sessionId: 's', surah: 1, from: 1, to: 7}}];
      localStorage.setItem('rabbani-v1', JSON.stringify(s));
    });
    await page.reload();
    await openTasks(page);
    const row = page.locator('.today-tasks-view').locator('li, article, div').filter({hasText: 'تسميع اختباري'}).filter({has: page.getByRole('button', {name: 'إنجاز', exact: true})}).last();
    await row.getByRole('button', {name: 'إنجاز', exact: true}).click();
    await expect(confirmDialog(page)).toContainText('لن تتغيّر خطة الحفظ');
    await expect(confirmDialog(page)).not.toContainText('سيتقدّم مقرر الخطة');
    await page.getByRole('button', {name: 'نعم، اعتبره منجزًا'}).click();
    await expect(page.getByText(/لم تُسجَّل جلسة تسميع/).first()).toBeVisible();
    await expect.poll(async () => (await state(page)).tasks.find((t: {id: string}) => t.id === 'h-e2e').done).toBe(true);
    expect(await plan(page)).toBeNull();
  });
});

test.describe('goal step completion can be undone', () => {
  test.use({viewport: {width: 390, height: 800}});
  async function seedGoal(page: Page) {
    await page.goto('/');
    await expect(page.locator('.home-dashboard')).toBeVisible();
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('rabbani-v1') || '{}');
      s.goals = [{id: 'g-e2e', title: 'هدف اختباري', benefit: 'x', period: 'daily', steps: [{id: 's-e2e', title: 'خطوة اختبارية', period: 'daily', done: {}}]}];
      localStorage.setItem('rabbani-v1', JSON.stringify(s));
    });
    await page.reload();
    await openTasks(page);
  }
  const stepDone = (page: Page) => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('rabbani-v1') || '{}').goals?.[0]?.steps?.[0]?.done ?? {}));

  test('إنجاز then تراجع restores the step', async ({page}) => {
    await seedGoal(page);
    const row = page.locator('.today-tasks-view').locator('li, article, div').filter({hasText: 'خطوة اختبارية'}).filter({has: page.getByRole('button', {name: 'إنجاز', exact: true})}).last();
    await row.getByRole('button', {name: 'إنجاز', exact: true}).click();
    await expect(page.getByText(/أُنجزت «هدف اختباري»/)).toBeVisible();
    expect(await stepDone(page)).not.toBe('{}');
    await page.getByRole('button', {name: 'تراجع'}).click();
    expect(await stepDone(page)).toBe('{}');
  });
});
