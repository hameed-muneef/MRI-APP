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

await p.evaluate(()=>{window.__plays=0;const o=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__plays++;return o.call(this)};});
await nav(2);await p.waitForTimeout(2500);
console.log('quran tabs',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('main [role=tab],main .quran-subnav button,main nav button')].map(e=>e.textContent.trim().slice(0,20)))));
await p.locator('main button,main [role=tab]',{hasText:/^مكتبة القراء/}).first().click();await p.waitForTimeout(4000);
const t=()=>p.evaluate(()=>document.querySelector('main').innerText.replace(/\s+/g,' '));
console.log('reciters page',(await t()).slice(0,500));
const cnt=await p.locator('.reciter-card,[class*=reciter-row],[class*=reciter-item]').count();console.log('reciter rows',cnt);
await p.screenshot({path:'/tmp/shots/rc-1.png'});


await p.evaluate(()=>{window.__src=[];const o=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__src.push(this.currentSrc||this.src);return o.call(this)};});
const q=p.locator('input[aria-label="ابحث عن قارئ"]');await q.fill('العفاسي');await p.waitForTimeout(1000);
await p.locator('.reciters-library summary, .reciters-library [aria-expanded]').first().click();await p.waitForTimeout(1500);
const btns=()=>p.evaluate(()=>[...document.querySelectorAll('.reciters-library button,.reciters-library input,.reciters-library select')].filter(e=>e.offsetParent).map(e=>(e.getAttribute('aria-label')||e.textContent.trim().replace(/\s+/g,' ')||e.type).slice(0,26)));
console.log('expanded',JSON.stringify(await btns()));

const L=p.locator('.reciters-library');
const txt=()=>L.evaluate(e=>e.innerText.replace(/\s+/g,' '));
await L.locator('button',{hasText:'استماع'}).first().click();await p.waitForTimeout(3500);

const mp=()=>p.evaluate(()=>{const m=[...document.querySelectorAll('[class*=mini],[class*=player],[class*=background-audio]')].find(e=>e.offsetParent&&/الفاتحة/.test(e.innerText));return m?[m.className.slice(0,40),[...m.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')||b.textContent.trim())]:null});
console.log('after listen: src',JSON.stringify(await p.evaluate(()=>window.__src)),'player',JSON.stringify(await mp()));
const pb=p.locator('button[aria-label*="إيقاف مؤقت"],button[aria-label*="مؤقتًا"],button[aria-label*="Pause"]').first();
console.log('pause btn count',await p.locator('button[aria-label*="إيقاف"],button[aria-label*="مؤقت"],button[aria-label*="تشغيل"],button[aria-label*="إغلاق"]').count());
console.log('labels',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('button[aria-label]')].filter(e=>e.offsetParent).map(e=>e.getAttribute('aria-label')).slice(-8))));

const lbl=()=>p.evaluate(()=>[...document.querySelectorAll('.mini-audio-row button')].map(b=>b.getAttribute('aria-label')));
await p.locator('.mini-audio-row button[aria-label="إيقاف مؤقت"]').click();await p.waitForTimeout(1000);console.log('after pause labels',JSON.stringify(await lbl()),'time',await p.evaluate(()=>document.querySelector('.mini-audio-row')?.innerText.match(/\d\d:\d\d \/ \d\d:\d\d/)?.[0]));
await p.waitForTimeout(1500);console.log('time 1.5s later',await p.evaluate(()=>document.querySelector('.mini-audio-row')?.innerText.match(/\d\d:\d\d \/ \d\d:\d\d/)?.[0]));
await p.locator('.mini-audio-row button[aria-label="إيقاف وإغلاق المشغّل"]').click();await p.waitForTimeout(800);console.log('player after close',await p.locator('.mini-audio-row').count());
// download + delete
await L.locator('button',{hasText:/^\s*تحميل\s*$/}).first().click();await p.waitForTimeout(4000);
console.log('after dl',JSON.stringify((await btns()).filter(t=>/حذف|تحميل/.test(t))));
await p.screenshot({path:'/tmp/shots/rc-dl.png'});
await L.locator('button[aria-label^="حذف تلاوات"]').first().click();await p.waitForTimeout(1500);
console.log('after delete click',JSON.stringify((await btns()).filter(t=>/حذف|تأكيد|تحميل|نعم/.test(t))));
// adopt
await L.locator('button',{hasText:'اعتماد للمصحف'}).first().click();await p.waitForTimeout(2000);
console.log('after adopt section',(await p.evaluate(()=>document.querySelector('main h2')?.innerText)),'stored',await p.evaluate(()=>localStorage.getItem('rabbani-quran-selected-reciter-v1')));
await p.screenshot({path:'/tmp/shots/rc-adopt.png'});
console.log('reader reciter select',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('main select')].map(s=>[s.options.length,s.selectedOptions[0]?.text]))));
await b.close();srv.close();
