import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const root=join(process.cwd(),'dist');
const pages=['about','library','quran','sunnah','aqeedah','tazkiyah','worship','methodology','daily-program','sirah','daily','accountability','strong-muslim','learning-paths'];
const failures=[];
for(const page of pages){
  const file=join(root,page,'index.html');
  let html='';
  try{html=await readFile(file,'utf8')}catch{failures.push(`${page}: missing dist/${page}/index.html`);continue}
  if(!html.includes('<h1'))failures.push(`${page}: missing h1`);
  if(!html.includes('<link rel="canonical"'))failures.push(`${page}: missing canonical`);
  if(!html.includes('name="robots"'))failures.push(`${page}: missing robots metadata`);
  if(!html.includes('application/ld+json'))failures.push(`${page}: missing JSON-LD`);
}
// Static policy/legal pages must be real HTML files, not the SPA shell.
for(const legal of ['privacy.html','delete-account.html']){
  const file=join(root,legal);
  let html='';
  try{html=await readFile(file,'utf8')}catch{failures.push(`missing dist/${legal}`);continue}
  if(!html.includes('<h1'))failures.push(`${legal}: missing h1`);
  if(html.includes('id="root"'))failures.push(`${legal}: looks like SPA shell (index.html)`);
}
const sitemap=await readFile(join(root,'sitemap.xml'),'utf8').catch(()=>null);
if(!sitemap)failures.push('missing dist/sitemap.xml');
else for(const page of ['about','library','quran','learning-paths'])if(!sitemap.includes(`https://alrabbaniyun.com/${page}/`))failures.push(`sitemap missing /${page}/`);
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log(`Cloudflare output verified: ${pages.length} public SEO pages + sitemap.`);
