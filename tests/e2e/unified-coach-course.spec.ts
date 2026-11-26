import {test,expect,type Page} from '@playwright/test';

// Unified coach phase 2 (course tasks). Uses the real plan activation flow; runs in Chrome, not on a device.
const PLAN_KEY='rabbani-bilquran-plan-v1';
async function activate(page:Page){
  await page.goto('/');
  await page.locator('.mobile-nav button',{hasText:'القرآن'}).click();
  await page.locator('.quran-section-grid button[data-quran-tab="hifz"]').click();
  await expect(page.locator('.hf-entry')).toBeVisible({timeout:15_000});
  await page.locator('.hf-plan-launch').click();
  await page.locator('.hf-plan-card button',{hasText:'معاينة الجدول'}).first().click();
  await page.locator('.hf-plan-preview-actions .hf-ok').click();
  await expect(page.locator('.hf-reading')).toBeVisible({timeout:15_000});
}
const read=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-v1')!));
async function openTasks(page:Page){
  await page.locator('.mobile-nav').getByRole('button',{name:'حياتي'}).click();
  await page.locator('.section-subnav').getByRole('button',{name:'مهام اليوم'}).click();
}
async function prepare(page:Page){
  await page.clock.setFixedTime(new Date('2026-11-20T09:00:00'));
  await activate(page);
  await page.evaluate(k=>{const p=JSON.parse(localStorage.getItem(k)!);p.currentIndex=9;p.completedIndices=[0,1,2,3,4,5,6,7,8];p.updatedAt='2026-11-19T08:00:00';localStorage.setItem(k,JSON.stringify(p))},PLAN_KEY);
  await page.clock.setFixedTime(new Date('2026-11-30T09:00:00'));
  await page.reload();
  await expect.poll(async()=>(await read(page)).tasks.filter((t:{plan?:unknown})=>t.plan).length,{timeout:15_000}).toBe(3);
}

test.describe('unified coach: course tasks',()=>{
  test.use({viewport:{width:400,height:850},timezoneId:'Africa/Cairo'});
  test('off by default, nothing logged and no list',async({page})=>{
    await prepare(page);await openTasks(page);
    await expect(page.getByRole('switch',{name:'تفعيل المدرّب لمهام المقرر'})).not.toBeChecked();
    await expect(page.getByText('ابدأ من هنا')).toHaveCount(0);
    expect((await read(page)).courseCoach).toBeUndefined();
  });
  test('on: logs the finished week once, lists the rest, persists',async({page})=>{
    await prepare(page);
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rabbani-v1')!);
      s.goals=[{id:'g1',title:'قراءة كتاب',benefit:'علم',createdAt:'2026-09-01',coach:{enabled:true,enabledAt:'2026-09-01'},steps:[{id:'s1',title:'صفحة',period:'daily',done:{}}]}];
      s.courseCoach={enabled:true,enabledAt:'2026-09-01',dismissed:[],log:{}};
      s.tasks=s.tasks.map((t:{plan?:{kind:string};weekStart?:string})=>t.plan?.kind==='week'?{...t,done:true,doneKey:t.weekStart}:t);
      localStorage.setItem('rabbani-v1',JSON.stringify(s))});
    await page.reload();
    await expect.poll(async()=>(await read(page)).courseCoach?.log?.week).toEqual(['2026-11-30']);
    await openTasks(page);
    await expect(page.getByRole('switch',{name:'تفعيل المدرّب لمهام المقرر'})).toBeChecked();
    await expect(page.locator('.coach-today-list li').filter({hasText:'صفحة'})).toHaveCount(1);
    await expect(page.locator('.coach-today-list li').filter({hasText:'مراجعة الشهر'})).toHaveCount(1);
    await expect(page.locator('.coach-today-list li').filter({hasText:'مراجعة ربط الأسبوع'})).toHaveCount(0);
    const box=await page.locator('.coach-today').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(400);
    await page.screenshot({path:'/tmp/coach-course.png'});
    await page.reload();await page.waitForTimeout(1200);
    expect((await read(page)).courseCoach.log.week).toEqual(['2026-11-30']);
  });
});
