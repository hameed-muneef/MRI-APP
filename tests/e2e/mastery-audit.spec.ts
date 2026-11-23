import {test,expect} from '@playwright/test';
async function enter(page:import('@playwright/test').Page,tab='hifz'){
 await page.goto('/');await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator(`[data-quran-tab="${tab}"]`).click();return page.locator('.qm-workspace');
}
test('progressive visible recall records self assessment without spaced evidence',async({page},info)=>{
 const ui=await enter(page,'revision');await ui.getByRole('button',{name:'ابدأ الاسترجاع',exact:true}).click();
 await ui.getByRole('button',{name:'إخفاء تدريجي',exact:true}).click();await expect(ui.locator('.quran-verse-hidden')).toHaveCount(0);
 await expect(ui).toContainText('ولا يبني دليل إتقان مستقلًا');await page.screenshot({path:`/downloads/audit-progressive-${info.project.name}.png`});
 await ui.getByRole('button',{name:'أنهيت محاولة الاسترجاع، انتقل للتقييم',exact:true}).click();await ui.getByRole('button',{name:'متقن',exact:true}).click();
 const root=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));expect(root.assessments).toHaveLength(1);expect(root.projections[0].evidence).toEqual([]);expect(root.schedules[0].intervalIndex).toBe(0);
});
test('corrupt learning data stays recoverable and cannot be overwritten by a fresh session',async({page})=>{
 const ui=await enter(page);await page.evaluate(()=>localStorage.setItem('rabbani-mastery-v1','broken-private-learning'));await page.reload();
 await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();
 await expect(ui.getByRole('alert')).toContainText('غير قابلة للقراءة');await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();await expect(ui.locator('h2')).toHaveText('جلسة حفظ جديدة');
 expect(await page.evaluate(()=>localStorage.getItem('rabbani-mastery-v1'))).toBe('broken-private-learning');
 expect(await page.evaluate(()=>localStorage.getItem('rabbani-mastery-v1:quarantine'))).toBe('broken-private-learning');
});
test('a second window change is not overwritten and error is visible',async({page},info)=>{
 const ui=await enter(page);await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();
 await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('rabbani-mastery-v1')!);r.updatedAt='2026-11-24T12:00:00Z';localStorage.setItem('rabbani-mastery-v1',JSON.stringify(r));});
 await ui.getByRole('button',{name:'التالي: افهم',exact:true}).click();await expect(ui.locator('h2')).toHaveText('استمع');await expect(ui.getByRole('alert')).toContainText('نافذة أخرى');
 await ui.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:`/downloads/audit-storage-${info.project.name}.png`});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).sessions[0].stage)).toBe('listen');
});
test('resuming an assessment requires a fresh recall, not reused prior-day completion',async({page})=>{
 const ui=await enter(page,'revision');await ui.getByRole('button',{name:'ابدأ الاسترجاع',exact:true}).click();
 await ui.getByRole('button',{name:'أنهيت محاولة الاسترجاع، انتقل للتقييم',exact:true}).click();
 await ui.getByRole('button',{name:'رجوع وحفظ الموضع',exact:true}).click();await ui.getByRole('button',{name:/استئناف/}).first().click();
 await expect(ui.locator('h2')).toHaveText('تلو');const r=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));expect(r.recallAttempts.at(-1).completedAt).toBeUndefined();
});
test('no storage persistence API gives a clear unsupported state',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'storage',{value:undefined,configurable:true}));const ui=await enter(page);
 await ui.locator('.qm-offline summary').click();await ui.getByRole('button',{name:'طلب الاحتفاظ بالتخزين من المتصفح',exact:true}).click();await expect(ui).toContainText('الاحتفاظ الدائم غير متاح في هذا المتصفح');
});
