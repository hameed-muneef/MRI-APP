import {test,expect,type Page} from '@playwright/test';

// Unified coach, phase 1 (goals). Fixture state only; runs in the browser, not on a device.
async function seedGoal(page:Page){
  await page.clock.install({time:new Date('2026-11-26T10:00:00+02:00')});
  await page.goto('/');
  await page.evaluate(async()=>{
    const {createSeed}=await import(/* @vite-ignore */ '/src/app-state.ts');
    const state=createSeed();
    state.goals=[{id:'g1',title:'قراءة كتاب نافع',benefit:'العلم',createdAt:'2026-09-01',steps:[{id:'s1',title:'قراءة صفحة',period:'daily',done:{'2026-11-10':true}}]}];
    localStorage.setItem('rabbani-v1',JSON.stringify(state));
  });
  await page.reload();
  await page.locator('.mobile-nav').getByRole('button',{name:'حياتي'}).click();
  await page.locator('.section-subnav').getByRole('button',{name:'المؤمن القوي'}).click();
  await page.getByRole('button',{name:'عرض الخطة'}).first().click();
}
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-v1')!).goals[0]);

test.describe('unified coach: goals',()=>{
  test.use({viewport:{width:400,height:850},timezoneId:'Africa/Cairo'});

  test('off by default, no suggestions, nothing stored',async({page})=>{
    await seedGoal(page);
    await expect(page.getByRole('switch',{name:/تفعيل المدرّب/})).not.toBeChecked();
    await expect(page.getByRole('group',{name:'اقتراح المدرّب'})).toHaveCount(0);
    expect((await stored(page)).coach).toBeUndefined();
  });

  test('enabling starts the evidence window today, so no suggestion yet',async({page})=>{
    await seedGoal(page);
    await page.getByRole('switch',{name:/تفعيل المدرّب/}).check();
    await expect.poll(async()=>(await stored(page)).coach?.enabled).toBe(true);
    // enabling starts the evidence window today, so a goal with only old history says nothing yet.
    await expect(page.getByRole('group',{name:'اقتراح المدرّب'})).toHaveCount(0);
  });

  test('on with an earlier start: lighten, accept, persists after reload',async({page})=>{
    await seedGoal(page);
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rabbani-v1')!);s.goals[0].coach={enabled:true,enabledAt:'2026-09-01'};localStorage.setItem('rabbani-v1',JSON.stringify(s))});
    await page.reload();
    await page.locator('.mobile-nav').getByRole('button',{name:'حياتي'}).click();
    await page.locator('.section-subnav').getByRole('button',{name:'المؤمن القوي'}).click();
    await page.getByRole('button',{name:'عرض الخطة'}).first().click();
    const card=page.getByRole('group',{name:'اقتراح المدرّب'}).filter({hasText:'اجعلها'});
    await expect(card).toHaveCount(1);
    await card.getByRole('button',{name:'أقبل'}).click();
    await expect.poll(async()=>(await stored(page)).steps[0].period).toBe('weekly');
    expect((await stored(page)).steps[0].done).toEqual({'2026-11-10':true});
    await page.reload();
    expect((await stored(page)).steps[0].period).toBe('weekly');
  });

  test('keep dismisses without changing the plan',async({page})=>{
    await seedGoal(page);
    await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rabbani-v1')!);s.goals[0].coach={enabled:true,enabledAt:'2026-09-01'};localStorage.setItem('rabbani-v1',JSON.stringify(s))});
    await page.reload();
    await page.locator('.mobile-nav').getByRole('button',{name:'حياتي'}).click();
    await page.locator('.section-subnav').getByRole('button',{name:'المؤمن القوي'}).click();
    await page.getByRole('button',{name:'عرض الخطة'}).first().click();
    await page.getByRole('group',{name:'اقتراح المدرّب'}).filter({hasText:'اجعلها'}).getByRole('button',{name:'أبقها كما هي'}).click();
    await expect(page.getByRole('group',{name:'اقتراح المدرّب'}).filter({hasText:'اجعلها'})).toHaveCount(0);
    const g=await stored(page);
    expect(g.steps[0].period).toBe('daily');
    expect(g.coach.dismissed.length).toBeGreaterThan(0);
    const box=await page.locator('.goal-coach').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x+box!.width).toBeLessThanOrEqual(400);
    await page.screenshot({path:'/tmp/coach-mobile.png'});
  });
});
