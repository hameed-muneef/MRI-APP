// Cleaning and bundling helpers for the Arab mosques OSM CSV dataset.
// Pure ESM with zero external dependencies so it runs on Node 22+ directly.

export const EXPECTED_HEADERS = [
  'source',
  'country_code',
  'source_id',
  'name',
  'name_ar',
  'name_en',
  'city',
  'address',
  'phone',
  'website',
  'lat',
  'lon',
];

export const OSM_ATTRIBUTION = '© مساهمو OpenStreetMap — قد تكون البيانات غير مكتملة';

/** Parse RFC-4180 CSV text, stripping optional UTF-8 BOM. */
export function parseCsv(input) {
  const src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const MOJIBAKE_RE = /(?:Ø[\x80-\xBF]|Ù[\x80-\xBF]|Ã[\x80-\xBF]|â[\x80-\xBF]{2})/;
const ARABIC_RE = /[\u0600-\u06FF]/;

/**
 * Repair double-encoded UTF-8 (UTF-8 bytes misread as Latin-1/Windows-1252 and re-encoded as UTF-8).
 * Returns { value, repaired } where repaired=true if text was fixed.
 */
export function repairDoubleEncoding(value) {
  if (!value || !MOJIBAKE_RE.test(value)) {
    return { value, repaired: false };
  }
  try {
    const bytes = Uint8Array.from([...value].map((ch) => ch.charCodeAt(0) & 0xff));
    // Only valid if all original chars fit into single-byte Latin-1 range
    if ([...value].some((ch) => ch.charCodeAt(0) > 0xff)) {
      return { value, repaired: false };
    }
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (ARABIC_RE.test(decoded) && !MOJIBAKE_RE.test(decoded)) {
      return { value: decoded, repaired: true };
    }
  } catch {
    // Not valid UTF-8 bytes
  }
  return { value, repaired: false };
}

/** Decode buffer preferring UTF-8, checking for BOM or replacement chars. */
export function decodeCsvBuffer(buf) {
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.toString('utf8', hasBom ? 3 : 0);
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  return {
    encoding: hasBom ? 'utf-8-bom' : 'utf-8',
    hasBom,
    replacementCount,
    text,
  };
}

// Unicode-aware letter/digit boundary so Arabic prefixes/suffixes don't cause substring false positives
// (e.g. "جامع" will NOT match inside "جامعة").
const BOUNDARY_START = '(?<![\\p{L}\\p{N}_])';
const BOUNDARY_END = '(?![\\p{L}\\p{N}_])';
const wb = (pattern) => `${BOUNDARY_START}(?:${pattern})${BOUNDARY_END}`;

const MOSQUE_WHITELIST_RE = new RegExp(
  [
    wb('(?:ال|وال|بال|كال|لل)?(?:مسجد|مساجد|جامع|جوامع|مصلى|مصلّى|مصلي|زاوية|تكية)'),
    wb('mosqu[eé]e?s?|masjid|jame|jami|jamia|musalla|mussalla|prayer\\s*(?:room|hall)|salle\\s+de\\s+pri[èe]re'),
  ].join('|'),
  'iu',
);

export const NON_MOSQUE_RULES = [
  {
    id: 'other_religion',
    alwaysDrop: true,
    label: 'دور عبادة غير إسلامية',
    re: new RegExp(
      [
        wb('(?:ال|لل)?(?:كنيسة|كنائس|كنيس|معبد|معابد|دير|أديرة|كاتدرائية)'),
        wb('church|chapel|cathedral|[ée]glise|synagogue|temple|monastery'),
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'cemetery',
    alwaysDrop: false,
    label: 'مقابر ومدافن وأضرحة',
    re: new RegExp(
      [
        wb('(?:ال|لل)?(?:مقبرة|مقابر|جبانة|جبانات|مدفن|مدافن|تربة|قبر|قبور|ضريح|أضرحة)'),
        wb('cimeti[èe]res?|cemetery|cemeteries|graveyard|graves?|tombs?|mausol[ée]e?s?'),
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'university_dorm',
    alwaysDrop: false,
    label: 'إقامات وأحياء جامعية',
    re: new RegExp(
      [
        wb('(?:ال)?(?:إقامة|اقامة)\\s+(?:ال)?جامعية'),
        wb('(?:ال)?(?:حي|سكن|مدينة)\\s+(?:ال)?جامعي(?:ة)?'),
        wb('r[ée]sidence\\s+universitaire|cit[ée]\\s+universitaire|university\\s+residence|student\\s+housing|dormitor(?:y|ies)'),
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'university_school',
    alwaysDrop: false,
    label: 'جامعات وكليات ومدارس',
    re: new RegExp(
      [
        wb('(?:ال|ل?ل)?(?:جامعة|جامعات|جامعي|جامعية|كلية|كليات|معهد|معاهد|مدرسة|مدارس|ثانوية|متوسطة|ابتدائية|إعدادية|اعدادية|أكاديمية|اكاديمية)'),
        wb('universit[yé]|univercity|college|facult[yé]|institute?|school|lyc[ée]e|[ée]cole|académie|academy'),
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'hospital_clinic',
    alwaysDrop: false,
    label: 'مستشفيات وعيادات',
    re: new RegExp(
      [
        wb('(?:ال|لل)?(?:مستشفى|مستشفيات|مستوصف|عيادة|مصحة|مركز\\s+صحي|المركز\\s+الاستشفائي)'),
        wb('h[ôo]pital|hospital|clinic|clinique|dispensary'),
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'street_transit_prefix',
    alwaysDrop: true,
    label: 'شوارع وطرق ومحطات وساحات مسماة باسم مسجد',
    re: new RegExp(
      [
        `^(?:ال)?(?:شارع|طريق|نهج|زقاق|حارة|درب|ممر|محطة|موقف|حديقة|ساحة|جسر|كوبري|نفق|دوار|ميدان|مزلقان)\\s+`,
        `^(?:rue|avenue|boulevard|road|street|lane|alley|impasse|place|square)\\s+`,
      ].join('|'),
      'iu',
    ),
  },
  {
    id: 'roads_transit_civic',
    alwaysDrop: false,
    label: 'طرق ومحطات ومرافق مدنية وتجارية',
    re: new RegExp(
      [
        wb('(?:ال|لل)?(?:طريق|شارع|نهج|محطة|موقف|مطار|ميناء|فندق|ملعب|حديقة|سوق|بنك|شركة|مطعم|مقهى|متحف|مكتبة|مركز\\s+ثقافي|دار\\s+الثقافة|محكمة|بلدية|ولاية|مديرية)'),
        wb('bus\\s*stop|station|airport|hotel|stadium|market|bank|restaurant|caf[ée]|museum|library|mall|supermarket'),
      ].join('|'),
      'iu',
    ),
  },
];

/** Return matched non-mosque rule id or null if row is a valid mosque candidate. */
export function classifyNonMosque(name, nameAr, nameEn) {
  const displayCandidate = cleanWhitespace(nameAr) || cleanWhitespace(name) || cleanWhitespace(nameEn);
  const combined = [name, nameAr, nameEn].map((s) => (s || '').trim()).filter(Boolean).join(' | ');
  if (!combined) return null;
  const hasMosqueKeyword = MOSQUE_WHITELIST_RE.test(combined);
  for (const rule of NON_MOSQUE_RULES) {
    const target = rule.id === 'street_transit_prefix' ? displayCandidate : combined;
    if (rule.re.test(target)) {
      if (rule.alwaysDrop || !hasMosqueKeyword) {
        return rule.id;
      }
    }
  }
  return null;
}

export function cleanWhitespace(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

export function normalizeDisplayName(name, nameAr, nameEn) {
  return cleanWhitespace(nameAr) || cleanWhitespace(name) || cleanWhitespace(nameEn) || '';
}

export function normalizeNameForDedupe(name) {
  return cleanWhitespace(name)
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip Arabic tashkeel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

export function roundCoord(val) {
  return Math.round(val * 1e5) / 1e5;
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isValidCoordinate(latStr, lonStr) {
  if (latStr === undefined || lonStr === undefined) return false;
  const latTrim = String(latStr).trim();
  const lonTrim = String(lonStr).trim();
  if (!latTrim || !lonTrim) return false;
  const lat = Number(latTrim);
  const lon = Number(lonTrim);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

/**
 * Inspect and clean parsed CSV rows.
 * Returns detailed report + cleaned records grouped by country_code.
 */
export function processMosqueRows(rawRows, options = {}) {
  const dedupeRadiusMeters = options.dedupeRadiusMeters ?? 15;
  if (!rawRows.length) {
    throw new Error('CSV is empty');
  }
  const header = rawRows[0].map((h) => h.trim());
  const missingHeaders = EXPECTED_HEADERS.filter((h) => !header.includes(h));
  if (missingHeaders.length) {
    throw new Error(`Missing expected headers: ${missingHeaders.join(', ')}`);
  }
  const col = Object.fromEntries(header.map((h, i) => [h, i]));
  const dataRows = rawRows.slice(1).filter((r) => !(r.length === 1 && r[0].trim() === ''));

  const fillCounts = Object.fromEntries(header.map((h) => [h, 0]));
  const countryRawCounts = {};
  const shiftedRows = [];
  const invalidCoordSamples = [];
  const doubleEncodedSamples = [];
  let doubleEncodedRepairs = 0;
  let invalidCoordCount = 0;

  const nonMosqueCounts = {};
  const nonMosqueSamples = {};
  let nonMosqueCount = 0;

  const seenSourceIds = new Set();
  let dupSourceIdCount = 0;
  const dupSourceIdSamples = [];

  const candidates = [];

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i];
    if (row.length !== header.length) {
      if (shiftedRows.length < 10) shiftedRows.push({ rowIndex: i + 2, length: row.length, sample: row.slice(0, 6) });
      continue;
    }

    // Repair double-encoding if present on any text field
    const fixedRow = row.map((cell) => {
      const { value, repaired } = repairDoubleEncoding(cell);
      if (repaired) {
        doubleEncodedRepairs += 1;
        if (doubleEncodedSamples.length < 10) {
          doubleEncodedSamples.push({ before: cell, after: value });
        }
      }
      return value;
    });

    for (let c = 0; c < header.length; c += 1) {
      if (fixedRow[c] && fixedRow[c].trim() !== '') {
        fillCounts[header[c]] += 1;
      }
    }

    const cc = cleanWhitespace(fixedRow[col.country_code]).toUpperCase() || 'UNKNOWN';
    countryRawCounts[cc] = (countryRawCounts[cc] || 0) + 1;

    const latRaw = fixedRow[col.lat];
    const lonRaw = fixedRow[col.lon];
    if (!isValidCoordinate(latRaw, lonRaw)) {
      invalidCoordCount += 1;
      if (invalidCoordSamples.length < 10) {
        invalidCoordSamples.push({ cc, sid: fixedRow[col.source_id], lat: latRaw, lon: lonRaw });
      }
      continue;
    }

    const sourceId = cleanWhitespace(fixedRow[col.source_id]);
    const name = fixedRow[col.name];
    const nameAr = fixedRow[col.name_ar];
    const nameEn = fixedRow[col.name_en];
    const city = cleanWhitespace(fixedRow[col.city]);
    const address = cleanWhitespace(fixedRow[col.address]);

    const nonMosqueRule = classifyNonMosque(name, nameAr, nameEn);
    if (nonMosqueRule) {
      nonMosqueCount += 1;
      nonMosqueCounts[nonMosqueRule] = (nonMosqueCounts[nonMosqueRule] || 0) + 1;
      if (!nonMosqueSamples[nonMosqueRule]) nonMosqueSamples[nonMosqueRule] = [];
      if (nonMosqueSamples[nonMosqueRule].length < 5) {
        nonMosqueSamples[nonMosqueRule].push({
          cc,
          sid: sourceId,
          name: cleanWhitespace(name),
          name_ar: cleanWhitespace(nameAr),
          name_en: cleanWhitespace(nameEn),
        });
      }
      continue;
    }

    if (sourceId) {
      if (seenSourceIds.has(sourceId)) {
        dupSourceIdCount += 1;
        if (dupSourceIdSamples.length < 5) {
          dupSourceIdSamples.push({ cc, sid: sourceId, displayName: normalizeDisplayName(name, nameAr, nameEn) });
        }
        continue;
      }
      seenSourceIds.add(sourceId);
    }

    const lat = roundCoord(Number(latRaw));
    const lon = roundCoord(Number(lonRaw));
    const displayName = normalizeDisplayName(name, nameAr, nameEn);
    const locationText = [city, address]
      .filter((v, idx, arr) => v && (idx === 0 || v.toLowerCase() !== arr[0].toLowerCase()))
      .join('، ');

    candidates.push({
      id: sourceId || `${cc}_${i}`,
      cc,
      name: displayName,
      normName: normalizeNameForDedupe(displayName),
      loc: locationText,
      lat,
      lon,
    });
  }

  // Spatial deduplication within same country_code and same normalized name (within dedupeRadiusMeters)
  // Grid bucket ~0.001 deg (~111m) for O(N) neighbor check
  const bucketMap = new Map();
  let dupSpatialCount = 0;
  const dupSpatialSamples = [];
  const byCountry = {};

  for (const item of candidates) {
    let isDup = false;
    if (item.normName) {
      const bx = Math.floor(item.lat * 1000);
      const by = Math.floor(item.lon * 1000);
      outer: for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const key = `${item.cc}:${bx + dx}:${by + dy}`;
          const list = bucketMap.get(key);
          if (!list) continue;
          for (const existing of list) {
            if (
              existing.normName === item.normName &&
              haversineMeters(existing.lat, existing.lon, item.lat, item.lon) <= dedupeRadiusMeters
            ) {
              isDup = true;
              dupSpatialCount += 1;
              if (dupSpatialSamples.length < 8) {
                dupSpatialSamples.push({
                  cc: item.cc,
                  name: item.name,
                  keptId: existing.id,
                  droppedId: item.id,
                  distMeters: Math.round(haversineMeters(existing.lat, existing.lon, item.lat, item.lon) * 10) / 10,
                });
              }
              break outer;
            }
          }
        }
      }
    }

    if (isDup) continue;

    if (item.normName) {
      const key = `${item.cc}:${Math.floor(item.lat * 1000)}:${Math.floor(item.lon * 1000)}`;
      let list = bucketMap.get(key);
      if (!list) {
        list = [];
        bucketMap.set(key, list);
      }
      list.push(item);
    }

    if (!byCountry[item.cc]) byCountry[item.cc] = [];
    byCountry[item.cc].push(item);
  }

  const totalInput = dataRows.length;
  const keptCount = Object.values(byCountry).reduce((sum, arr) => sum + arr.length, 0);
  const removedCount = totalInput - keptCount;
  const removedPct = totalInput > 0 ? (removedCount / totalInput) * 100 : 0;

  return {
    report: {
      totalRows: totalInput,
      shiftedRowsCount: shiftedRows.length,
      shiftedRows,
      fillRates: Object.fromEntries(
        Object.entries(fillCounts).map(([k, v]) => [
          k,
          { count: v, pct: totalInput ? Number(((v / totalInput) * 100).toFixed(1)) : 0 },
        ]),
      ),
      doubleEncodedRepairs,
      doubleEncodedSamples,
      invalidCoordCount,
      invalidCoordSamples,
      nonMosqueCount,
      nonMosqueCounts,
      nonMosqueSamples,
      dupSourceIdCount,
      dupSourceIdSamples,
      dupSpatialCount,
      dupSpatialSamples,
      keptCount,
      removedCount,
      removedPct: Number(removedPct.toFixed(2)),
      countryRawCounts,
      countryKeptCounts: Object.fromEntries(
        Object.entries(byCountry)
          .map(([cc, arr]) => [cc, arr.length])
          .sort((a, b) => b[1] - a[1]),
      ),
    },
    byCountry,
  };
}
