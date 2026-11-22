// Re-runnable CLI script to inspect, clean, and bundle the Arab mosques OSM CSV into public/data/.
// Usage:
//   node scripts/mosques-build/build.mjs [--csv path/to/file.csv] [--inspect-only] [--allow-high-drop]

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  OSM_ATTRIBUTION,
  decodeCsvBuffer,
  parseCsv,
  processMosqueRows,
} from './clean.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_CSV = join(ROOT, 'data', 'arab_mosques_final_clean.csv');
const OUT_DIR = join(ROOT, 'public', 'data');

const COUNTRY_META = {
  SA: { nameAr: 'السعودية', lat: 23.8859, lon: 45.0792 },
  EG: { nameAr: 'مصر', lat: 26.8206, lon: 30.8025 },
  DZ: { nameAr: 'الجزائر', lat: 28.0339, lon: 1.6596 },
  IQ: { nameAr: 'العراق', lat: 33.2232, lon: 43.6793 },
  LY: { nameAr: 'ليبيا', lat: 26.3351, lon: 17.2283 },
  MA: { nameAr: 'المغرب', lat: 31.7917, lon: -7.0926 },
  SD: { nameAr: 'السودان', lat: 12.8628, lon: 30.2176 },
  AE: { nameAr: 'الإمارات', lat: 23.4241, lon: 53.8478 },
  YE: { nameAr: 'اليمن', lat: 15.5527, lon: 48.5164 },
  TN: { nameAr: 'تونس', lat: 33.8869, lon: 9.5375 },
  SY: { nameAr: 'سوريا', lat: 34.8021, lon: 38.9968 },
  PS: { nameAr: 'فلسطين', lat: 31.9522, lon: 35.2332 },
  OM: { nameAr: 'عُمان', lat: 21.4735, lon: 55.9754 },
  KW: { nameAr: 'الكويت', lat: 29.3117, lon: 47.4818 },
  SO: { nameAr: 'الصومال', lat: 5.1521, lon: 46.1996 },
  JO: { nameAr: 'الأردن', lat: 30.5852, lon: 36.2384 },
  LB: { nameAr: 'لبنان', lat: 33.8547, lon: 35.8623 },
  BH: { nameAr: 'البحرين', lat: 26.0667, lon: 50.5577 },
  MR: { nameAr: 'موريتانيا', lat: 21.0079, lon: -10.9408 },
  QA: { nameAr: 'قطر', lat: 25.3548, lon: 51.1839 },
  DJ: { nameAr: 'جيبوتي', lat: 11.8251, lon: 42.5903 },
  KM: { nameAr: 'جزر القمر', lat: -11.6455, lon: 43.3333 },
};

function parseArgs(argv) {
  let csvPath = DEFAULT_CSV;
  let inspectOnly = false;
  let allowHighDrop = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--csv' && argv[i + 1]) {
      csvPath = resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === '--inspect-only') {
      inspectOnly = true;
    } else if (argv[i] === '--allow-high-drop') {
      allowHighDrop = true;
    }
  }
  return { csvPath, inspectOnly, allowHighDrop };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  const { csvPath, inspectOnly, allowHighDrop } = parseArgs(process.argv.slice(2));
  if (!existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const rawBuf = readFileSync(csvPath);
  const decoded = decodeCsvBuffer(rawBuf);
  const parsedRows = parseCsv(decoded.text);
  const { report, byCountry } = processMosqueRows(parsedRows);

  console.log('=== CSV Inspection & Cleaning Report ===');
  console.log(`Source file: ${csvPath} (${formatBytes(rawBuf.length)})`);
  console.log(`Encoding: ${decoded.encoding} | U+FFFD replacements: ${decoded.replacementCount}`);
  console.log(`Double-encoded repairs: ${report.doubleEncodedRepairs}`);
  if (report.doubleEncodedSamples.length) {
    console.log('Double-encoded samples:', report.doubleEncodedSamples);
  }
  console.log(`Total data rows: ${report.totalRows} | Shifted/bad rows: ${report.shiftedRowsCount}`);
  console.log('Column fill rates:', report.fillRates);
  console.log(`Invalid coords dropped: ${report.invalidCoordCount}`);
  console.log(`Non-mosques removed: ${report.nonMosqueCount}`, report.nonMosqueCounts);
  console.log('Non-mosque samples:', JSON.stringify(report.nonMosqueSamples, null, 2));
  console.log(`Duplicate source_id removed: ${report.dupSourceIdCount}`, report.dupSourceIdSamples);
  console.log(`Spatial+name duplicates (<=15m) removed: ${report.dupSpatialCount}`, report.dupSpatialSamples);
  console.log(`Kept: ${report.keptCount} | Removed total: ${report.removedCount} (${report.removedPct}%)`);

  if (report.removedPct > 15 && !allowHighDrop) {
    console.error(`ABORTED: Removal rate ${report.removedPct}% exceeds 15%. Review rules or pass --allow-high-drop.`);
    process.exitCode = 2;
    return;
  }

  // Estimate compact tuple payload sizes even in inspect-only mode
  // Compact tuple format per record: [id, name, lat, lon] or [id, name, lat, lon, loc]
  const sizeRows = [];
  let totalRaw = 0;
  let totalGzip = 0;

  const countriesMeta = {};
  const countryPayloads = {};

  for (const [cc, items] of Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length)) {
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    const tuples = items.map((m) => {
      if (m.lat < minLat) minLat = m.lat;
      if (m.lat > maxLat) maxLat = m.lat;
      if (m.lon < minLon) minLon = m.lon;
      if (m.lon > maxLon) maxLon = m.lon;
      return m.loc ? [m.id, m.name, m.lat, m.lon, m.loc] : [m.id, m.name, m.lat, m.lon];
    });
    const json = JSON.stringify(tuples);
    const rawBytes = Buffer.byteLength(json, 'utf8');
    const gzipBytes = gzipSync(json, { level: 9 }).length;
    totalRaw += rawBytes;
    totalGzip += gzipBytes;

    const fallbackName = (() => {
      try {
        const dn = new Intl.DisplayNames(['ar'], { type: 'region' });
        return dn.of(cc) || cc;
      } catch {
        return cc;
      }
    })();
    const info = COUNTRY_META[cc] ?? { nameAr: fallbackName, lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
    countriesMeta[cc] = {
      code: cc,
      nameAr: info.nameAr,
      count: items.length,
      file: `${cc.toLowerCase()}.json`,
      rawBytes,
      gzipBytes,
      bbox: [
        Math.round(minLat * 1000) / 1000,
        Math.round(minLon * 1000) / 1000,
        Math.round(maxLat * 1000) / 1000,
        Math.round(maxLon * 1000) / 1000,
      ],
      center: [info.lat, info.lon],
    };
    countryPayloads[cc] = json;
    sizeRows.push({ cc, nameAr: info.nameAr, count: items.length, raw: formatBytes(rawBytes), gzip: formatBytes(gzipBytes) });
  }

  const meta = {
    version: 1,
    dataDate: new Date().toISOString().slice(0, 10),
    attribution: OSM_ATTRIBUTION,
    totalCount: report.keptCount,
    fields: ['id', 'name', 'lat', 'lon', 'loc?'],
    countries: countriesMeta,
  };
  const metaJson = JSON.stringify(meta, null, 2) + '\n';
  const metaRaw = Buffer.byteLength(metaJson, 'utf8');
  const metaGzip = gzipSync(metaJson, { level: 9 }).length;
  totalRaw += metaRaw;
  totalGzip += metaGzip;

  console.log('\n=== Output Size Summary ===');
  console.table(sizeRows);
  console.log(`meta.json: raw ${formatBytes(metaRaw)} | gzip ${formatBytes(metaGzip)}`);
  console.log(`TOTAL (${Object.keys(countriesMeta).length} countries + meta): raw ${formatBytes(totalRaw)} | gzip ${formatBytes(totalGzip)}`);

  if (inspectOnly) {
    console.log('\n(--inspect-only set: no files written)');
    return;
  }

  if (existsSync(OUT_DIR)) {
    rmSync(OUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'meta.json'), metaJson, 'utf8');
  for (const [cc, json] of Object.entries(countryPayloads)) {
    writeFileSync(join(OUT_DIR, `${cc.toLowerCase()}.json`), json, 'utf8');
  }
  console.log(`\nWrote ${Object.keys(countryPayloads).length + 1} files to ${OUT_DIR}`);
}

main();
