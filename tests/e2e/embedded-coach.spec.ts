import {test,expect,type Page} from '@playwright/test';

// Embedded coach, Today/Tasks/Settings. Chrome at mobile width, not a device.
const read=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-v1')!));
const switchName='النظام الذكي';

test.describe('embedded coach: master switch',()=>{
  test.use({viewport:{width:400,height:850},timezoneId:'Africa/Cairo'});

  test('on by default, mute in Settings sticks after reload, and the schedule data is untouched',async({page})=>{
    await page.goto('/');
    await page.evaluate(async()=>{
      const {createSeed}=await import(/* @vite-ignore */ '/src/app-state.ts');
      const state=createSeed();
      state.goals=[{id:'g1',title:'هدف',benefit:'نفع',createdAt:'2026-09-01',steps:[{id:'s1',title:'خطوة',period:'daily',done:{}}]}];
      localStorage.setItem('rabbani-v1',JSON.stringify(state));
    });
    await page.reload();
    await expect.poll(async()=>(await read(page)).coachSettings?.suggestionsMuted).toBe(false);
    const before=await read(page);
    await page.locator('button.topbar-settings').click();
    const sw=page.getByRole('switch',{name:switchName});
    await expect(sw).toBeChecked();
    await sw.uncheck();
    await expect.poll(async()=>(await read(page)).coachSettings?.suggestionsMuted).toBe(true);
    const after=await read(page);
    expect(after.coachSettings.globalEnabled).toBe(false);
    expect(after.goals).toEqual(before.goals);
    expect(after.taskSchedules??{}).toEqual(before.taskSchedules??{});
    await page.reload();
    await page.waitForTimeout(800);
    expect((await read(page)).coachSettings.suggestionsMuted).toBe(true);
  });

  test('a legacy opt-out stays off',async({page})=>{
    await page.goto('/');
    await page.evaluate(async()=>{
      const {createSeed}=await import(/* @vite-ignore */ '/src/app-state.ts');
      const state=createSeed();
      state.coachSettings={globalEnabled:false,enabledAt:'2026-11-01'};
      localStorage.setItem('rabbani-v1',JSON.stringify(state));
    });
    await page.reload();
    await page.waitForTimeout(800);
    const s=await read(page);
    expect(s.coachSettings.globalEnabled).toBe(false);
    expect(s.coachSettings.suggestionsMuted).toBeUndefined();
    await page.locator('button.topbar-settings').click();
    await expect(page.getByRole('switch',{name:switchName})).not.toBeChecked();
  });
});
