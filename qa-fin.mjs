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

await p.evaluate(()=>{window.__src=[];const o=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.__src.push(this.currentSrc||this.src);return o.call(this)};HTMLElement.prototype.requestFullscreen=function(){window.__fs=(window.__fs||0)+1;return Promise.resolve()};});
// reader reciter picker
await nav(2);await p.waitForTimeout(2500);
const sels=p.locator('main select');console.log('n selects',await sels.count());
const rsel=sels.nth(2);const opts=await rsel.evaluate(e=>[...e.options].map(o=>o.value+':'+o.text).slice(0,6));console.log('opts',JSON.stringify(opts));
const before=await p.evaluate(()=>[...document.querySelectorAll('main select')].map(s=>s.selectedOptions[0]?.text));
await rsel.selectOption({index:3});await p.waitForTimeout(1500);
console.log('reciter changed',JSON.stringify(before),'->',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('main select')].map(s=>s.selectedOptions[0]?.text))),'stored',await p.evaluate(()=>localStorage.getItem('rabbani-quran-selected-reciter-v1')));
const play=p.locator('main button',{hasText:/استماع|تشغيل/}).first();console.log('play btn',await play.count()&&await play.textContent());
await play.click().catch(e=>console.log('play click err',String(e).slice(0,80)));await p.waitForTimeout(3500);console.log('src',JSON.stringify(await p.evaluate(()=>window.__src)));
await p.screenshot({path:'/tmp/shots/reader-reciter.png'});
await p.locator('.mini-audio-row button[aria-label="إيقاف وإغلاق المشغّل"]').click().catch(()=>{});
// tazkiya
await nav(6);await p.waitForTimeout(1500);await p.locator('main button',{hasText:'زكِّ نفسك'}).first().click();await p.waitForTimeout(1200);
const cnt=()=>p.evaluate(()=>document.querySelector('main').innerText.replace(/\s+/g,' ').match(/الاستغفار[^+]{0,40}/)?.[0]);
console.log('tazkiya before',await cnt());
await p.locator('main button',{hasText:'+1'}).first().click();await p.locator('main button',{hasText:'+1'}).first().click();await p.waitForTimeout(500);console.log('after 2 clicks',await cnt());
console.log('tazkiya btns',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('main button')].filter(e=>e.offsetParent).map(e=>e.textContent.trim().slice(0,14)).slice(5,30))));
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(3000);await nav(6);await p.waitForTimeout(1200);await p.locator('main button',{hasText:'زكِّ نفسك'}).first().click();await p.waitForTimeout(1200);console.log('after reload',await cnt());
// haramain
await nav(5);await p.waitForTimeout(2000);
await p.locator('main button',{hasText:'شاشة كاملة'}).click();await p.waitForTimeout(1000);console.log('fullscreen requests',await p.evaluate(()=>window.__fs||0),'btn now',await p.locator('main button',{hasText:/شاشة/}).allTextContents());
await p.locator('main button',{hasText:'تشغيل الصوت في الخلفية'}).click();await p.waitForTimeout(2500);
console.log('bg audio: src',JSON.stringify(await p.evaluate(()=>window.__src)),'player',await p.locator('.mini-audio-row').count(),'main text',(await p.evaluate(()=>document.querySelector('main').innerText.replace(/\s+/g,' '))).match(/(جارٍ|تعذر|خلفية)[^.]{0,80}/g));
await p.screenshot({path:'/tmp/shots/hm-bg.png'});
await b.close();srv.close();
