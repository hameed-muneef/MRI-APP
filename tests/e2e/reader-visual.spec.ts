import {test,expect} from '@playwright/test';

for(const theme of ['light','dark'] as const){
 test(`reader renders a readable palette in ${theme} theme`,async({page})=>{
  await page.addInitScript(mode=>localStorage.setItem('rabbani-theme-v1',mode),theme);
  await page.goto('/');
  await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).click();
  await page.locator('.quran-section-grid button[data-quran-tab="mushaf"]').click();
  const paper=page.locator('.mf-page').first();
  await expect(paper).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  // Test the paper contract directly, without machine-specific screenshot baselines.
  const colors=await paper.evaluate(el=>({background:getComputedStyle(el).backgroundImage,color:getComputedStyle(el.querySelector('.mf-page-text')!).color}));
  expect(colors.background).toContain(theme==='dark'?'rgb(28, 42, 36)':'rgb(247, 239, 217)');
  expect(colors.color).toBe(theme==='dark'?'rgb(210, 221, 215)':'rgb(48, 75, 80)');
  await paper.screenshot({path:`test-results/reader-${theme}.png`});
 });
}
