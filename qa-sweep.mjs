import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const srv = createServer((req,res)=>{ let f = join('dist', decodeURIComponent(new URL(req.url,'http://x').pathname)); if (!existsSync(f)||statSync(f).isDirectory()) f = join('dist','index.html'); try { res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(readFileSync(f)); } catch { res.writeHead(404); res.end(); } });
await new Promise(r=>srv.listen(4183,r));
const THEME=process.env.THEME||'light';
const b = await chromium.launch({ channel:'chrome', args:['--no-sandbox'] });
const ctx = await b.newContext({ viewport:{width:390,height:844}, geolocation:{latitude:30.04,longitude:31.23}, permissions:['geolocation'] });
const p = await ctx.newPage();
const errs=[];
p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,120)));
p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::ERR|api\.quran|aladhan|nominatim|overpass/i.test(m.text()))errs.push('CONSOLE '+m.text().slice(0,120));});
await p.goto('http://127.0.0.1:4183/',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),THEME);
const home=async()=>{await p.goto('http://127.0.0.1:4183/',{waitUntil:'networkidle'});await p.waitForTimeout(900);await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),THEME);};
const secs=await p.evaluate(()=>[...document.querySelectorAll('.wide-card')].map(e=>e.dataset.section));
console.log('sections',secs.join(','));
const nav=await p.evaluate(()=>[...document.querySelectorAll('.mobile-nav button,.mobile-nav a')].map(e=>e.innerText.trim().replace(/\n/g,' ')));
console.log('nav',nav.join(' | '));
const check=async(name)=>{const r=await p.evaluate(()=>{const W=document.documentElement.clientWidth;const bad=[...document.querySelectorAll('#root *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&e.offsetParent&&(r.right>W+2||r.left<-2)&&!e.closest('[data-scroll],.hf-mushaf,.scroll-x,pre')&&getComputedStyle(e).position!=='fixed'}).slice(0,3).map(e=>e.className?.toString().slice(0,40)||e.tagName);return {sw:document.documentElement.scrollWidth,W,bad}});console.log(name,JSON.stringify(r));await p.screenshot({path:`/tmp/shots/sw-${THEME}-${name}.png`});};
await check('home');
for(const s of secs){await home();await p.evaluate(s=>{const x=[...document.querySelectorAll('.wide-card')].find(e=>e.dataset.section===s);x&&x.click()},s);await p.waitForTimeout(1200);await check('sec-'+s);}
for(let i=0;i<nav.length;i++){await home();await p.evaluate(i=>{[...document.querySelectorAll('.mobile-nav button,.mobile-nav a')][i]?.click()},i);await p.waitForTimeout(1200);await check('nav'+i);}
console.log('ERRORS',errs.length,[...new Set(errs)].join(' || '));
await b.close();srv.close();
