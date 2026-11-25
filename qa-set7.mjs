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

await tab('الهدوء');
await p.locator('main input[type=checkbox]').nth(1).check();await p.locator('main input[type=checkbox]').nth(2).check();
const sels=p.locator('main select');console.log('select options',JSON.stringify(await sels.nth(0).evaluate(e=>[...e.options].map(o=>o.value))));
await p.locator('main button',{hasText:'حفظ'}).first().click();await p.waitForTimeout(1500);console.log('toast',(await p.evaluate(()=>document.body.innerText)).match(/حُفظت[^\n]*/)?.[0]);console.log('QUIET set',JSON.stringify(await ctl()));
await tab('الأذان');
await p.locator('main input[type=checkbox]').nth(0).uncheck();
const opts=await p.locator('main select').first().evaluate(e=>[...e.options].map(o=>o.value));console.log('adhan opts',JSON.stringify(opts));
await p.locator('main select').first().selectOption(opts.find(v=>v!=='almulla'));
await p.waitForTimeout(800);console.log('ADHAN set',JSON.stringify((await ctl()).slice(0,8)));
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(3000);
await p.locator('.topbar-settings').click();await p.waitForTimeout(1500);
await tab('الهدوء');console.log('QUIET reload',JSON.stringify(await ctl()));
await tab('الأذان');console.log('ADHAN reload',JSON.stringify((await ctl()).slice(0,8)));
await b.close();srv.close();
