import {test,expect} from '@playwright/test';
test('local audio download, offline check, resume and delete preserves progress',async({page,context},info)=>{
 await page.route('**/api.quran.com/api/v4/recitations/7/by_ayah/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({audio_files:[{url:'https://verses.quran.com/test/audio.mp3'}]})}));
 await page.route('https://verses.quran.com/test/audio.mp3',route=>route.fulfill({contentType:'audio/mpeg',body:Buffer.from('x'.repeat(300))}));
 await page.goto('/');await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();const ui=page.locator('.qm-workspace');await ui.locator('summary').filter({hasText:'التنزيلات والاستعداد'}).click();
 await ui.getByRole('button',{name:'تنزيل أو استئناف صوت الآيات',exact:true}).click();await expect(ui).toContainText('اكتمل تنزيل آيات السورة');
 const before=await page.evaluate(()=>localStorage.getItem('rabbani-mastery-v1'));
 await context.setOffline(true);await ui.getByRole('button',{name:'فحص وجود الملفات',exact:true}).click();await expect(ui).toContainText('ملفات الحزمة موجودة الآن');
 await ui.getByRole('button',{name:'فحص وجود الملفات',exact:true}).evaluate(e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:`/downloads/phase6-offline-${info.project.name}.png`});
 await ui.getByRole('button',{name:'حذف صوت الآيات',exact:true}).click();await expect(ui.getByRole('button',{name:'فحص وجود الملفات',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('rabbani-mastery-v1'))).toBe(before);
 const persist=ui.getByRole('button',{name:'طلب الاحتفاظ بالتخزين من المتصفح',exact:true});await persist.evaluate(e=>e.scrollIntoView({block:'center'}));await persist.click();await expect(ui).toContainText(/الاحتفاظ|لم يمنح/);await page.screenshot({path:`/downloads/phase6-bottom-${info.project.name}.png`});await context.setOffline(false);
});

test('downloaded audio decodes and full daily learning flow completes without network',async({page,context})=>{
 const wav=Buffer.alloc(8044);wav.write('RIFF',0);wav.writeUInt32LE(8036,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(8000,28);wav.writeUInt16LE(1,32);wav.writeUInt16LE(8,34);wav.write('data',36);wav.writeUInt32LE(8000,40);wav.fill(128,44);
 await page.route('**/api.quran.com/api/v4/recitations/7/by_ayah/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({audio_files:[{url:'https://verses.quran.com/test/offline.wav'}]})}));
 await page.route('https://verses.quran.com/test/offline.wav',route=>route.fulfill({contentType:'audio/wav',body:wav}));
 await page.goto('/');await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();const ui=page.locator('.qm-workspace');await ui.locator('summary').filter({hasText:'التنزيلات والاستعداد'}).click();await ui.getByRole('button',{name:'تنزيل أو استئناف صوت الآيات',exact:true}).click();await expect(ui).toContainText('اكتمل تنزيل آيات السورة');
 await context.unrouteAll();await context.setOffline(true);await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).click();await expect(ui).toContainText('اكتمل التكرار المحدد.',{timeout:25000});
 for(const name of ['التالي: افهم','التالي: احفظ','التالي: اربط','التالي: سمّع','أنهيت محاولة الاسترجاع، انتقل للتقييم'])await ui.getByRole('button',{name,exact:true}).click();await ui.getByRole('button',{name:'جيد',exact:true}).click();const root=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!));expect(root.assessments).toHaveLength(1);expect(root.repetitionEvents.every((x:{completed:number})=>x.completed===3)).toBe(true);await context.setOffline(false);
});
