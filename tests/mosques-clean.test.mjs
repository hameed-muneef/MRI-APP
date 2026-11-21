import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyNonMosque,
  decodeCsvBuffer,
  normalizeDisplayName,
  parseCsv,
  processMosqueRows,
  repairDoubleEncoding,
  roundCoord,
} from '../scripts/mosques-build/clean.mjs';

test('repairs double-encoded Arabic UTF-8 mojibake while leaving clean UTF-8 untouched', () => {
  const original = 'مسجد النصر';
  // Simulate UTF-8 bytes misread as Latin-1 and re-encoded as UTF-8
  const mojibake = Buffer.from(original, 'utf8').toString('latin1');
  const fixed = repairDoubleEncoding(mojibake);
  assert.equal(fixed.repaired, true);
  assert.equal(fixed.value, original);

  const alreadyClean = repairDoubleEncoding(original);
  assert.equal(alreadyClean.repaired, false);
  assert.equal(alreadyClean.value, original);
});

test('decodeCsvBuffer strips UTF-8 BOM and parses quoted Arabic CSV rows', () => {
  const csv = '\uFEFFsource,country_code,source_id,name,name_ar,name_en,city,address,phone,website,lat,lon\nOSM,EG,101,"مسجد الفتح, القاهرة",مسجد الفتح,Al-Fath Mosque,القاهرة,رمسيس,,,30.0612345,31.2654321\n';
  const decoded = decodeCsvBuffer(Buffer.from(csv, 'utf8'));
  assert.equal(decoded.hasBom, true);
  const rows = parseCsv(decoded.text);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][3], 'مسجد الفتح, القاهرة');
});

test('classifyNonMosque drops cemeteries, dorms, streets, chapels, and keeps campus mosques', () => {
  assert.equal(classifyNonMosque('مقبرة تادمايت', 'مقبرة تادمايت', ''), 'cemetery');
  assert.equal(classifyNonMosque('Cimetière Sidi Merzoug', '', ''), 'cemetery');
  assert.equal(classifyNonMosque('الإقامة الجامعية للبنات', 'الإقامة الجامعية للبنات', ''), 'university_dorm');
  assert.equal(classifyNonMosque('جامعة علوم الصحة', 'جامعة علوم الصحة', 'University of Health Sciences'), 'university_school');
  assert.equal(classifyNonMosque('شارع مسجد الأزهر', '', ''), 'street_transit_prefix');
  assert.equal(classifyNonMosque('مصلى للثالوث المقدس', 'مصلى للثالوث المقدس', 'Chapel to the Holy Trinity'), 'other_religion');
  // Campus & station mosques must be kept
  assert.equal(classifyNonMosque('مسجد كلية الزراعة', 'مسجد كلية الزراعة', 'Faculty of Agriculture Mosque'), null);
  assert.equal(classifyNonMosque('مسجد محطة مصر', 'مسجد محطة مصر', 'Misr Station Mosque'), null);
  assert.equal(classifyNonMosque('', '', ''), null);
});

test('processMosqueRows drops invalid coords, deduplicates source_id and <=15m same-name, picks name priority, rounds to 5 decimals', () => {
  const fixture = [
    ['source', 'country_code', 'source_id', 'name', 'name_ar', 'name_en', 'city', 'address', 'phone', 'website', 'lat', 'lon'],
    // Valid mosque (name_ar priority)
    ['OSM', 'EG', '1', 'Mosque A', 'مسجد الرحمة', 'Al-Rahma Mosque', 'القاهرة', 'وسط البلد', '', '', '30.0444199', '31.2357199'],
    // Duplicate source_id -> dropped
    ['OSM', 'EG', '1', 'Mosque A dup', 'مسجد الرحمة', '', '', '', '', '', '30.04442', '31.23572'],
    // Spatial duplicate within ~5 meters with same normalized Arabic name -> dropped
    ['OSM', 'EG', '2', '', 'مسجد الرحمه', '', '', '', '', '', '30.04444', '31.23574'],
    // Invalid latitude -> dropped
    ['OSM', 'EG', '3', 'مسجد خطأ', '', '', '', '', '', '', '99.5', '31.2'],
    // Zero (0,0) -> dropped
    ['OSM', 'EG', '4', 'مسجد صفر', '', '', '', '', '', '', '0', '0'],
    // Non-mosque cemetery -> dropped
    ['OSM', 'SA', '5', 'مقبرة البقيع', 'مقبرة البقيع', 'Al-Baqi Cemetery', '', '', '', '', '24.4672', '39.6156'],
    // Empty name kept with ""
    ['OSM', 'SA', '6', '', '', '', 'الرياض', '', '', '', '24.713601', '46.675309'],
    // Fallback to name_en when name and name_ar are empty
    ['OSM', 'SA', '7', '', '', 'King Fahd Mosque', '', '', '', '', '24.72', '46.68'],
  ];

  const { report, byCountry } = processMosqueRows(fixture);
  assert.equal(report.invalidCoordCount, 2);
  assert.equal(report.nonMosqueCount, 1);
  assert.equal(report.dupSourceIdCount, 1);
  assert.equal(report.dupSpatialCount, 1);
  assert.equal(report.keptCount, 3);

  assert.equal(byCountry.EG.length, 1);
  assert.equal(byCountry.EG[0].name, 'مسجد الرحمة');
  assert.equal(byCountry.EG[0].lat, roundCoord(30.0444199));
  assert.equal(byCountry.EG[0].lon, roundCoord(31.2357199));
  assert.equal(byCountry.EG[0].loc, 'القاهرة، وسط البلد');

  assert.equal(byCountry.SA.length, 2);
  assert.equal(byCountry.SA[0].name, '');
  assert.equal(byCountry.SA[1].name, 'King Fahd Mosque');
  assert.equal(normalizeDisplayName('Name', '', 'En'), 'Name');
});
