import {test,expect,type Page} from '@playwright/test';

// Unified coach phase 3 (habits and wirds). Fixture state in Chrome, not a device.
async function open(page:Page,wird:string){
  await page.clock.install({time:new Date('2026-11-26T10:00:00+02:00')});
  await page.goto('/');
  await page.evaluate(async w=>{
    const {createSeed}=await import(/* @vite-ignore */ '/src/app-state.ts');
    const state=createSeed();state.coachSettings={globalEnabled:false,enabledAt:'2026-11-01',suggestionsMuted:true};state.wirds=[JSON.parse(w)];
    localStorage.setItem('rabbani-v1',JSON.stringify(state));
  },wird);
  await page.reload();
  await page.locator('.mobile-nav').getByRole('button',{name:'المحاسبة'}).click();
  await page.getByRole('tab',{name:'زكِّ نفسك'}).click();
}
const wirds=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-v1')!).wirds);
const base={id:'w1',title:'استغفار',target:100,count:0,period:'daily',periodKey:'2026-11-26'};

test.describe('unified coach: habits and wirds',()=>{
  test.use({viewport:{width:400,height:850},timezoneId:'Africa/Cairo'});
  test('suggestions muted: stores nothing',async({page})=>{
    await open(page,JSON.stringify(base));
    await expect(page.getByRole('switch',{name:/تفعيل المدرّب لورد/})).not.toBeChecked();
    await page.getByRole('button',{name:'+10'}).first().click();
    expect((await wirds(page))[0].coach).toBeUndefined();
  });
  test('on: logs a reached target, suggestion accept changes only the target, persists',async({page})=>{
    await open(page,JSON.stringify({...base,count:90,coach:{enabled:true,enabledAt:'2026-09-01',log:['2026-11-10']}}));
    const card=page.getByRole('group',{name:'اقتراح المدرّب'}).filter({hasText:'اقتراح تنظيمي'});
    await expect(card).toHaveCount(1);
    await card.getByRole('button',{name:'أقبل'}).click();
    await expect.poll(async()=>(await wirds(page))[0].target).toBe(75);
    // count 90 now meets the new target 75, so the day is logged
    await expect.poll(async()=>(await wirds(page))[0].coach.log).toContain('2026-11-26');
    expect((await wirds(page))[0].count).toBe(90);
    const box=await page.locator('.wird-card').first().boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(400);
    await page.screenshot({path:'/tmp/coach-habit.png'});
    await page.reload();await page.waitForTimeout(800);
    expect((await wirds(page))[0].target).toBe(75);
  });
});
