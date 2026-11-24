import { expect, test } from '@playwright/test';

const TINY_MP3 = Buffer.from('fffb9064000000000000000000000000496e666f0000000f000000010000010000'.padEnd(32 + 320, '0'), 'hex');

for (const width of [320, 360, 390]) {
  test(`mini audio player fits and close is reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.route('https://www.mp3quran.net/api/v3/reciters**', route => route.abort());
    await page.route('https://**/*.mp3', route => route.fulfill({
      status: 200, contentType: 'audio/mpeg', headers: { 'access-control-allow-origin': '*' }, body: TINY_MP3,
    }));
    await page.goto('/');
    await page.locator('.mobile-nav button', { hasText: 'القرآن' }).click();
    await page.locator('.mf-row-audio .mf-btn.primary').first().click();
    const player = page.locator('.mini-audio-player');
    await expect(player).toBeVisible({ timeout: 15_000 });
    const clock = page.locator('.mini-audio-clock');
    if (await clock.count()) {
      expect(await clock.evaluate(el => getComputedStyle(el).direction)).toBe('ltr');
    }
    await page.screenshot({ path: `/tmp/mini-${width}.png` });
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)?.getBoundingClientRect();
      const p = r('.mini-audio-player')!, c = r('.mini-audio-btn.close')!, n = r('.mobile-nav')!;
      return { p: { l: p.left, r: p.right, t: p.top, b: p.bottom }, c: { l: c.left, r: c.right, t: c.top, b: c.bottom, w: c.width, h: c.height }, navTop: n.top, vw: innerWidth, sw: document.documentElement.scrollWidth };
    });
    console.log(width, JSON.stringify(m));
    expect(m.p.l).toBeGreaterThanOrEqual(0);
    expect(m.p.r).toBeLessThanOrEqual(m.vw);
    expect(m.c.l).toBeGreaterThanOrEqual(0);
    expect(m.c.r).toBeLessThanOrEqual(m.vw);
    expect(m.c.w).toBeGreaterThanOrEqual(36);
    expect(m.c.h).toBeGreaterThanOrEqual(36);
    expect(m.p.b).toBeLessThanOrEqual(m.navTop + 1);
    expect(m.sw).toBeLessThanOrEqual(m.vw + 1);
  });
}
