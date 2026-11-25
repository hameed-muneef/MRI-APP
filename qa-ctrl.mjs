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

const bt=async t=>{await p.locator('#root main button',{hasText:t}).first().click();await p.waitForTimeout(1500)};
const body=()=>p.evaluate(()=>document.querySelector('main').innerText.replace(/\s+/g,' '));
// accountability
await nav(6);await p.waitForTimeout(1500);
const ta=p.locator('textarea');await ta.fill('اختبار محاسبة QA');await bt('حفظ خاص');
console.log('acct after save:',(await body()).slice(0,260));
const keys=await p.evaluate(()=>Object.keys(localStorage).filter(k=>/account|muhasab|reflect|rabbani/i.test(k)));console.log('keys',keys.join(','));
await p.screenshot({path:'/tmp/shots/ac-2.png'});
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(3000);await nav(6);await p.waitForTimeout(1500);
console.log('acct after reload has entry:',(await body()).includes('اختبار محاسبة QA'));await p.screenshot({path:'/tmp/shots/ac-3.png'});
await bt('زكِّ نفسك');console.log('tazkiya:',(await body()).slice(0,200));await p.screenshot({path:'/tmp/shots/ac-4.png'});
// haramain
await nav(5);await p.waitForTimeout(1500);
console.log('hm iframes before',await p.evaluate(()=>[...document.querySelectorAll('iframe,video,audio')].map(e=>e.tagName+':'+(e.src||'').slice(0,60))));
await bt('قناة السنة');console.log('hm after sunnah',await p.evaluate(()=>[...document.querySelectorAll('iframe,video,audio')].map(e=>e.tagName+':'+(e.src||'').slice(0,70))));
await bt('تشغيل الصوت في الخلفية');console.log('hm bg-audio:',(await body()).slice(0,300));
await p.screenshot({path:'/tmp/shots/hm-2.png'});
// qibla
await nav(3);await p.waitForTimeout(1500);
await bt('إظهار البوصلة');console.log('qibla digital:',(await body()).slice(0,300));await p.screenshot({path:'/tmp/shots/qb-1.png'});
await bt('اختيار مدينة');console.log('qibla picker:',(await body()).match(/اختر[^.]{0,100}/)?.[0]||(await body()).slice(0,150));
await b.close();srv.close();
