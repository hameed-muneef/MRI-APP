import {test,expect} from '@playwright/test';
test('removed Tajweed section stays absent while memorization and assessment remain intact',async({page},info)=>{
 await page.goto('/');await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();await page.locator('[data-hifz-detailed]').click();const ui=page.locator('.qm-workspace').first();
 await expect(ui.locator('.qm-tajweed')).toHaveCount(0);await expect(ui.getByLabel('موضوع القراءة')).toHaveCount(0);await expect(ui.locator('a[href*="islamhouse"]')).toHaveCount(0);
 await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();await expect(ui.locator('h2')).toHaveText('استمع');await expect(ui.getByLabel('سرعة التشغيل',{exact:true})).toBeVisible();await expect(ui.locator('.qm-tajweed')).toHaveCount(0);
 await ui.locator('h2').scrollIntoViewIfNeeded();await page.screenshot({path:`/downloads/no-tajweed-session-${info.project.name}.png`});
 for(let i=0;i<4;i++)await ui.getByRole('button',{name:/التالي:/}).click();await ui.getByRole('button',{name:'أنهيت محاولة الاسترجاع، انتقل للتقييم',exact:true}).click();await expect(ui.getByRole('button',{name:'متقن',exact:true})).toBeEnabled();
 const root=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));expect(root.recallAttempts.at(-1).helpEvents).toEqual([]);expect(root.recallAttempts.at(-1).completedAt).toBeTruthy();
});
