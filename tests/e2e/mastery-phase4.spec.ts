import {test,expect} from '@playwright/test';
async function enter(page:import('@playwright/test').Page){await page.goto('/');await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();return page.locator('.qm-workspace');}
test('plan configuration, edit, pause, consent catch-up and real session defaults',async({page},info)=>{
 const ui=await enter(page);
 await expect(ui.getByRole('heading',{name:'تقدم مبني على التقييم الذاتي'})).toBeVisible();
 await ui.locator('summary').filter({hasText:'إنشاء خطة منظمة'}).click();
 await ui.getByLabel('اسم الخطة',{exact:true}).fill('خطة الاختبار');
 await ui.getByRole('combobox',{name:'نوع الخطة',exact:true}).selectOption('limited');
 await ui.getByLabel('هدف الآيات اليومي',{exact:true}).fill('2');
 await ui.getByLabel('الدقائق المتاحة',{exact:true}).fill('17');
 await ui.getByRole('combobox',{name:'قارئ الخطة',exact:true}).selectOption('6');
 await ui.getByRole('button',{name:'حفظ الخطة',exact:true}).click();
 await expect(ui.getByRole('heading',{name:'خطة الاختبار',exact:true})).toBeVisible();
 const root=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));
 expect(root.plans[0].timeBudgetMinutes).toBe(17);expect(root.passages).toHaveLength(4);
 await ui.getByRole('button',{name:'إيقاف الخطة مؤقتًا',exact:true}).click();
 await expect(ui.getByRole('button',{name:/ابدأ الهدف التالي/})).toHaveCount(0);
 await ui.getByRole('button',{name:'استئناف الخطة',exact:true}).click();
 await ui.getByRole('button',{name:'تعديل خطة الاختبار',exact:true}).click();
 await ui.getByLabel('هدف الآيات اليومي',{exact:true}).fill('3');await ui.getByRole('button',{name:'حفظ الخطة',exact:true}).click();
 await ui.getByRole('button',{name:'اقتراح توزيع المتأخرات',exact:true}).click();
 await expect(ui).toContainText('معاينة فقط، لم يتغير أي موعد');await ui.getByRole('button',{name:'إلغاء الاقتراح',exact:true}).click();
 await ui.getByRole('heading',{name:'خطة الاختبار',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:`/downloads/phase4-plan-${info.project.name}.png`});
 await ui.getByRole('button',{name:/ابدأ الهدف التالي/}).click();
 await expect(ui.locator('h2')).toHaveText('استمع');
 const selects=ui.locator('select');await expect(selects.filter({has:page.locator('option[value="6"]')})).toHaveValue('6');
});
test('two-week absence is previewed, bounded and only applied on consent',async({page},info)=>{
 await page.addInitScript(()=>{const stamp='2026-11-01T12:00:00Z';const passages=Array.from({length:14},(_,i)=>({id:`p${i}`,range:{surah:2,ayahStart:i+1,ayahEnd:i+1},order:i,schemaVersion:1,createdAt:stamp,updatedAt:stamp}));localStorage.setItem('rabbani-mastery-v1',JSON.stringify({schemaVersion:1,plans:[],passages,sessions:[],repetitionEvents:[],recallAttempts:[],assessments:[],projections:[],schedules:passages.map(p=>({passageId:p.id,dueDate:'2026-11-01',timezone:'UTC',intervalIndex:2,lapses:0,deferrals:[],updatedAt:stamp})),recordings:[],updatedAt:stamp}));});
 const ui=await enter(page);await ui.getByRole('button',{name:'اقتراح توزيع المتأخرات',exact:true}).click();
 let r=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));expect(r.schedules.every((s:{dueDate:string})=>s.dueDate==='2026-11-01')).toBe(true);
 await ui.getByRole('button',{name:'اعتماد التوزيع',exact:true}).click();r=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));const counts:Record<string,number>={};for(const s of r.schedules)counts[s.dueDate]=(counts[s.dueDate]??0)+1;expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(3);expect(r.assessments).toEqual([]);
 await ui.getByRole('heading',{name:'مراجعة اليوم والتعويض الهادئ',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`/downloads/phase4-backlog-${info.project.name}.png`});
 await ui.getByRole('button',{name:'ابدأ هذه المراجعة',exact:true}).first().click();await expect(ui.locator('h2')).toHaveText('تلو');
});
