// Regenerates android/app/src/test/resources/native-plan-parity.jsonl: the JS scheduler's real output
// (buildNativeAdhanAlarmInputs) and persisted recompute spec for several timezones/DST boundaries/settings.
// Generated in CI (and locally) before testDebugUnitTest; not committed. Usage: node scripts/gen-native-plan-parity.cjs
const {spawnSync} = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const OUT = 'android/app/src/test/resources/native-plan-parity.jsonl';
if (!process.env.PARITY_TZ) {
  const zones = ['UTC', 'Africa/Cairo', 'America/Los_Angeles', 'Europe/London', 'Pacific/Auckland', 'Asia/Kolkata', 'America/Sao_Paulo'];
  fs.writeFileSync(OUT, '');
  for (const tz of zones) {
    const r = spawnSync('node', [__filename], {env: {...process.env, PARITY_TZ: tz, TZ: tz}, encoding: 'utf8', maxBuffer: 1 << 28});
    if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
    fs.appendFileSync(OUT, r.stdout);
  }
  console.log('written', OUT, fs.readFileSync(OUT, 'utf8').trim().split('\n').length, 'cases');
} else {
  const {buildSync} = require('esbuild'); fs.mkdirSync('tmp', {recursive: true});
  const outfile = path.join(process.cwd(), 'tmp', 'np-' + process.env.PARITY_TZ.replace('/', '_') + '.cjs');
  buildSync({stdin: {contents: "export * from './src/notifications/native-prayer-scheduler'; export * from './src/notifications/native-recompute-spec'; export {DEFAULT_NOTIFICATION_PREFERENCE as P} from './src/notifications/types';", resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'error', external: ['@capacitor/*']});
  const m = require(outfile);
  const locs = [[21.4225, 39.8262, 'UmmAlQura'], [30.0444, 31.2357, 'Egyptian'], [51.5074, -0.1278, 'MuslimWorldLeague'], [69.6492, 18.9553, 'MuslimWorldLeague'],
    [34.0522, -118.2437, 'NorthAmerica'], [-36.8485, 174.7633, 'MuslimWorldLeague'], [28.6139, 77.209, 'Karachi'], [-23.55, -46.63, 'MuslimWorldLeague'], [1.3521, 103.8198, 'Singapore'], [35.6892, 51.389, 'Tehran'], [41.0082, 28.9784, 'Turkey']];
  // "now" instants straddle DST changes for the zones above (2026) plus ordinary days.
  const nows = ['2026-03-07T12:00:00Z', '2026-03-28T20:00:00Z', '2026-04-04T10:00:00Z', '2026-09-25T12:00:00Z', '2026-10-24T12:00:00Z', '2026-10-31T23:30:00Z', '2026-11-25T11:00:00Z'];
  const adjustSets = [{}, {Fajr: 3, Dhuhr: -2, Asr: 5, Maghrib: 1, Isha: -4}];
  const keys = {Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء'};
  let n = 0;
  for (const [lat, lon, method] of locs) for (const iso of nows) for (let v = 0; v < 2; v++) {
    const prefs = JSON.parse(JSON.stringify(m.P));
    prefs.global_enabled = true; prefs.dnd_enabled = false;
    prefs.categories = {...(prefs.categories || {}), prayer: true};
    for (const k of Object.keys(keys)) {
      const s = prefs.prayer_settings[keys[k]]; s.enabled = true; s.adhan_type = 'full';
      s.adjust_minutes = adjustSets[v][k] ?? 0;
    }
    if (v === 1) {
      prefs.prayer_settings['الظهر'].adhan_type = 'short';
      prefs.prayer_settings['العصر'].adhan_type = 'silent';
      prefs.prayer_settings['المغرب'].enabled = false;
      prefs.quiet_hours = {enabled: true, start: '23:00', end: '04:30'};
    }
    const location = {latitude: lat, longitude: lon, method: undefined, school: v === 1 ? 1 : 0, label: 'x'};
    const now = new Date(iso);
    const opts = {location, prefs, method, madhab: v === 1 ? 'Hanafi' : 'Shafi', days: 7, now, defaultAdhanId: undefined};
    const expected = m.buildNativeAdhanAlarmInputs(opts);
    const spec = m.buildNativeRecomputeSpec(opts);
    process.stdout.write(JSON.stringify({tz: process.env.PARITY_TZ, nowMs: now.getTime(), spec, expected}) + '\n');
    n++;
  }
}
