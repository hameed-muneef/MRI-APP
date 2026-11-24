import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const srv = createServer((req,res)=>{ let f = join('dist', decodeURIComponent(new URL(req.url,'http://x').pathname)); if (!existsSync(f)||statSync(f).isDirectory()) f = join('dist','index.html'); try { res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(readFileSync(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise(r=>srv.listen(4185,r));
const b = await chromium.launch({ channel:'chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, geolocation:{latitude:30.04,longitude:31.23}, permissions:['geolocation'] });
const p = await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('http://127.0.0.1:4185/',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
const nav=async i=>{await p.evaluate(i=>{[...document.querySelectorAll('.mobile-nav button,.mobile-nav a')][i]?.click()},i);await p.waitForTimeout(1500)};


const clickT=async(t,sel='#root button')=>{const ok=await p.evaluate(([t,sel])=>{const e=[...document.querySelectorAll(sel)].find(e=>e.offsetParent&&(e.innerText||e.getAttribute('aria-label')||'').trim().includes(t));if(e){e.click();return true}return false},[t,sel]);console.log(ok?'click':'MISS',t);await p.waitForTimeout(700);};
const ui=()=>p.evaluate(()=>({inputs:[...document.querySelectorAll('#root input,#root textarea')].filter(e=>e.offsetParent).map(e=>e.type+':'+(e.placeholder||e.getAttribute('aria-label')||'')),btns:[...document.querySelectorAll('#root button')].filter(e=>e.offsetParent).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,24)).filter(Boolean).slice(0,30)}));

const state=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rabbani-v1')||'{}');return JSON.stringify({tasks:(s.tasks||[]).map(t=>[t.title,t.period,t.done,t.scheduledDate||null]),sch:Object.keys(s.taskSchedules||{}).length})});
const setIn=(sel,v)=>p.evaluate(([sel,v])=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);

await p.waitForTimeout(4000);
await p.evaluate(()=>document.querySelector('.topbar-settings').click());await p.waitForTimeout(2000);
const vis=()=>p.evaluate(()=>[...document.querySelectorAll('input[type=search]')].map(e=>!!e.offsetParent));



const tab=async t=>{await p.locator('[role=tab]',{hasText:t}).first().click();await p.waitForTimeout(2000)};
const ctl=()=>p.evaluate(()=>[...document.querySelectorAll('main input,main select,main [role=switch]')].filter(e=>e.offsetParent||e.type==='checkbox').map((e,i)=>i+':'+e.tagName[0]+':'+(e.type||e.getAttribute('role'))+':'+(e.getAttribute('aria-label')||e.closest('label')?.innerText?.trim().slice(0,25)||'')+'='+(e.type==='checkbox'||e.getAttribute('role')==='switch'?(e.checked??e.getAttribute('aria-checked')):e.value)));

await tab('المنبهات');
await p.locator('main button',{hasText:'تذكيرات المهام المجدولة'}).first().click();await p.waitForTimeout(1500);
const btns=()=>p.evaluate(()=>[...document.querySelectorAll('main button')].filter(e=>e.offsetParent).map(e=>e.textContent.trim().replace(/\s+/g,' ').slice(0,24)).slice(5,40));

const lead=()=>p.locator('main input[type=number]').first().inputValue();
const toast=async()=>(await p.evaluate(()=>document.body.innerText)).match(/حُفظت[^\n]*/)?.[0];
await p.locator('main button',{hasText:'قبل 30 د'}).click();await p.locator('main input[type=number]').first().fill('7');
await p.locator('main button',{hasText:'حفظ التغييرات'}).click();await p.waitForTimeout(1500);console.log('saved lead 7 toast',await toast(),'value',await lead());
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(3000);await p.locator('.topbar-settings').click();await p.waitForTimeout(1200);await tab('المنبهات');
await p.locator('main button',{hasText:'تذكيرات المهام المجدولة'}).first().click();await p.waitForTimeout(1200);console.log('lead after reload',await lead());
// templates
await p.locator('main button',{hasText:'منبهاتي الشخصية'}).first().click();await p.waitForTimeout(1200);
await p.locator('main button',{hasText:'أذكار الصباح'}).first().click();await p.waitForTimeout(1200);
console.log('after template',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('main input,main select,main textarea')].filter(e=>e.offsetParent).map(e=>e.type+'='+e.value))),JSON.stringify(await btns()));
await p.locator('main button',{hasText:'إضافة المنبه'}).click();await p.waitForTimeout(1500);
const card=()=>p.evaluate(()=>{const t=document.querySelector('main').innerText.replace(/\s+/g,' ');const m=t.match(/المنبهات الشخصية (\d+)[^]*?(?=قوالب يومية)/);return m?m[0].slice(0,400):t.slice(0,100)});
const A=n=>p.locator('main button[aria-label*="'+n+'"]');
const reloadAlarms=async()=>{await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(3000);await p.locator('.topbar-settings').click();await p.waitForTimeout(1200);await tab('المنبهات');};
console.log('1 added',await card());
// disable
await A('إيقاف أذكار الصباح').click();await p.waitForTimeout(800);console.log('2 disabled labels',await p.evaluate(()=>[...document.querySelectorAll('main button[aria-label*="أذكار الصباح"]')].map(b=>b.getAttribute('aria-label'))));
await reloadAlarms();console.log('3 after reload disabled?',await p.evaluate(()=>[...document.querySelectorAll('main button[aria-label*="أذكار الصباح"]')].map(b=>b.getAttribute('aria-label'))));
// enable back
await p.locator('main button[aria-label^="تشغيل أذكار الصباح"],main button[aria-label^="تفعيل أذكار الصباح"]').first().click().catch(e=>console.log('enable click miss'));await p.waitForTimeout(800);
// edit
await A('تعديل أذكار الصباح').click();await p.waitForTimeout(1000);
const title=p.locator('main input[type=text]').first();await title.fill('أذكار الصباح معدّل');
const tm=p.locator('main input[type=time]').first();await tm.fill('07:15');
await p.locator('main button',{hasText:/حفظ التعديل|حفظ|تحديث المنبه/}).first().click();await p.waitForTimeout(1500);console.log('4 edited',await card());
await reloadAlarms();console.log('5 edit persists',await card());
// snooze
await A('تأجيل').first().click();await p.waitForTimeout(1000);console.log('6 snooze',await card());
// copy
await A('نسخ').first().click();await p.waitForTimeout(1000);console.log('7 copy',await card());
await p.screenshot({path:'/tmp/shots/alarm-ops.png'});
await reloadAlarms();console.log('8 after reload',await card());
// delete all created
for(let i=0;i<4;i++){const d=A('حذف');if(!(await d.count()))break;await d.first().click();await p.waitForTimeout(500);const c=p.locator('main button,[role=dialog] button',{hasText:/تأكيد الحذف|^حذف$|نعم/});if(await c.count())await c.last().click().catch(()=>{});await p.waitForTimeout(800);}
console.log('9 after deletes',await card());
await reloadAlarms();console.log('10 after reload',await card(),'| empty state:',(await p.evaluate(()=>document.querySelector('main').innerText)).includes('لا توجد منبهات'));
await b.close();srv.close();
