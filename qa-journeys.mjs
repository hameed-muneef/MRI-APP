import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const srv = createServer((req,res)=>{ let f = join('dist', decodeURIComponent(new URL(req.url,'http://x').pathname)); if (!existsSync(f)||statSync(f).isDirectory()) f = join('dist','index.html'); try { res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(readFileSync(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise(r=>srv.listen(4185,r));
const b = await chromium.launch({ channel:'chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message.slice(0,100)));
await p.goto('http://127.0.0.1:4185/',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
const nav=async i=>{await p.evaluate(i=>{[...document.querySelectorAll('.mobile-nav button,.mobile-nav a')][i]?.click()},i);await p.waitForTimeout(1500)};


const clickT=async(t,sel='#root button')=>{const ok=await p.evaluate(([t,sel])=>{const e=[...document.querySelectorAll(sel)].find(e=>e.offsetParent&&(e.innerText||e.getAttribute('aria-label')||'').trim().includes(t));if(e){e.click();return true}return false},[t,sel]);console.log(ok?'click':'MISS',t);await p.waitForTimeout(700);};
const ui=()=>p.evaluate(()=>({inputs:[...document.querySelectorAll('#root input,#root textarea')].filter(e=>e.offsetParent).map(e=>e.type+':'+(e.placeholder||e.getAttribute('aria-label')||'')),btns:[...document.querySelectorAll('#root button')].filter(e=>e.offsetParent).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\s+/g,' ').slice(0,24)).filter(Boolean).slice(0,30)}));

const state=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rabbani-v1')||'{}');return JSON.stringify({tasks:(s.tasks||[]).map(t=>[t.title,t.period,t.done,t.scheduledDate||null]),sch:Object.keys(s.taskSchedules||{}).length})});
const setIn=(sel,v)=>p.evaluate(([sel,v])=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))},[sel,v]);
await nav(1);await clickT('أسبوعي');
await setIn('input[aria-label="المهمة الأسبوعية"]','مهمة اختبار أضيفت من الواجهة');
const days=await p.evaluate(()=>[...document.querySelectorAll('select[aria-label="يوم المهمة"] option')].map(o=>o.value));
await setIn('select[aria-label="يوم المهمة"]',days[3]);
await clickT('إضافة المهمة');await p.waitForTimeout(600);
console.log('after add',await state());
console.log('listed',await p.evaluate(()=>document.body.innerText.includes('مهمة اختبار أضيفت من الواجهة')));
await p.screenshot({path:'/tmp/shots/tk-add.png'});
await p.evaluate(()=>{const r=[...document.querySelectorAll('.weekly-task')].find(e=>e.innerText.includes('مهمة اختبار'));r.querySelector('input[type=checkbox]').click()});await p.waitForTimeout(500);
console.log('after check',await state());
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(1200);await nav(1);await clickT('أسبوعي');
console.log('after reload',await state(),'listed',await p.evaluate(()=>document.body.innerText.includes('مهمة اختبار أضيفت من الواجهة')));
await p.evaluate(()=>{const r=[...document.querySelectorAll('.weekly-task')].find(e=>e.innerText.includes('مهمة اختبار'));[...r.querySelectorAll('button')].find(b=>/حذف/.test(b.innerText||b.getAttribute('aria-label')||''))?.click()});await p.waitForTimeout(600);
console.log('after delete',await state());
await clickT('شهري');
await setIn('input[placeholder*="تريد"],form.weekly-add input[type=text],form.weekly-add input:not([type])','مهمة شهرية اختبار');
await clickT('إضافة');await p.waitForTimeout(500);console.log('monthly add',await state());
await b.close();srv.close();
