// Regenerates android/app/src/test/resources/prayer-parity.tsv from the app's own JS scheduler (adhan-js).
// Usage: TZ=UTC node scripts/gen-prayer-parity.cjs
const {buildSync} = require('esbuild');
const fs = require('fs'), os = require('os'), path = require('path');
const out = path.join(os.tmpdir(), 'ps-parity.cjs');
buildSync({entryPoints: ['src/lib/prayer-schedule.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'error'});
const ps = require(out);
const methods = ['MuslimWorldLeague','Egyptian','Karachi','UmmAlQura','Dubai','MoonsightingCommittee','NorthAmerica','Kuwait','Qatar','Singapore','Tehran','Turkey'];
let s = 12345; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const fixed = [[21.4225,39.8262],[30.0444,31.2357],[-6.2,106.8],[40.7128,-74.006],[51.5074,-0.1278],[69.6492,18.9553],[64.1466,-21.9426],[-33.8688,151.2093],[61.2181,-149.9003],[41.0082,28.9784],[35.6892,51.389],[24.8607,67.0011],[24.7136,46.6753],[-54.8019,-68.303],[0,0]];
const locs = fixed.slice(); for (let i = 0; i < 15; i++) locs.push([Math.round((rnd()*170-85)*1e4)/1e4, Math.round((rnd()*360-180)*1e4)/1e4]);
const rows = [];
for (const [lat, lon] of locs) for (const m of methods) for (const h of ['Shafi','Hanafi']) for (let k = 0; k < 2; k++) {
  const dt = new Date(2026 + Math.floor(rnd()*2), Math.floor(rnd()*12), 1 + Math.floor(rnd()*28));
  const o = {}; for (const p of ps.computePrayerTimes({latitude: lat, longitude: lon}, dt, m, h, {})) o[p.prayer] = p.at.getTime();
  rows.push([lat, lon, m, h === 'Hanafi' ? 1 : 0, dt.getFullYear(), dt.getMonth()+1, dt.getDate(), o.Fajr ?? 'NaN', o.Dhuhr ?? 'NaN', o.Asr ?? 'NaN', o.Maghrib ?? 'NaN', o.Isha ?? 'NaN'].join('\t'));
}
fs.writeFileSync('android/app/src/test/resources/prayer-parity.tsv', rows.join('\n') + '\n');
console.log(rows.length + ' rows');
