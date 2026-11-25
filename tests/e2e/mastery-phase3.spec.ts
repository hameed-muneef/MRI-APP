import {expect,test} from '@playwright/test';

async function mockUnderstandingApis(page:import('@playwright/test').Page){
 await page.route('**/api.quran.com/api/v4/tafsirs/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({tafsir:{text:'نص تفسير تجريبي للآية.'}})}));
 await page.route('**/api.quran.com/api/v4/quran/translations/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({translations:[{text:'Sample translation text.'}]})}));
}
async function startSession(page:import('@playwright/test').Page){
 await page.setViewportSize({width:360,height:900});
 await page.goto('/');
 await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();
 await page.locator('[data-quran-tab="hifz"]').click();await page.locator('[data-hifz-detailed]').click();
 const ui=page.getByRole('region',{name:/الحفظ والإتقان/});
 await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();
 await expect(ui.locator('h2')).toHaveText('استمع');
 return ui;
}

test('understanding sheet: attribution, gates, private notes, session preserved',async({page})=>{
 await mockUnderstandingApis(page);
 const ui=await startSession(page);
 await ui.getByRole('button',{name:'فهم الآيات',exact:true}).click();
 const sheet=page.locator('.qm-sheet');
 await expect(sheet).toBeVisible();
 await expect(sheet).toContainText('نص تفسير تجريبي للآية.');
 await expect(sheet).toContainText('المصدر: التفسير الميسر');
 await expect(sheet.getByLabel('الترجمة',{exact:true})).toHaveCount(0);
 await sheet.getByRole('button',{name:'ترجمة',exact:true}).click();
 await expect(sheet).toContainText('Sample translation text.');
 await expect(sheet).toContainText('المصدر: Saheeh International');
 await expect(sheet).not.toContainText('نص تفسير تجريبي للآية.');
 // معاني الكلمات من بيانات مركز تفسير المدمجة بنسبة المصدر
 await sheet.getByRole('button',{name:'معاني الكلمات',exact:true}).click();
 await expect(sheet).toContainText('المصدر: معاني الكلمات — مركز تفسير للدراسات القرآنية');
 await expect(sheet.locator('.qm-words div').first()).toBeVisible();
 // ملاحظة خاصة: حفظ محلي وإثبات في التخزين
 await sheet.locator('summary').filter({hasText:'ملاحظاتي الخاصة'}).click();
 await sheet.getByLabel('ملاحظة خاصة عن الآية').fill('تدبر تجريبي للآية الأولى');
 await sheet.getByRole('button',{name:'حفظ الملاحظة محليًا',exact:true}).click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-verse-notes-v1')!));
 expect(stored.notes['1:1'].text).toBe('تدبر تجريبي للآية الأولى');
 await sheet.evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:'/downloads/phase3-sheet-top-360.png'});
 await sheet.getByRole('button',{name:'حفظ الملاحظة محليًا',exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:'/downloads/phase3-sheet-360.png'});
 // الإغلاق يعيد الجلسة كما كانت
 await sheet.getByRole('button',{name:'إغلاق لوحة الفهم',exact:true}).click();
 await expect(ui.locator('h2')).toHaveText('استمع');
 // إعادة الفتح تُظهر الملاحظة المحفوظة ثم حذفها
 await ui.getByRole('button',{name:'فهم الآيات',exact:true}).click();
 await sheet.locator('summary').filter({hasText:'ملاحظاتي الخاصة'}).click();
 await expect(sheet.getByLabel('ملاحظة خاصة عن الآية')).toHaveValue('تدبر تجريبي للآية الأولى');
 await sheet.getByRole('button',{name:'حذف الملاحظة',exact:true}).click();
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-verse-notes-v1')!));
 expect(after.notes['1:1']).toBeUndefined();
});

test('non-Hafs reciters carry a listen-only badge in the library',async({page})=>{
 await page.setViewportSize({width:360,height:900});
 await page.goto('/');
 await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();
 await expect(page.locator('.quran-page')).toBeVisible();
 await page.locator('.quran-section-grid button[data-quran-tab="reciters"]').click();
 await expect(page.locator('.reciters-library')).toBeVisible({timeout:10000});
 await page.getByRole('tab',{name:'ورش وغيرها'}).click();
 const tab=page.getByRole('tab',{name:'ورش وغيرها'});
 await expect(tab).toBeInViewport();
 await expect.poll(()=>tab.evaluate(el=>{const s=getComputedStyle(el);return {fg:s.color,bg:s.backgroundColor};})).toEqual({fg:'rgb(255, 255, 255)',bg:'rgb(23, 74, 60)'});
 await page.locator('.reciters-library ul > li button').first().click(); // reciters are grouped: expand one to list its narrations
 const badge=page.locator('.narration-tag').first();
 await expect(badge).toBeVisible();
 await expect(badge).toContainText('للاستماع فقط');
 await badge.scrollIntoViewIfNeeded();
 await expect(badge).toBeInViewport();
 await page.screenshot({path:'/downloads/phase3-narration-360.png'});
});

test('understanding failure is retryable; source changes retain unsaved notes and Escape restores focus',async({page})=>{
 await page.route('**/api.quran.com/api/v4/tafsirs/**',r=>r.abort());
 await page.route('**/api.quran.com/api/v4/quran/translations/**',r=>r.abort());
 await page.route('**/quran/word-meanings-ar.json',r=>r.abort());
 const ui=await startSession(page);
 await ui.getByRole('button',{name:'فهم الآيات',exact:true}).click();
 const sheet=page.locator('.qm-sheet');
 await expect(sheet.getByRole('button',{name:'إعادة تحميل المصدر',exact:true})).toBeVisible();
 await sheet.getByRole('button',{name:'معاني الكلمات',exact:true}).click();
 await expect(sheet).toContainText('تعذر تحميل معاني الكلمات');
 await expect(sheet.getByRole('button',{name:'إعادة تحميل المصدر',exact:true})).toBeVisible();
 await sheet.getByRole('button',{name:'تفسير',exact:true}).click();
 await sheet.locator('summary').filter({hasText:'ملاحظاتي الخاصة'}).click();
 await sheet.getByLabel('ملاحظة خاصة عن الآية').fill('مسودة غير محفوظة');
 await sheet.getByLabel('التفسير',{exact:true}).selectOption('16');
 await expect(sheet.getByLabel('ملاحظة خاصة عن الآية')).toHaveValue('مسودة غير محفوظة');
 page.once('dialog',d=>d.accept());await page.keyboard.press('Escape');
 await expect(sheet).toHaveCount(0);
 await expect(ui.getByRole('button',{name:'فهم الآيات',exact:true})).toBeFocused();
});

test('private notes remain local and Quran content cache is reused offline',async({page,context})=>{
 await mockUnderstandingApis(page);const ui=await startSession(page);
 await ui.getByRole('button',{name:'فهم الآيات',exact:true}).click();
 const sheet=page.locator('.qm-sheet');
 await expect(sheet).toContainText('نص تفسير تجريبي');
 await sheet.getByRole('button',{name:'ترجمة',exact:true}).click();
 await expect(sheet).toContainText('Sample translation text.');
 await page.getByRole('button',{name:'إغلاق لوحة الفهم'}).click();
 await context.setOffline(true);
 await ui.getByRole('button',{name:'فهم الآيات',exact:true}).click();
 await expect(sheet).toContainText('نص تفسير تجريبي');
 await expect(sheet).not.toContainText('Sample translation text.');
 await sheet.getByRole('button',{name:'ترجمة',exact:true}).click();
 await expect(sheet).toContainText('Sample translation text.');
});
