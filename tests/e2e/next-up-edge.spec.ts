import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, timezoneId: 'Africa/Cairo' });

type Row = { id: string; title: string; time: string; date: string; done?: boolean; period?: string };
const seedRows = (rows: Row[]) => {
  const tasks = rows.map(r => ({ id: r.id, title: r.title, period: r.period ?? 'daily', done: Boolean(r.done), optional: false }));
  const taskSchedules: Record<string, unknown> = {};
  for (const r of rows) if (r.time) taskSchedules[r.id] = { title: r.title, sourceLabel: 'يومي مع الله', initialDate: r.date, initialTime: r.time, confirmedDate: r.date, confirmedTime: r.time, notifyEnabled: true };
  const st = JSON.parse(localStorage.getItem('rabbani-v1') || '{}');
  localStorage.setItem('rabbani-v1', JSON.stringify({ ...st, tasks, taskSchedules }));
};

async function open(page: import('@playwright/test').Page, at: string, rows: Row[]) {
  await page.clock.install({ time: new Date(at) });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('rabbani-v1')))).toBe(true);
  await page.evaluate(seedRows, rows);
  await page.reload();
  await page.locator('.home-today-list').click();
  await expect(page.locator('.today-task-card').first()).toBeVisible();
}

test('next up: a done task is never pinned or listed in the nearest group', async ({ page }) => {
  const d = '2026-11-27';
  await open(page, '2026-11-27T19:00:00+02:00', [
    { id: 'a', title: 'مهمة منجزة', time: '18:50', date: d },
    { id: 'b', title: 'مهمة ب', time: '19:20', date: d },
  ]);
  await expect(page.locator('[data-nextup]')).toHaveCount(2);
  await page.locator('.today-task-card').first().getByRole('button', { name: 'إنجاز' }).first().click();
  await expect(page.locator('[data-nextup]')).toHaveCount(1);
  await expect(page.locator('.today-task-card').first()).toContainText('مهمة ب');
  await expect(page.locator('.today-task-card').filter({ hasText: 'مهمة منجزة' })).toHaveCount(0);
});

test('next up: five tasks in the same minute show exactly three chips', async ({ page }) => {
  const d = '2026-11-27';
  await open(page, '2026-11-27T19:00:00+02:00', ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, title: `م${id}`, time: '19:30', date: d })));
  await expect(page.locator('[data-nextup]')).toHaveCount(3);
});

test('next up: label refreshes within the 20s tick without a reload', async ({ page }) => {
  const d = '2026-11-27';
  await open(page, '2026-11-27T19:00:00+02:00', [{ id: 'a', title: 'مهمة أ', time: '19:02', date: d }]);
  const card = page.locator('.today-task-card').first();
  await expect(card).toContainText('بعد ٢ د');
  await page.clock.runFor('00:41');
  await expect(card).toContainText('بعد ١ د');
});

test('next up: a task dated today stays visible and flips to late after its time passes', async ({ page }) => {
  const d = '2026-11-27';
  await open(page, '2026-11-27T19:00:00+02:00', [{ id: 'a', title: 'مهمة أ', time: '19:05', date: d }]);
  await page.clock.runFor('10:00');
  await expect(page.locator('[data-nextup="late"]')).toHaveCount(1);
});

test('next up: midnight rollover drops yesterday-dated daily tasks from today and shows tomorrow-dated ones', async ({ page }) => {
  await open(page, '2026-11-27T23:58:00+02:00', [
    { id: 'a', title: 'مهمة اليوم', time: '23:59', date: '2026-11-27' },
    { id: 'b', title: 'مهمة الغد', time: '00:30', date: '2026-11-28' },
  ]);
  await expect(page.locator('[data-nextup]')).toHaveCount(1);
  await page.clock.runFor('03:00');
  await expect(page.locator('.today-task-card').filter({ hasText: 'مهمة الغد' })).toBeVisible();
  await expect(page.locator('.today-task-card').filter({ hasText: 'مهمة اليوم' })).toHaveCount(0);
});
