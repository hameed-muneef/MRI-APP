// Convert newly added mosque datasets into the OSM schema expected by clean.mjs.
// Includes ALL countries (worldwide). Removes duplicates by source_id / spatial+name / coords.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Load world country boundaries for reverse-geocoding coordinates.
const geo = JSON.parse(readFileSync(join(ROOT, 'data', 'countries.geojson'), 'utf8'));
const countries = geo.features.map((f) => {
  const code = f.properties['ISO3166-1-Alpha-2'];
  const name = f.properties.name;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates]
    : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  let minLat=90,maxLat=-90,minLon=180,maxLon=-180;
  for (const poly of polys) for (const ring of poly) for (const [lon,lat] of ring) {
    if (lat<minLat) minLat=lat; if (lat>maxLat) maxLat=lat;
    if (lon<minLon) minLon=lon; if (lon>maxLon) maxLon=lon;
  }
  return { code, name, polys, bbox:[minLat,maxLat,minLon,maxLon] };
}).filter(c=>c.code && c.code.length===2);

// name -> code map (and aliases)
const nameToCode = {};
for (const c of countries) nameToCode[c.name.toLowerCase()] = c.code;
const aliases = {
  'usa':'US','united states of america':'US','uk':'GB','united kingdom':'GB',
  'russia':'RU','south korea':'KR','north korea':'KP','iran':'IR','syria':'SY',
  'turkey':'TR','vietnam':'VN','laos':'LA','bolivia':'BO','tanzania':'TZ',
  'venezuela':'VE','moldova':'MD','brunei':'BN','macau':'MO','hong kong':'HK',
  'taiwan':'TW','palestine':'PS','uae':'AE','united arab emirates':'AE',
};
for (const [k,v] of Object.entries(aliases)) nameToCode[k]=v;

function pointInPolygon(lat, lon, poly) {
  // poly: array of rings; use first ring (outer)
  const ring = poly[0];
  let inside = false;
  for (let i=0,j=ring.length-1; i<ring.length; j=i++) {
    const [xi,yi] = [ring[i][0], ring[i][1]]; // lon,lat
    const [xj,yj] = [ring[j][0], ring[j][1]];
    const yiL = yi, yjL = yj;
    const intersect = ((yiL > lat) !== (yjL > lat)) &&
      (lon < (xj - xi) * (lat - yiL) / (yjL - yiL) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function detectCountry(lat, lon, address) {
  // 1) address country name
  if (address) {
    const low = address.toLowerCase();
    // try longest names first
    const names = Object.keys(nameToCode).sort((a,b)=>b.length-a.length);
    for (const name of names) {
      if (low.includes(name)) return nameToCode[name];
    }
  }
  // 2) point in polygon
  for (const c of countries) {
    const [minLat,maxLat,minLon,maxLon] = c.bbox;
    if (lat<minLat||lat>maxLat||lon<minLon||lon>maxLon) continue;
    for (const poly of c.polys) {
      if (pointInPolygon(lat, lon, poly)) return c.code;
    }
  }
  return null;
}

function round5(x){ return Math.round(x*1e5)/1e5; }
function csvEscape(v){ const s=String(v??''); if (/[",\n\r]/.test(s)) return '"'+s.replace(/"/g,'""')+'"' ; return s; }

const HEADER = ['source','country_code','source_id','name','name_ar','name_en','city','address','phone','website','lat','lon'];
const outRows = [HEADER.join(',')];
let kept=0, skipped=0, dup=0;

const seenCoords = new Set();
function coordKey(lat, lon){ return `${round5(lat).toFixed(5)},${round5(lon).toFixed(5)}`; }

function addRow(source, cc, sid, name, nameAr, nameEn, city, address, phone, website, lat, lon) {
  const code = (cc||'').toUpperCase();
  if (!code || code.length!==2) { skipped++; return; }
  const la=Number(lat), lo=Number(lon);
  if (!Number.isFinite(la)||!Number.isFinite(lo)) { skipped++; return; }
  if (la<-90||la>90||lo<-180||lo>180) { skipped++; return; }
  if (la===0 && lo===0) { skipped++; return; }
  const ck = coordKey(la, lo);
  if (seenCoords.has(ck)) { dup++; return; }
  seenCoords.add(ck);
  const row = [source, code, sid, name, nameAr||'', nameEn||'', city||'', address||'', phone||'', website||'', la, lo]
    .map(csvEscape).join(',');
  outRows.push(row);
  kept++;
}

const { parseCsv } = await import('./clean.mjs');

// 1) Existing
const existingPath = join(ROOT, 'data', 'arab_mosques_final_clean.csv');
if (existsSync(existingPath)) {
  const text = readFileSync(existingPath, 'utf8');
  const rows = parseCsv(text);
  const header = rows[0].map(h=>h.trim());
  const col = Object.fromEntries(header.map((h,i)=>[h,i]));
  for (let i=1;i<rows.length;i++){
    const r=rows[i];
    if (r.length!==header.length) continue;
    if (r.every(c=>c.trim()==='')) continue;
    const cc=r[col.country_code], sid=r[col.source_id], name=r[col.name], nameAr=r[col.name_ar],
      nameEn=r[col.name_en], city=r[col.city], address=r[col.address], phone=r[col.phone],
      website=r[col.website], lat=r[col.lat], lon=r[col.lon];
    addRow('OSM', cc, sid, name, nameAr, nameEn, city, address, phone, website, lat, lon);
  }
  console.log('after existing:', kept);
}

// 2) mosquees.json (Algeria)
const mosqueesPath = join(ROOT, 'data', 'mosquees.json');
if (existsSync(mosqueesPath)) {
  const raw = readFileSync(mosqueesPath, 'utf8');
  let arr;
  try { arr = JSON.parse(raw); } catch { arr = raw.trim().split(/\n+/).map(l=>JSON.parse(l)); }
  if (!Array.isArray(arr)) arr = [arr];
  for (const m of arr) {
    addRow('DZ_OSM', 'DZ', m.id || '', m.name_ar || m.name || '', m.name_ar || '', m.name_fr || m.name_en || '', m.commune || '', m.commune || '', '', '', m.lat, m.lng ?? m.lon);
  }
  console.log('after mosquees:', kept);
}

// 3) mosques_hf.csv
const hfPath = join(ROOT, 'data', 'mosques_hf.csv');
if (existsSync(hfPath)) {
  const text = readFileSync(hfPath, 'utf8');
  const hfRows = parseCsv(text);
  const hfHeader = hfRows[0].map(h=>h.trim());
  const hfCol = Object.fromEntries(hfHeader.map((h,i)=>[h,i]));
  let n=0, filtered=0;
  for (let i=1;i<hfRows.length;i++){
    const row=hfRows[i];
    if (row.length !== hfHeader.length) { n++; continue; }
    if (row.every(c=>c.trim()==='')) continue;
    const name = row[hfCol.Name];
    const address = row[hfCol.Address];
    const lat = row[hfCol.Latitude];
    const lon = row[hfCol.Longitude];
    const types = row[hfCol.Types] || '';
    if (!types.toLowerCase().includes('mosque')) { n++; continue; }
    const cc = detectCountry(Number(lat), Number(lon), address);
    if (!cc) { filtered++; n++; continue; }
    const city = (address||'').split(',')[0].trim().replace(/\n/g,' ');
    addRow('HF', cc, `HF_${i}`, name, '', name, city, (address||'').replace(/\n/g,' '), '', '', lat, lon);
    n++;
    if (n % 50000 === 0) console.log('hf processed', n, 'kept', kept);
  }
  console.log('after hf:', kept, 'filtered(non-arab/invalid)', filtered);
}

writeFileSync(join(ROOT, 'data', 'arab_mosques_combined.csv'), outRows.join('\n')+'\n', 'utf8');
console.log('TOTAL KEPT', kept, 'DUP', dup, 'SKIPPED', skipped);
console.log('wrote data/arab_mosques_combined.csv');