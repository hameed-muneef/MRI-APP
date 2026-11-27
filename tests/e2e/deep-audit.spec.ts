import {test,expect} from '@playwright/test';

test.use({viewport:{width:400,height:850},timezoneId:'Africa/Cairo'});

test('routine tasks change at midnight without reloading the app',async({page})=>{
 await page.clock.install({time:new Date('2026-11-23T23:59:00+02:00')});
 await page.goto('/');
 await page.evaluate(async()=>{
  const path='/src/app-state.ts';const {createSeed}=await import(/* @vite-ignore */path);
  const state=createSeed();
  state.quran.routine=[{id:'monday',kind:'reflection',slot:'any',days:[1],enabled:true,config:{},createdAt:'',updatedAt:''},{id:'tuesday',kind:'quran_reading',slot:'any',days:[2],enabled:true,config:{surah:1,ayahFrom:1,ayahTo:7},createdAt:'',updatedAt:''}];
  localStorage.setItem('rabbani-v1',JSON.stringify(state));
 });
 await page.reload();
 const ids=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-v1')!).tasks.map((t:{id:string})=>t.id).filter((id:string)=>id.startsWith('quran:')));
 await expect.poll(ids).toEqual(['quran:monday']);
 await page.clock.fastForward(120000);
 await expect.poll(ids).toEqual(['quran:tuesday']);
 await page.screenshot({path:'test-results/routine-rollover.png'});
});

test('malformed saved nested state cannot brick startup',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('rabbani-v1',JSON.stringify({tasks:[null],quran:{settings:null,routine:{}}})));
 await page.goto('/');await expect(page.locator('.home-dashboard')).toBeVisible();
 await page.reload();await expect(page.locator('.home-dashboard')).toBeVisible();expect(errors).toEqual([]);
});

test('malformed backup is rejected without changing saved data',async({page})=>{
 await page.goto('/');
 // let the app finish its first state write so "before" is the settled value
 await expect.poll(()=>page.evaluate(()=>Boolean(localStorage.getItem('rabbani-v1')))).toBe(true);
 await page.waitForTimeout(1500);
 const result=await page.evaluate(async()=>{
  const before=localStorage.getItem('rabbani-v1');
  const path='/src/local-backup.ts';const {importLocalBackup}=await import(/* @vite-ignore */path);
  let rejected=false;try{importLocalBackup(JSON.stringify({app:'al-rabbaniyyun-local',version:1,storage:{'rabbani-v1':JSON.stringify({quran:{passages:[null]}})}}))}catch{rejected=true}
  return {rejected,unchanged:before===localStorage.getItem('rabbani-v1')};
 });expect(result).toEqual({rejected:true,unchanged:true});
});
