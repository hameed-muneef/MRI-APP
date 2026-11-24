import { test, expect } from '@playwright/test';

async function openQibla(page: import('@playwright/test').Page) {
  const sidebarBtn = page.locator('.sidebar button', { hasText: 'اتجاه القبلة' });
  if (await sidebarBtn.isVisible().catch(() => false)) {
    await sidebarBtn.first().click();
  } else {
    await page.locator('.mobile-nav button', { hasText: 'القبلة' }).first().click();
  }
}

test('one central location fix in settings is shared by the qibla screen', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 30.0444, longitude: 31.2357 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('button.topbar-settings').click();
  await expect(page.locator('.location-central-panel')).toBeVisible();
  await page.locator('.location-central-panel button', { hasText: 'تحديد موقعي الآن' }).click();
  await expect(page.locator('.location-central-panel')).toContainText('الموقع متاح', { timeout: 15_000 });
  await expect(page.locator('.location-central-panel')).toContainText('30.044');

  // The qibla screen reads the same shared fix: bearing of Cairo (~136°) with no new prompt.
  await openQibla(page);
  await expect(page.locator('.qibla-page')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.qibla-page')).toContainText('زاوية القبلة');
  const text = await page.locator('.qibla-page').innerText();
  expect(text).toMatch(/13[56]/);
});

test('a manual city chosen once in settings applies to the qibla screen and survives reload', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 30.0444, longitude: 31.2357 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.locator('button.topbar-settings').click();
  await page.locator('.location-central-panel button', { hasText: 'اختيار مدينة يدويًا' }).click();
  await page.locator('.location-central-panel input[type="search"]').fill('مكة');
  await page.locator('.location-central-panel .qibla-picker-list button', { hasText: 'مكة المكرمة' }).first().click();
  await expect(page.locator('.location-central-panel')).toContainText('المدينة المختارة: مكة المكرمة');

  await openQibla(page);
  await expect(page.locator('.qibla-page')).toContainText('مكة المكرمة', { timeout: 15_000 });
  // Manual qibla from Makkah is ~0° direction-agnostic; the shared label must be shown instead of GPS.
  await expect(page.locator('.qibla-page')).toContainText('العودة إلى GPS');

  // Persisted centrally: a reload keeps the manual city everywhere.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.locator('button.topbar-settings').click();
  await expect(page.locator('.location-central-panel')).toContainText('المدينة المختارة: مكة المكرمة');
});
