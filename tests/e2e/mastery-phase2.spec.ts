import {expect,test} from '@playwright/test';
for(const width of [360,1280]){
 test(`Phase 2 complete local session and mask controls at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();
  await page.locator('[data-quran-tab="hifz"]').click();
  const ui=page.locator('.qm-workspace');await expect(ui).toBeVisible();
  await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();
  await expect(ui.locator('h2')).toHaveText('استمع');
  await ui.getByRole('button',{name:'التالي: افهم',exact:true}).click();
  await expect(ui).toContainText('المصدر قيد المراجعة');
  await ui.getByRole('button',{name:'التالي: احفظ',exact:true}).click();
  for(const label of ['إخفاء الكل','إخفاء فردي','إخفاء تدريجي','اختبار استرجاع كامل']){
   await ui.getByRole('button',{name:label,exact:true}).click();
   await ui.getByRole('button',{name:'إظهار الكل فورًا',exact:true}).click();
   await expect(ui.locator('.quran-verse-hidden')).toHaveCount(0);
  }
  await ui.getByRole('button',{name:'التالي: اربط',exact:true}).click();
  await expect(ui).toContainText('سلسلة الربط التدريجي');
  await ui.getByRole('button',{name:'رجوع وحفظ الموضع',exact:true}).click();
  await page.reload();
  await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();
  await ui.getByRole('button',{name:/استئناف/}).first().click();await expect(ui.locator('h2')).toHaveText('اربط');
  await ui.getByRole('button',{name:'التالي: تلو',exact:true}).click();
  await ui.getByRole('button',{name:'اختبار استرجاع كامل',exact:true}).click();
  await expect(ui.locator('.quran-verse-hidden')).toHaveCount(3);
  await ui.screenshot({path:`/downloads/mastery-recite-${width}.png`});
  expect(await ui.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await ui.getByRole('button',{name:'أنهيت محاولة الاسترجاع، انتقل للتقييم',exact:true}).click();
  await expect(ui.locator('h2')).toHaveText('قيّم');
  await ui.screenshot({path:`/downloads/mastery-assess-${width}.png`});
  await ui.getByRole('button',{name:'متقن',exact:true}).click();
  await expect(ui).toContainText('الحالة: قيد الحفظ');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));
  expect(saved.assessments).toHaveLength(1);expect(saved.projections[0].state).toBe('in_progress');
  expect(saved.recallAttempts.find((a:{id:string})=>a.id===saved.assessments[0].attemptId).completedAt).toBeTruthy();
  await ui.screenshot({path:`/downloads/mastery-summary-${width}.png`});
  expect(errors).toEqual([]);
 });
}
test('revision starts at recall, individual reveal works in full test',async({page})=>{
 await page.setViewportSize({width:360,height:900});await page.goto('/');
 await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="revision"]').click();
 const ui=page.locator('.qm-workspace');await ui.getByRole('button',{name:'ابدأ الاسترجاع',exact:true}).click();
 await expect(ui.locator('h2')).toHaveText('تلو');
 await ui.getByRole('button',{name:'اختبار استرجاع كامل',exact:true}).click();
 await ui.getByRole('button',{name:'إظهار الآية 1',exact:true}).first().click();
 await expect(ui.locator('.quran-verse-hidden')).toHaveCount(2);
 await ui.getByRole('button',{name:'إظهار الكل فورًا',exact:true}).click();await expect(ui.locator('.quran-verse-hidden')).toHaveCount(0);
});
