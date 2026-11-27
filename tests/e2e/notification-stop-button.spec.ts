import {test, expect, type Page} from '@playwright/test';

// سيناريوهات زر إيقاف الصوت: يظهر أثناء تشغيل أذان حقيقي، يوقف الصوت فعلًا، ويختفي.
// التشغيل هنا في متصفح Chromium فعلي عبر خادم التطوير، وليس على جهاز أندرويد.

const PREFS_KEY = 'rabbani-notif-prefs-v1';
const ADHAN_SOUND_ID = 'adhan:hadrawi';

async function openQuietTab(page: Page) {
  await page.goto('/');
  await expect(page.locator('.home-dashboard')).toBeVisible();
  await page.locator('.home-next-card-reminders').click();
  await expect(page.locator('.settings-tabs')).toBeVisible();
  await page.locator('.settings-tabs button[role="tab"]', {hasText: 'الهدوء'}).click();
  await expect(page.locator('.notif-general-panel')).toBeVisible();
}

test.describe('إيقاف الأذان أو المنبه', () => {
  test.use({viewport: {width: 375, height: 812}, permissions: ['notifications']});

  test('settings explain how to stop an adhan or alarm, and the line fits on a phone', async ({page}) => {
    await openQuietTab(page);

    const hint = page.locator('.notif-stop-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('إيقاف الصوت');
    await expect(hint).toContainText('تأجيل');

    const geometry = await page.evaluate(() => {
      const el = document.querySelector('.notif-stop-hint') as HTMLElement | null;
      const rect = el?.getBoundingClientRect();
      return {
        rect: rect ? {top: rect.top, left: rect.left, right: rect.right, width: rect.width, height: rect.height} : null,
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });
    expect(geometry.rect, 'hint is rendered').not.toBeNull();
    expect(geometry.rect!.width).toBeGreaterThan(120);
    expect(geometry.rect!.left).toBeGreaterThanOrEqual(0);
    expect(geometry.rect!.right).toBeLessThanOrEqual(geometry.innerWidth + 1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
  });

  test('the in-app stop button appears while an adhan plays, silences it, and comes back next time', async ({page}) => {
    // نُشغّل أذانًا حقيقيًا كصوت التذكيرات الافتراضي، ونحتفظ بمؤشر على عنصر الصوت لقياس حالته.
    await page.addInitScript(
      ([key, soundId]) => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') as Record<string, unknown>;
          parsed.reminder_settings = {...(parsed.reminder_settings as object | undefined ?? {}), default_sound_id: soundId};
          window.localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          /* ignore */
        }
      },
      [PREFS_KEY, ADHAN_SOUND_ID] as const,
    );
    await page.addInitScript(() => {
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement, ...args: []) {
        (window as unknown as {__playedAudio?: HTMLMediaElement}).__playedAudio = this;
        return original.apply(this, args);
      };
    });

    await openQuietTab(page);
    const select = page.locator('label', {hasText: 'صوت التذكيرات الافتراضي'}).locator('select');
    await select.scrollIntoViewIfNeeded();
    await page.locator('details.settings-inner-details').filter({hasText: 'خيارات إضافية للتنبيهات'}).evaluate(el => el.setAttribute('open', ''));
    await expect(select).toHaveValue(ADHAN_SOUND_ID);

    const stopButton = page.locator('.live-sound-stop');
    await expect(stopButton).toHaveCount(0);

    await page.locator('button', {hasText: 'تجربة الصوت والتنبيه'}).click();
    await expect(stopButton).toBeVisible();
    await expect(stopButton).toContainText('إيقاف الصوت');

    const playing = await page.evaluate(() => {
      const el = (window as unknown as {__playedAudio?: HTMLMediaElement}).__playedAudio;
      return el ? {src: el.currentSrc, paused: el.paused} : null;
    });
    expect(playing, 'an audio element was used').not.toBeNull();
    expect(playing!.src).toContain('adhan_hadrawi.ogg');
    expect(playing!.paused).toBe(false);

    // زر حقيقي يمكن لمسه على الهاتف
    const box = await stopButton.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(42);

    await stopButton.click();
    await expect(stopButton).toHaveCount(0);
    const afterStop = await page.evaluate(() => {
      const el = (window as unknown as {__playedAudio?: HTMLMediaElement}).__playedAudio;
      return el ? {paused: el.paused, at: el.currentTime} : null;
    });
    expect(afterStop!.paused).toBe(true);
    expect(afterStop!.at).toBeLessThan(1);

    // السيناريو الثاني: تنبيه آخر بعد الإيقاف — الزر يعود ثم يوقف الصوت ثانية.
    await page.locator('button', {hasText: 'تجربة الصوت والتنبيه'}).click();
    await expect(stopButton).toBeVisible();
    await stopButton.click();
    await expect(stopButton).toHaveCount(0);
    const afterSecondStop = await page.evaluate(() => {
      const el = (window as unknown as {__playedAudio?: HTMLMediaElement}).__playedAudio;
      return el ? el.paused : null;
    });
    expect(afterSecondStop).toBe(true);
  });
});
