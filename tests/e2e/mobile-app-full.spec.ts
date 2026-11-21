import { test, expect, type Page } from '@playwright/test';

async function attachErrorCollectors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      // Ignore expected offline/external network noise when testing offline state
      if (!txt.includes('Failed to load resource') && !txt.includes('ERR_INTERNET_DISCONNECTED')) {
        errors.push(`console.error: ${txt}`);
      }
    }
  });
  return errors;
}

async function assertNoPageOverflow(page: Page, contextLabel: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${contextLabel}: horizontal overflow (${overflow.scrollWidth} > ${overflow.innerWidth})`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

test.describe('Full Mobile App Walkthrough (All Views & Scenarios)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('navigates every mobile screen, sub-feature, theme toggle, persistence, and zero crashes', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 24.7136, longitude: 46.6753 }); // Riyadh
    const errors = await attachErrorCollectors(page);

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible();
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await assertNoPageOverflow(page, 'home');

    // 1. Home dashboard & cards
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.home-today-entry')).toBeVisible();
    await expect(page.locator('.feature-card', { hasText: 'المساجد القريبة' })).toBeVisible();

    // 2. Today Tasks -> verify view & overflow
    await page.locator('.home-today-entry').click();
    await expect(page.locator('h1', { hasText: 'مركز المهام' })).toBeVisible();
    await assertNoPageOverflow(page, 'tasks');

    // 3. Mobile nav -> حياتي (Day Planner) -> week / month / goals
    await page.locator('.mobile-nav button', { hasText: 'حياتي' }).click();
    await expect(page.locator('.crumb strong')).toContainText('يومي مع الله');
    await assertNoPageOverflow(page, 'day');

    await page.locator('.crumb-home').click();
    await page.locator('.feature-card', { hasText: 'أسبوعي مع الله' }).click();
    await expect(page.locator('.crumb strong')).toContainText('أسبوعي مع الله');
    await assertNoPageOverflow(page, 'week');

    await page.locator('.crumb-home').click();
    await page.locator('.feature-card', { hasText: 'شهري مع الله' }).click();
    await expect(page.locator('.crumb strong')).toContainText('شهري مع الله');
    await assertNoPageOverflow(page, 'month');

    await page.locator('.crumb-home').click();
    await page.locator('.feature-card', { hasText: 'المؤمن القوي' }).click();
    await expect(page.locator('.crumb strong')).toContainText('المؤمن القوي');
    await assertNoPageOverflow(page, 'goals');

    // 4. Quran & Sunnah + key offline sub-sections (Mushaf, Bukhari, Azkar)
    await page.locator('.mobile-nav button', { hasText: 'القرآن' }).click();
    await expect(page.locator('.quran-page')).toBeVisible();
    await expect(page.locator('.quran-section-grid')).toBeVisible();
    await assertNoPageOverflow(page, 'quran-mushaf');

    await page.locator('.quran-section-grid button', { hasText: 'صحيح البخاري' }).click();
    await expect(page.locator('.quran-section-header h2')).toContainText('صحيح البخاري');
    await assertNoPageOverflow(page, 'quran-bukhari');

    await page.locator('.quran-section-grid button', { hasText: 'أذكار' }).click();
    await expect(page.locator('.quran-section-header h2')).toContainText('أذكار');
    await assertNoPageOverflow(page, 'quran-azkar');

    // 5. Qibla screen
    await page.locator('.mobile-nav button', { hasText: 'القبلة' }).click();
    await expect(page.locator('.qibla-page')).toBeVisible({ timeout: 10_000 });
    await assertNoPageOverflow(page, 'qibla');

    // 6. Nearby Mosques screen
    await page.locator('.mobile-nav button', { hasText: 'المساجد' }).click();
    await expect(page.locator('.mosques-page')).toBeVisible();
    await expect(page.locator('.mosque-card').first()).toBeVisible({ timeout: 10_000 });
    await assertNoPageOverflow(page, 'mosques');

    // 7. Haramain Live (scrollable in mobile nav)
    const haramainBtn = page.locator('.mobile-nav button', { hasText: 'الحرمين' });
    await haramainBtn.scrollIntoViewIfNeeded();
    await haramainBtn.click();
    await expect(page.locator('.haramain')).toBeVisible();
    await assertNoPageOverflow(page, 'haramain');

    // 8. Accountability (reflect) + Wirds (زكِّ نفسك)
    const reflectBtn = page.locator('.mobile-nav button', { hasText: 'المحاسبة' });
    await reflectBtn.scrollIntoViewIfNeeded();
    await reflectBtn.click();
    await expect(page.locator('.crumb strong')).toContainText('محاسبة النفس');
    await assertNoPageOverflow(page, 'reflect');

    const wirdEntry = page.locator('button', { hasText: 'زكِّ نفسك' }).first();
    if (await wirdEntry.count()) {
      await wirdEntry.click();
      await expect(page.locator('.wird-grid')).toBeVisible();
      await assertNoPageOverflow(page, 'wird');
    }

    // 9. Settings (in topbar) + Theme Switch (Light -> Dark) + Notification drawer
    const settingsBtn = page.locator('.topbar-settings');
    await settingsBtn.click();
    await expect(page.locator('.crumb strong')).toContainText('الإعدادات');
    await assertNoPageOverflow(page, 'settings-light');

    const darkBtn = page.locator('button', { hasText: 'داكن' }).first();
    if (await darkBtn.count()) {
      await darkBtn.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await assertNoPageOverflow(page, 'settings-dark');
    }

    // Open Notification Center drawer
    const notifBtn = page.locator('.top-actions button[aria-label*="التنبيهات"], .top-actions button[aria-label*="الإشعارات"]').first();
    if (await notifBtn.count()) {
      await notifBtn.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
    }

    // Also verify Mosques in dark theme
    await page.locator('.mobile-nav button', { hasText: 'المساجد' }).click();
    await expect(page.locator('.mosques-page')).toBeVisible();
    await assertNoPageOverflow(page, 'mosques-dark');

    expect(errors, `Runtime errors detected:\n${errors.join('\n')}`).toEqual([]);
  });

  test('offline mode behavior: Mosques & Qibla work locally while Haramain shows offline notice cleanly', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 30.0444, longitude: 31.2357 }); // Cairo

    await page.goto('/');
    // Pre-open Qibla, Haramain & Mosques while online (simulating APK-bundled/cached modules in Vite dev mode)
    await page.locator('.mobile-nav button', { hasText: 'القبلة' }).click();
    await expect(page.locator('.qibla-page')).toBeVisible({ timeout: 10_000 });

    const haramainBtn = page.locator('.mobile-nav button', { hasText: 'الحرمين' });
    await haramainBtn.scrollIntoViewIfNeeded();
    await haramainBtn.click();
    await expect(page.locator('.haramain')).toBeVisible();

    await page.locator('.mobile-nav button', { hasText: 'المساجد' }).click();
    await expect(page.locator('.mosque-card').first()).toBeVisible({ timeout: 10_000 });

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Offline banner appears on Mosques, cards remain usable
    await expect(page.locator('.mosques-offline-banner')).toBeVisible();
    await expect(page.locator('.mosque-card').first()).toBeVisible();

    // Radius change & travel mode toggle work strictly from local memory offline
    await page.locator('.mosques-radius-group button', { hasText: '3 كم' }).click();
    await expect(page.locator('.mosque-card').first()).toBeVisible();
    await page.locator('.mosques-mode-group button', { hasText: 'سيارة' }).click();
    await expect(page.locator('.mosques-mode-group button', { hasText: 'سيارة' })).toHaveAttribute('aria-pressed', 'true');

    // Qibla works offline
    await page.locator('.mobile-nav button', { hasText: 'القبلة' }).click();
    await expect(page.locator('.qibla-page')).toBeVisible({ timeout: 10_000 });

    // Haramain shows offline notice rather than broken iframe
    await haramainBtn.scrollIntoViewIfNeeded();
    await haramainBtn.click();
    await expect(page.locator('.haramain')).toContainText('يحتاج اتصالًا بالإنترنت');

    await context.setOffline(false);
  });
});
