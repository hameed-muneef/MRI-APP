import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Africa/Cairo' });

const seed = () => {
  const d = '2026-11-27';
  const mk = (id: string, title: string, t: string) => ({ task: { id, title, period: 'daily', done: false, optional: false }, sch: { title, sourceLabel: 'يومي مع الله', initialDate: d, initialTime: t, confirmedDate: d, confirmedTime: t, notifyEnabled: true } });
  const rows = [mk('a', 'مهمة أ', '19:30'), mk('b', 'مهمة ب', '20:00'), mk('c', 'مهمة ج', '21:00'), mk('d', 'مهمة د', '22:00'), mk('e', 'مهمة بلا وقت', '')];
  const taskSchedules: Record<string, unknown> = {};
  for (const r of rows) if (r.sch.confirmedTime) taskSchedules[r.task.id] = r.sch;
  const st = JSON.parse(localStorage.getItem('rabbani-v1') || '{}');
  localStorage.setItem('rabbani-v1', JSON.stringify({ ...st, tasks: rows.map(r => r.task), taskSchedules }));
};

for (const theme of ['light', 'dark'] as const) {
  test(`next up: 3 nearest, live labels, re-sorts and pulls the next in (${theme})`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-27T19:00:00+02:00') });
    await page.addInitScript(t => localStorage.setItem('rabbani-theme-v1', t), theme);
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('rabbani-v1')))).toBe(true);
    await page.evaluate(seed);
    await page.reload();
    await page.locator('.home-today-list').click();
    const cards = page.locator('.today-task-card');
    await expect(cards.first()).toBeVisible();
    await expect(page.locator('.today-task-heading').first()).toHaveText('الأقرب الآن');
    await expect(page.locator('[data-nextup]')).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('مهمة أ');
    await expect(cards.nth(0)).toContainText('بعد ٣٠ د');
    await expect(cards.nth(1)).toContainText('مهمة ب');
    await expect(cards.nth(2)).toContainText('مهمة ج');
    await expect(page.locator('.today-task-heading').nth(1)).toHaveText('باقي مهام اليوم');
    await page.screenshot({ path: `/tmp/shots/nextup-${theme}-1900.png` });
    // time passes: the label updates without a reload
    await page.clock.runFor('20:00');
    await expect(cards.nth(0)).toContainText('بعد ١٠ د');
    await page.clock.runFor('15:00');
    await expect(cards.nth(0)).toContainText('متأخرة ٥ د');
    // complete the first: the next one is pulled in, order stays by time
    await cards.nth(0).getByRole('button', { name: 'إنجاز' }).first().click();
    await expect(page.locator('[data-nextup]')).toHaveCount(3);
    await expect(cards.nth(0)).toContainText('مهمة ب');
    await expect(cards.nth(2)).toContainText('مهمة د');
    await page.screenshot({ path: `/tmp/shots/nextup-${theme}-1935.png` });
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`home: live nearest-now rows, order and completion (${theme})`, async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-27T19:00:00+02:00') });
    await page.addInitScript(t => localStorage.setItem('rabbani-theme-v1', t), theme);
    await page.goto('/');
    await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('rabbani-v1')))).toBe(true);
    await page.evaluate(seed);
    await page.reload();
    const card = page.locator('.home-today-list');
    await expect(card.locator('.home-tasks-row')).toHaveCount(3);
    await expect(card.locator('.home-tasks-row').nth(0)).toContainText('مهمة أ');
    await expect(card.locator('.home-tasks-row').nth(0)).toContainText('بعد ٣٠ د');
    await expect(card.locator('.home-tasks-row').nth(2)).toContainText('مهمة ج');
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/tmp/shots/home-nextup-${theme}.png` });
    await page.clock.runFor('35:00');
    await expect(card.locator('.home-tasks-row').nth(0)).toContainText('متأخرة ٥ د');
    await card.click();
    await expect(page.locator('.today-task-card').first()).toBeVisible();
  });
}
