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

await p.evaluate(()=>{const day=o=>{const d=new Date();d.setDate(d.getDate()+o);return d.toLocaleDateString('en-CA')};const raw=localStorage.getItem('rabbani-v1');const st=raw?JSON.parse(raw):{};st.tasks=[{id:'t1',title:'مراجعة حفظ سورة مريم',period:'daily',done:false,optional:true},{id:'t2',title:'إنهاء تقرير العمل',period:'weekly',done:false,optional:true},{id:'t3',title:'اتصال بالوالدة',period:'monthly',done:false,optional:true}];st.taskSchedules={};localStorage.setItem('rabbani-v1',JSON.stringify(st));});
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(1500);
const clickT=async(t,sel='#root button')=>{const ok=await p.evaluate(([t,sel])=>{const e=[...document.querySelectorAll(sel)].find(e=>e.offsetParent&&(e.innerText||e.getAttribute('aria-label')||'').trim().includes(t));if(e){e.click();return true}return false},[t,sel]);console.log(ok?'click':'MISS',t);await p.waitForTimeout(700);};
await nav(1);await clickT('مهام اليوم');await p.waitForTimeout(800);
await clickT('بلا موعد');
const rows=async()=>p.evaluate(()=>[...document.querySelectorAll('#root li,#root article,#root .today-task-row,#root [class*=task-row]')].filter(e=>e.offsetParent).map(e=>e.innerText.replace(/\s+/g,' ').slice(0,90)).slice(0,8));
console.log('rows',JSON.stringify(await rows()));await p.screenshot({path:'/tmp/shots/tk-2.png'});


const tomorrow=await p.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toLocaleDateString('en-CA')});
const rowOf='[...document.querySelectorAll("#root li,#root article,#root [class*=task-row]")].find(e=>e.innerText.includes(T))';
const setCtl=(T,aria,v)=>p.evaluate(([T,aria,v])=>{const r=[...document.querySelectorAll("#root li,#root article,#root [class*=task-row]")].find(e=>e.innerText.includes(T));const el=[...r.querySelectorAll('input,select')].find(e=>(e.getAttribute('aria-label')||'').includes(aria));const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return el.value},[T,aria,v]);
const rowBtn=(T,label)=>p.evaluate(([T,label])=>{const r=[...document.querySelectorAll("#root li,#root article,#root [class*=task-row]")].find(e=>e.innerText.includes(T));const b=[...r.querySelectorAll('button')].find(b=>(b.innerText||b.getAttribute('aria-label')||'').includes(label));if(b)b.click();return !!b},[T,label]);
const T='إنهاء تقرير العمل';
console.log('date',await setCtl(T,'اليوم المقترح',tomorrow),'hr',await setCtl(T,'الساعة','09'),'min',await setCtl(T,'الدقيقة','30'),'ampm',await setCtl(T,'الفترة','AM'));
console.log('confirm',await rowBtn(T,'تأكيد الجدولة'));await p.waitForTimeout(800);
const st=()=>p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('rabbani-v1')||'{}');return JSON.stringify({sch:s.taskSchedules,done:(s.tasks||[]).map(t=>[t.id,t.done,t.doneKey||null])})});
console.log('after confirm',await st());
await clickT('غدًا');console.log('rows tomorrow',JSON.stringify(await p.evaluate(()=>[...document.querySelectorAll('#root li,#root article,#root [class*=task-row]')].filter(e=>e.offsetParent).map(e=>e.innerText.replace(/\s+/g,' ').slice(0,80)))));console.log('notify toggle',await rowBtn(T,'مفعّل'));await p.waitForTimeout(500);console.log('after notify off',await st());
await clickT('بلا موعد');console.log('t3 complete',await rowBtn('اتصال بالوالدة','إنجاز'));await p.waitForTimeout(700);
console.log('after complete',await st());
await p.screenshot({path:'/tmp/shots/tk-4.png'});
await p.reload({waitUntil:'networkidle'});await p.waitForTimeout(1500);console.log('after reload',await st());
await b.close();srv.close();
