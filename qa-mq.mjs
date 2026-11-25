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

await p.waitForTimeout(4000);await nav(4);await p.waitForTimeout(4000);
const sumTxt=()=>p.evaluate(()=>{const t=document.body.innerText.replace(/\s+/g,' ');return (t.match(/عُثر على[^(]{0,60}|لا توجد[^.]{0,60}|لم نجد[^.]{0,60}/)||['?'])[0]+' | cards:'+document.querySelectorAll('.mosque-card,[class*=mosque-card]').length});
const click=async t=>{await p.locator('#root button',{hasText:t}).first().click();await p.waitForTimeout(2500)};
console.log('default',await sumTxt());
for(const t of ['500 م','3 كم','5 كم','1 كم']){await click(t);console.log(t,await sumTxt())}
await click('سيارة');console.log('car',await sumTxt(),await p.evaluate(()=>[...document.querySelectorAll('.mosque-card,[class*=mosque-card]')][0]?.innerText.replace(/\s+/g,' ').slice(0,120)));await p.screenshot({path:'/tmp/shots/mq-car.png'});
await click('مشي');console.log('walk',await sumTxt());
const num=p.locator('input[type=number]');await num.fill('10');await num.press('Enter');await p.waitForTimeout(2500);console.log('10km',await sumTxt());
await p.locator('input[type=range]').fill('2');await p.waitForTimeout(2500);console.log('slider2',await sumTxt());
await p.screenshot({path:'/tmp/shots/mq-slider.png'});
// change country/city
await click('تغيير الدولة');await p.waitForTimeout(1000);await p.screenshot({path:'/tmp/shots/mq-picker.png'});
console.log('picker',(await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '))).match(/اختر[^.]{0,120}/)?.[0]);
await b.close();srv.close();
