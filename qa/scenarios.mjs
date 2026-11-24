// Scenario audit for the production build (dist/): console/page errors,
// horizontal overflow, offline reload, denied geolocation, corrupt
// localStorage recovery and small-phone widths. Run `npm run build` first.
// Usage: node qa/scenarios.mjs   (exit code 1 when any scenario fails)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.txt':'text/plain'};
const PORT = 4173;
const srv = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join('dist', p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join('dist', 'index.html');
  try { res.writeHead(200, {'content-type': MIME[extname(f)] || 'application/octet-stream'}); res.end(readFileSync(f)); }
  catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => srv.listen(PORT, r));

const TABS = ['القرآن','حياتي','القبلة','المساجد','الحرمين','المحاسبة'];
const issues = [];
const b = await chromium.launch({channel: 'chrome', args: ['--no-sandbox']});

// 1) Console/page errors + overflow across widths, themes and tabs.
for (const width of [320, 390, 1280]) {
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({viewport: {width, height: 844}, permissions: ['geolocation'], geolocation: {latitude: 30.04, longitude: 31.23}});
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 160)));
    await p.goto(`http://127.0.0.1:${PORT}/`, {waitUntil: 'networkidle'});
    await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    for (const tab of TABS) {
      const el = p.locator(`.mobile-nav button:has-text("${tab}")`).first();
      if (await el.count()) { await el.click().catch(() => {}); await p.waitForTimeout(900); }
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 1) issues.push(`overflow ${width}/${theme}/${tab}: +${ov}px`);
    }
    if (errs.length) issues.push(`console ${width}/${theme}: ${[...new Set(errs)].slice(0, 5).join(' | ')}`);
    await ctx.close();
  }
}

// 2) Offline: after first load the SW must serve reload and tab navigation.
{
  const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/`, {waitUntil: 'networkidle'});
  await p.waitForTimeout(3000);
  const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r && r.active; });
  if (!sw) issues.push('service worker not active after first load');
  await ctx.setOffline(true);
  await p.reload({waitUntil: 'domcontentloaded'}).catch(e => issues.push('offline reload failed: ' + e.message.slice(0, 80)));
  await p.waitForTimeout(2000);
  if (!(await p.evaluate(() => !!document.querySelector('.hero')))) issues.push('offline reload: hero missing');
  await p.evaluate(() => { const x = [...document.querySelectorAll('.mobile-nav button')].find(n => n.innerText.includes('القرآن')); x && x.click(); });
  await p.waitForTimeout(1000);
  if (!(await p.evaluate(() => document.body.innerText.includes('القرآن')))) issues.push('offline tab navigation failed');
  await ctx.close();
}

// 3) Geolocation denied: app must render without errors.
{
  const ctx = await b.newContext({viewport: {width: 390, height: 844}, permissions: []});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  await p.goto(`http://127.0.0.1:${PORT}/`, {waitUntil: 'networkidle'});
  await p.waitForTimeout(1500);
  if (!(await p.evaluate(() => !!document.querySelector('.hero')))) issues.push('geo denied: hero missing');
  if (errs.length) issues.push(`geo denied errors: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
  await ctx.close();
}

// 4) Corrupt localStorage: app must recover without page errors.
{
  const ctx = await b.newContext({viewport: {width: 390, height: 844}});
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/`, {waitUntil: 'domcontentloaded'});
  await p.evaluate(() => { Object.keys(localStorage).forEach(k => localStorage.setItem(k, '{{{corrupt')); });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.reload({waitUntil: 'networkidle'});
  await p.waitForTimeout(1500);
  if (!(await p.evaluate(() => !!document.querySelector('.hero')))) issues.push('corrupt storage: app did not recover');
  if (errs.length) issues.push(`corrupt storage errors: ${[...new Set(errs)].slice(0, 3).join(' | ')}`);
  await ctx.close();
}

console.log(issues.length ? 'SCENARIOS FAILED\n' + issues.join('\n') : 'ALL SCENARIOS PASS');
await b.close(); srv.close();
process.exit(issues.length ? 1 : 0);
