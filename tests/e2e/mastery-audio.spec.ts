import {expect,test} from '@playwright/test';

// Deterministic browser tests for the Phase 2 repetition player.
// Audio responses are controlled: the Quran.com resolution API and the audio
// bytes are intercepted, so sequencing, error handling and no-skip behavior
// are verified without depending on the network. A separate live check below
// probes the real source and skips itself when the sandbox has no route to it.

const WAV_B64='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';
const wavBytes=()=>Buffer.from(WAV_B64,'base64');

type MockState={failApi:boolean;failAudio:boolean;requests:string[]};
async function mockAudio(page:import('@playwright/test').Page,state:MockState){
 await page.route('**/api.quran.com/api/v4/recitations/*/by_ayah/*',async route=>{
  if(state.failApi)return route.fulfill({status:500,body:'unavailable'});
  const key=route.request().url().split('/by_ayah/')[1];
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_files:[{url:`https://verses.quran.com/mock/${key.replace(':','_')}.wav`}]})});
 });
 await page.route('**/verses.quran.com/mock/**',async route=>{
  state.requests.push(route.request().url());
  if(state.failAudio)return route.abort();
  return route.fulfill({status:200,contentType:'audio/wav',headers:{'Cache-Control':'no-store'},body:wavBytes()});
 });
}
async function startListenStage(page:import('@playwright/test').Page){
 await page.setViewportSize({width:360,height:900});
 await page.goto('/');
 await page.locator('.mobile-nav button').filter({hasText:'القرآن'}).first().click();
 await page.locator('[data-quran-tab="hifz"]').click();
 const ui=page.locator('.qm-workspace');
 await ui.getByRole('button',{name:'ابدأ الحفظ',exact:true}).click();
 await expect(ui.locator('h2')).toHaveText('استمع');
 return ui;
}
const readEvents=(page:import('@playwright/test').Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('rabbani-mastery-v1')!).repetitionEvents);

test('repetition sequencing: per-ayah scope, 3 repeats, auto-advance, completed plays only',async({page})=>{
 const state:MockState={failApi:false,failAudio:false,requests:[]};
 await mockAudio(page,state);
 const ui=await startListenStage(page);
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).click();
 await expect(ui).toContainText('اكتمل التكرار المحدد.',{timeout:20000});
 const events=await readEvents(page);
 expect(events).toHaveLength(3);
 expect(events.map((e:{groupRefs:string[]})=>e.groupRefs)).toEqual([['1:1'],['1:2'],['1:3']]);
 for(const e of events as {configured:number;completed:number;interrupted:number;scope:string;reciterId:number}[]){
  expect(e.scope).toBe('verse');expect(e.configured).toBe(3);expect(e.completed).toBe(3);expect(e.interrupted).toBe(0);expect(e.reciterId).toBe(7);
 }
 // Real <audio> network path exercised per verse, in verse order (ayah 1 plays before ayah 2 before ayah 3).
 const first=(frag:string)=>state.requests.findIndex(u=>u.includes(frag));
 expect(first('1_1.wav')).toBeGreaterThanOrEqual(0);
 expect(first('1_1.wav')).toBeLessThan(first('1_2.wav'));
 expect(first('1_2.wav')).toBeLessThan(first('1_3.wav'));
 // Every verse was actually played at least its configured repeats through the mocked source.
 for(const frag of ['1_1.wav','1_2.wav','1_3.wav'])expect(state.requests.filter(u=>u.includes(frag)).length).toBeGreaterThanOrEqual(3);
});

test('audio errors fail visibly, never skip the verse, and retry resumes the same verse',async({page})=>{
 const state:MockState={failApi:true,failAudio:false,requests:[]};
 await mockAudio(page,state);
 const ui=await startListenStage(page);
 // 1) Resolution failure: no playback is counted.
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).click();
 await expect(ui).toContainText('الصوت غير متاح');
 let events=await readEvents(page);
 expect(events).toHaveLength(1);expect(events[0].completed).toBe(0);
 // 2) Playback error after successful resolution: visible failure, position unchanged.
 state.failApi=false;state.failAudio=true;
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).click();
 await expect(ui).toContainText('تعذر تشغيل التلاوة. لم نتجاوز الآية ولم يُحسب تشغيل.');
 events=await readEvents(page);
 expect(events).toHaveLength(2);
 expect(events[1].completed).toBe(0);
 expect(events[1].groupRefs).toEqual(['1:1']);
 await expect(ui).toContainText('المكتمل في النطاق الحالي: ٠');
 // 3) Recovery: pressing play again restarts the SAME verse (no skip), then completes the range.
 state.failAudio=false;
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).click();
 await expect(ui).toContainText('اكتمل التكرار المحدد.',{timeout:20000});
 events=await readEvents(page);
 expect(events).toHaveLength(5);
 expect(events.slice(2).map((e:{groupRefs:string[]})=>e.groupRefs)).toEqual([['1:1'],['1:2'],['1:3']]);
 expect(events.slice(2).every((e:{completed:number})=>e.completed===3)).toBe(true);
});

test('live source check: Quran.com per-ayah audio resolves and serves bytes',async({request})=>{
 let api;
 try{api=await request.get('https://api.quran.com/api/v4/recitations/7/by_ayah/1:1',{timeout:15000});}
 catch{test.skip(true,'live audio source unreachable from this environment');return;}
 if(!api.ok()){test.skip(true,`live resolution API returned ${api.status()}`);return;}
 const body=await api.json();
 const raw=body?.audio_files?.[0]?.url;
 expect(raw,'resolution API must return an audio url').toBeTruthy();
 const url=String(raw).startsWith('http')?String(raw):`https://verses.quran.com/${String(raw).replace(/^\/+/,'')}`;
 const audio=await request.get(url,{timeout:20000});
 expect(audio.ok(),'resolved audio URL must serve bytes').toBe(true);
 const bytes=await audio.body();
 expect(bytes.length).toBeGreaterThan(1000);
});


test('reciter change cancels a stale resolution, preserves verse and completed repeats',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api.quran.com/api/v4/recitations/*/by_ayah/*',async route=>{
  const url=route.request().url();requests.push(url);
  if(url.includes('/recitations/7/')){await new Promise(r=>setTimeout(r,1000));if(route.request().failure())return;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({audio_files:[{url:'https://verses.quran.com/mock/switch.wav'}]})}).catch(()=>{});
 });
 await page.route('**/verses.quran.com/mock/**',route=>route.fulfill({status:200,contentType:'audio/wav',body:wavBytes()}));
 const ui=await startListenStage(page);
 await ui.getByRole('button',{name:'تشغيل التكرار',exact:true}).click();
 await expect.poll(()=>requests.length).toBeGreaterThan(0);
 await ui.getByLabel('القارئ',{exact:true}).selectOption('6');
 await expect(ui).toContainText('اكتمل التكرار المحدد.',{timeout:20000});
 const events=await readEvents(page);
 expect(events.map((e:{groupRefs:string[]})=>e.groupRefs)).toEqual([['1:1'],['1:2'],['1:3']]);
 expect(events.every((e:{completed:number})=>e.completed===3)).toBe(true);
 expect(events[0].reciterHistory.map((h:{reciterId:number})=>h.reciterId)).toEqual([7,6]);
 expect(requests.some(u=>u.includes('/recitations/6/by_ayah/1:1'))).toBe(true);
});
