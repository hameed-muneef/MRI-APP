import {test,expect} from '@playwright/test';
async function setup(page:import('@playwright/test').Page){
 await page.addInitScript(()=>{
  const Original=window.Audio;
  (window as unknown as {__audios:HTMLAudioElement[]}).__audios=[];
  window.Audio=function(src?:string){const a=new Original(src);(window as unknown as {__audios:HTMLAudioElement[]}).__audios.push(a);return a;} as typeof Audio;
 });
 await page.route('**/api.quran.com/api/v4/recitations/*/by_ayah/*',route=>{const key=route.request().url().split('/by_ayah/')[1];return route.fulfill({contentType:'application/json',body:JSON.stringify({audio_files:[{url:`https://verses.quran.com/transport/${key}.wav`}]})});});
 const rate=8000,duration=4,bytes=Buffer.alloc(44+rate*duration*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);
 await page.route('**/verses.quran.com/transport/**',r=>r.fulfill({contentType:'audio/wav',body:bytes}));
 await page.goto('/');await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();await page.locator('[data-quran-tab="hifz"]').click();await page.locator('[data-hifz-detailed]').click();const ui=page.locator('.qm-workspace').first();await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();return ui;
}
const audio=(page:import('@playwright/test').Page)=>page.evaluate(()=>{const a=(window as unknown as {__audios:HTMLAudioElement[]}).__audios.at(-1);if(!a)return {time:0,paused:true,rate:1,src:''};return {time:a.currentTime,paused:a.paused,rate:a.playbackRate,src:a.src};});
test('true pause/resume preserves time, rate and evidence; navigation interrupts without a completed play',async({page},info)=>{
 const ui=await setup(page);await expect(ui.getByRole('button',{name:'الآية السابقة',exact:true})).toBeDisabled();
 await ui.getByLabel('سرعة التشغيل',{exact:true}).selectOption('.75'.replace(/^\./,'0.'));
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).first().click();await expect.poll(async()=>(await audio(page)).time).toBeGreaterThan(.3);
 await ui.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();const before=await audio(page);expect(before.rate).toBe(.75);expect(before.paused).toBe(true);
 await page.waitForTimeout(400);expect((await audio(page)).time).toBeCloseTo(before.time,1);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).repetitionEvents.at(-1).completed)).toBe(0);
 await ui.getByRole('button',{name:'استكمال من نفس الموضع',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`/downloads/audio-paused-${info.project.name}.png`});
 await ui.getByRole('button',{name:'استكمال من نفس الموضع',exact:true}).click();await expect.poll(async()=>(await audio(page)).time).toBeGreaterThan(before.time+.15);
 await ui.getByLabel('سرعة التشغيل',{exact:true}).selectOption('1.25');expect((await audio(page)).rate).toBe(1.25);
 await ui.getByRole('button',{name:'الآية التالية',exact:true}).click();await expect(ui).toContainText('الآية المحددة: ٢');await expect(ui.locator('.qm-current-verse')).toHaveCount(0);
 const events=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).repetitionEvents);expect(events.at(-1).completed).toBe(0);expect(events.at(-1).interrupted).toBe(1);
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).first().click();await expect.poll(async()=>(await audio(page)).src).toContain('1:2.wav');
 await ui.getByRole('button',{name:'الآية السابقة',exact:true}).click();await expect(ui).toContainText('الآية المحددة: ١');await expect(ui.getByRole('button',{name:'الآية السابقة',exact:true})).toBeDisabled();
});
test('whole-passage replay begins at first verse after manual next selection',async({page})=>{
 const ui=await setup(page);await ui.getByRole('button',{name:'الآية التالية',exact:true}).click();await ui.locator('.qm-fields select').nth(2).selectOption('passage');await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).first().click();await expect.poll(async()=>(await audio(page)).src).toContain('1:1.wav');
});
test('reciter comparison is available in recall and invalidates unassisted evidence',async({page})=>{
 const ui=await setup(page);for(let i=0;i<4;i++)await ui.getByRole('button',{name:/التالي:/}).click();await expect(ui.locator('h2')).toHaveText('سمّع من ذاكرتك');
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).first().click();await expect(ui).toContainText('تشغيل القارئ للمقارنة مساعدة');
 const attempts=await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).recallAttempts);expect(attempts.at(-1).helpEvents.length).toBeGreaterThan(0);
 await ui.getByRole('button',{name:'أنهيت محاولة الاسترجاع، انتقل للتقييم',exact:true}).click();await expect(ui.locator('.qm-current-verse')).toHaveCount(0);await expect(ui).toContainText('لن تبني دليل إتقان مستقلًا');
});
test('pause during URL loading prevents autoplay until resume',async({page})=>{
 const ui=await setup(page);await page.route('**/api.quran.com/api/v4/recitations/*/by_ayah/*',async route=>{await new Promise(r=>setTimeout(r,700));await route.fulfill({contentType:'application/json',body:JSON.stringify({audio_files:[{url:'https://verses.quran.com/transport/pending.wav'}]})});});
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).first().click();await ui.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();await page.waitForTimeout(1000);expect((await audio(page)).time).toBe(0);
 await ui.getByRole('button',{name:'استكمال من نفس الموضع',exact:true}).click();await expect.poll(async()=>(await audio(page)).time).toBeGreaterThan(.1);
});
test('pause in inter-verse gap holds progression without duplicate completion',async({page})=>{
 const ui=await setup(page);await ui.getByLabel('مرات التكرار',{exact:true}).fill('1');await ui.getByLabel('وقفة بين الآيات (ثوانٍ)',{exact:true}).fill('2');await ui.getByLabel('سرعة التشغيل',{exact:true}).selectOption('2');
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).first().click();await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).repetitionEvents[0].completed)).toBe(1);
 await ui.getByRole('button',{name:'إيقاف مؤقت',exact:true}).click();await page.waitForTimeout(2200);expect((await audio(page)).time).toBe(0);
 await ui.getByRole('button',{name:'استكمال من نفس الموضع',exact:true}).click();await expect.poll(async()=>(await audio(page)).src).toContain('1:2.wav');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).repetitionEvents[0].completed)).toBe(1);
});
