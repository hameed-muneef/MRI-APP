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

await p.waitForTimeout(4000);await nav(1);await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/shots/dbg.png'});console.log('search inputs',await p.evaluate(()=>document.querySelectorAll('input[type=search]').length), (await p.evaluate(()=>document.body.innerText)).slice(0,200).replace(/\n/g,' '));
await setIn('input[type=search]','الرياض');await p.evaluate(()=>document.querySelector('form[role=search]').requestSubmit());await p.waitForTimeout(4000);
console.log('results',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('#root li button,#root [role=option],#root .city-result,#root [class*=result] button')].map(e=>e.textContent.replace(/\s+/g,' ').slice(0,60)).slice(0,6))));



const snap=async tag=>{const r=await p.evaluate(()=>{const st=JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>/^rabbani-v1|rabbani.*state/.test(k)&&!/central|prayer-times|qibla/.test(k))||'')||'{}');return {pl:st.prayerLocation?.name||null,manual:(JSON.parse(localStorage.getItem('rabbani-central-location-manual-v1')||'null')||{}).label||null}});console.log(tag,JSON.stringify(r))};
await p.evaluate(()=>document.querySelector('.prayer-city-results')?.scrollIntoView({block:'center'}));await p.waitForTimeout(500);await p.screenshot({path:'/tmp/shots/city-results-real.png'});
await p.evaluate(()=>{[...document.querySelectorAll('#root li button')].find(e=>e.textContent.includes('السعودية'))?.click()});await p.waitForTimeout(3000);
await snap('picked');
const txt=()=>p.evaluate(()=>document.body.innerText.replace(/\s+/g,' '));
await nav(4);await p.waitForTimeout(3000);
await p.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('العودة لموقعي'))?.click());await p.waitForTimeout(4000);
let t=await txt();console.log('mosques after GPS:',(t.match(/الموقع الحالي[^.]{0,60}/)||['-'])[0]);await p.screenshot({path:'/tmp/shots/city-gps-mosques.png'});
await snap('after-gps');
const home=async tag=>{await nav(0);await p.waitForTimeout(2500);await nav(1);await p.waitForTimeout(1500);const times=await p.evaluate(()=>[...document.querySelectorAll('input[type=time]')].map(e=>e.value).join(','));await nav(3);await p.waitForTimeout(2000);t=await txt();console.log(tag,'planner times',times,'| qibla',(t.match(/زاوية القبلة[^ ]* [^ ]+/)||[''])[0],(t.match(/المسافة إلى الكعبة [^ ]+ [^ ]+/)||[''])[0]);await p.screenshot({path:'/tmp/shots/city-gps-qibla-'+tag+'.png'});};
await home('postgps');
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(3000);
await snap('reloaded');await home('reloaded');
await b.close();srv.close();
