import {test, expect, type Page} from '@playwright/test';

async function assertNoPageOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${label}: horizontal overflow (${overflow.scrollWidth} > ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

async function assertMinTouchTargets(page: Page, selector: string, label: string) {
  const heights = await page.locator(selector).evaluateAll(els =>
    els
      .filter(el => (el as HTMLElement).offsetParent !== null)
      .map(el => ({
        text: (el.textContent ?? '').trim().slice(0, 30),
        h: el.getBoundingClientRect().height,
      })),
  );
  for (const item of heights) {
    expect(item.h, `${label} button "${item.text}" height ${item.h} < 42px`).toBeGreaterThanOrEqual(42);
  }
}

test.describe('Upcoming Reminders, Alarms & Settings Mobile Redesign', () => {
  test.use({viewport: {width: 375, height: 812}});

  test('Home upcoming cards route cleanly, reminders CRUD + snooze syncs to Home, and all 4 settings tabs work without overflow', async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

    await page.goto('/');
    await expect(page.locator('.home-dashboard')).toBeVisible();
    await assertNoPageOverflow(page, 'home-initial');

    // 1. Clicking Home "التذكيرات القادمة" opens Settings directly on "المنبهات والتذكيرات" tab
    await page.locator('.home-next-card-reminders').click();
    await expect(page.locator('.settings-tabs button[role="tab"][aria-selected="true"]')).toContainText('المنبهات');
    await expect(page.locator('.notif-add-btn')).toBeVisible();
    await assertMinTouchTargets(page, '.settings-tabs button, .notif-add-btn', 'alarms-tab');
    await assertNoPageOverflow(page, 'alarms-empty');

    // 2. Create a reminder manually + verify validation first
    await page.locator('.notif-add-btn').click();
    await expect(page.locator('.notif-reminder-form')).toBeVisible();
    await page.locator('.notif-reminder-form button[type="submit"]').click();
    await expect(page.locator('.notif-reminder-form [role="alert"]')).toContainText('اكتب عنوان المنبه');

    await page.locator('.notif-reminder-form input[placeholder*="ورد القرآن"]').fill('صلاة الضحى');
    await page.locator('.notif-reminder-form select').first().selectOption('daily');
    await page.locator('.notif-reminder-form button[type="submit"]').click();
    await page.waitForTimeout(300);
    const diag = await page.evaluate(() => ({
      ls: localStorage.getItem('rabbani-notif-reminders-v1'),
      alerts: [...document.querySelectorAll('[role="alert"], .toast')].map(e => e.textContent),
      cards: document.querySelectorAll('.notif-reminder-card').length,
      forms: document.querySelectorAll('.notif-reminder-form').length,
    }));
    console.log('DIAG AFTER SUBMIT:', JSON.stringify(diag));

    const firstCard = page.locator('.notif-reminder-card').filter({has: page.locator('.notif-reminder-title-row strong').filter({hasText: /^صلاة الضحى$/})});
    await expect(firstCard).toBeVisible();
    await assertMinTouchTargets(page, '.notif-reminder-actions button, .notif-power-switch', 'reminder-card-actions');

    // 3. Create another reminder via template & weekdays selector
    await page.locator('.notif-template', {hasText: 'أذكار المساء'}).click();
    await expect(page.locator('.notif-reminder-form input[placeholder*="ورد القرآن"]')).toHaveValue('أذكار المساء');
    await page.locator('.notif-reminder-form select').first().selectOption('weekdays');
    await expect(page.locator('.notif-days-grid .notif-day').first()).toBeVisible();
    await page.locator('.notif-days-grid .notif-day', {hasText: 'الخميس'}).click();
    await page.locator('.notif-reminder-form button[type="submit"]').click();
    await expect(page.locator('.notif-reminder-card', {hasText: 'أذكار المساء'})).toBeVisible();

    // 4. Reload persistence check
    await page.reload();
    await expect(page.locator('.home-next-card-reminders')).toContainText('صلاة الضحى');
    await expect(page.locator('.home-next-card-reminders')).toContainText('أذكار المساء');

    // Navigate back to Alarms tab via Home card
    await page.locator('.home-next-card-reminders').click();
    await expect(page.locator('.notif-reminder-card', {hasText: 'صلاة الضحى'})).toBeVisible();

    // 5. Snooze "صلاة الضحى" and verify HomeDashboard shows "مؤجل مؤقتًا"
    const duhaCard = page.locator('.notif-reminder-card').filter({has: page.locator('.notif-reminder-title-row strong').filter({hasText: /^صلاة الضحى$/})});
    await duhaCard.locator('button', {hasText: 'تأجيل ١٠ د'}).click();
    await expect(duhaCard.locator('.notif-reminder-due')).toContainText('مؤجل مؤقتًا');

    await page.locator('.mobile-nav button', {hasText: 'الرئيسية'}).click();
    await expect(page.locator('.home-next-card-reminders')).toContainText('مؤجل مؤقتًا');

    // 6. Toggle pause, duplicate, and inline delete confirm
    await page.locator('.home-next-card-reminders').click();
    await duhaCard.locator('[role="switch"]').click();
    await expect(duhaCard).toHaveClass(/paused/);
    await expect(duhaCard.locator('[role="switch"]')).toHaveAttribute('aria-checked', 'false');

    await duhaCard.locator('button', {hasText: 'نسخ'}).click();
    await expect(page.locator('.notif-reminder-card', {hasText: 'صلاة الضحى (نسخة)'})).toBeVisible();

    // Inline delete confirmation sits inside card itself
    await duhaCard.locator('button', {hasText: 'حذف'}).click();
    await expect(duhaCard.locator('[role="alertdialog"]')).toBeVisible();
    await duhaCard.locator('[role="alertdialog"] button', {hasText: 'تأكيد الحذف'}).click();
    await expect(page.locator('.notif-reminder-card').filter({has: page.locator('.notif-reminder-title-row strong').filter({hasText: /^صلاة الضحى$/})})).toHaveCount(0);

    // 7. Sub-tab: Scheduled task notifications
    await page.locator('.notif-subtabs button', {hasText: 'تذكيرات المهام المجدولة'}).click();
    await expect(page.locator('.notif-task-panel')).toBeVisible();
    await assertNoPageOverflow(page, 'alarms-tasks-subtab');

    // 8. Tab 3: الأذان والصلوات — compact prayer card expands & saves
    await page.locator('.settings-tabs button[role="tab"]', {hasText: 'الأذان'}).click();
    await expect(page.locator('.notif-prayer-card').first()).toBeVisible();
    const fajrCard = page.locator('.notif-prayer-card').first();
    await fajrCard.locator('.notif-prayer-expand').click();
    await expect(fajrCard.locator('#prayer-0-before')).toBeVisible();
    await fajrCard.locator('#prayer-0-before').fill('15');
    await fajrCard.locator('button', {hasText: 'حفظ إعدادات الفجر'}).click();
    await expect(fajrCard.locator('.notif-prayer-summary')).toContainText('قبل 15 د');
    await assertNoPageOverflow(page, 'adhan-tab');

    // 9. Tab 4: الهدوء والإشعارات — Quiet hours + Save
    await page.locator('.settings-tabs button[role="tab"]', {hasText: 'الهدوء'}).click();
    await expect(page.locator('.notif-general-panel')).toBeVisible();
    await page.locator('.notif-general-panel label', {hasText: 'ساعات الهدوء'}).click();
    await page.locator('.notif-general-panel button', {hasText: 'حفظ التغييرات'}).click();
    await expect(page.locator('.notif-general-panel button', {hasText: 'تم الحفظ'})).toBeVisible();
    await assertNoPageOverflow(page, 'quiet-tab');

    // 10. Tab 1: المظهر والبيانات — Dark mode + 320px narrow mobile stress check
    await page.locator('.settings-tabs button[role="tab"]', {hasText: 'عام'}).click();
    await expect(page.locator('.appearance-seg')).toBeVisible();
    await expect(page.locator('.settings-tabs button[role="tab"]')).toHaveCount(4);
    await page.locator('.appearance-seg button', {hasText: 'ليلي'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.setViewportSize({width: 320, height: 740});
    await assertNoPageOverflow(page, 'settings-general-dark-320');

    await page.locator('.settings-tabs button[role="tab"]', {hasText: 'المنبهات والتذكيرات'}).click();
    await assertNoPageOverflow(page, 'settings-alarms-dark-320');

    await page.locator('.mobile-nav button', {hasText: 'الرئيسية'}).click();
    await assertNoPageOverflow(page, 'home-dark-320');

    // Click Home prayer card -> lands on Adhan tab
    await page.locator('.home-next-card-prayer').click();
    await expect(page.locator('.settings-tabs button[role="tab"][aria-selected="true"]')).toContainText('الأذان');
    await assertNoPageOverflow(page, 'settings-adhan-dark-320');

    expect(errors, `Runtime errors detected:\n${errors.join('\n')}`).toEqual([]);
  });
});
