// Regenerates android/app/src/test/resources/recurrence-parity.jsonl: the JS app's real output for daily and weekly custom
// reminders (buildNativeReminderPayloads over the far window, buildNativeRecurrenceRules, and upcomingOccurrences/nextDueDate
// beyond the planned window) in several time zones, across DST changes, with start/end dates, quiet hours and snooze.
// Generated in CI before testDebugUnitTest; not committed. Usage: node scripts/gen-recurrence-parity.cjs
const {spawnSync} = require('child_process');
const fs = require('fs'), path = require('path');
const OUT = 'android/app/src/test/resources/recurrence-parity.jsonl';
if (!process.env.PARITY_TZ) {
  const zones = ['UTC', 'Africa/Cairo', 'America/New_York', 'Pacific/Kiritimati', 'Asia/Riyadh', 'Pacific/Auckland', 'Europe/London'];
  fs.writeFileSync(OUT, '');
  for (const tz of zones) {
    const r = spawnSync('node', [__filename], {env: {...process.env, PARITY_TZ: tz, TZ: tz}, encoding: 'utf8', maxBuffer: 1 << 28});
    if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
    fs.appendFileSync(OUT, r.stdout);
  }
  console.log('written', OUT, fs.readFileSync(OUT, 'utf8').trim().split('\n').length, 'cases');
} else {
  const {buildSync} = require('esbuild'); fs.mkdirSync('tmp', {recursive: true});
  const outfile = path.join(process.cwd(), 'tmp', 'rp-' + process.env.PARITY_TZ.replace('/', '_') + '.cjs');
  buildSync({stdin: {contents: "export * from './src/notifications/native-prayer-scheduler'; export * from './src/notifications/native-recurrence-rules'; export {upcomingOccurrences} from './src/notifications/scheduler'; export {prayerId} from './src/lib/prayer-schedule'; export {isQuietHoursActive, DEFAULT_NOTIFICATION_PREFERENCE as P} from './src/notifications/types';", resolveDir: process.cwd(), loader: 'ts'}, bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'error', define: {'import.meta': '{"env":{}}'}, external: ['@capacitor/*']});
  const m = require(outfile);
  const scenarios = [
    {id: 'd1', rec: 'daily', base: '2026-10-20T08:30:00Z'},
    {id: 'd-ny-gap', rec: 'daily', base: '2026-03-01T07:30:00Z'},
    {id: 'd-cairo-gap', rec: 'daily', base: '2026-01-10T22:30:00Z'},
    {id: 'd-cairo-overlap', rec: 'daily', base: '2026-06-10T20:30:00Z'},
    {id: 'd-london-overlap', rec: 'daily', base: '2026-06-10T00:30:00Z'},
    {id: 'd-range', rec: 'daily', base: '2026-10-20T08:30:00Z', cfg: {start_date: '2026-11-10', end_date: '2026-12-03'}},
    {id: 'd-quiet-cross', rec: 'daily', base: '2026-10-20T21:15:00Z', quiet: {enabled: true, start: '23:00', end: '04:30'}},
    {id: 'd-quiet-day', rec: 'daily', base: '2026-10-20T10:00:00Z', quiet: {enabled: true, start: '09:00', end: '13:00'}},
    {id: 'd-snooze', rec: 'daily', base: '2026-10-20T08:30:00Z', snoozeFromNow: 20 * 60000},
    {id: 'w1', rec: 'weekly', base: '2026-11-04T10:30:00Z'},
    {id: 'w-late', rec: 'weekly', base: '2026-11-04T22:30:00Z'},
    {id: 'w-early', rec: 'weekly', base: '2026-11-04T00:10:00Z'},
    {id: 'w-range', rec: 'weekly', base: '2026-11-04T10:30:00Z', cfg: {start_date: '2026-11-15', end_date: '2026-12-31'}},
    {id: 'w-ny-gap', rec: 'weekly', base: '2026-03-04T07:30:00Z'},
    {id: 'w-quiet', rec: 'weekly', base: '2026-11-04T21:30:00Z', quiet: {enabled: true, start: '20:00', end: '23:59'}},
    {id: 'd-future-base', rec: 'daily', base: '2027-01-05T09:00:00Z'},
  ];
  const nows = ['2026-03-06T12:00:00Z', '2026-03-28T20:00:00Z', '2026-04-22T10:00:00Z', '2026-10-24T12:00:00Z', '2026-10-31T23:30:00Z', '2026-11-25T20:00:00Z'];
  const DAYS = 90;
  for (const sc of scenarios) for (const iso of nows) {
    const now = new Date(iso);
    const prefs = JSON.parse(JSON.stringify(m.P));
    prefs.global_enabled = true; prefs.dnd_enabled = false;
    if (sc.quiet) prefs.quiet_hours = sc.quiet;
    const reminder = {id: 'r-' + sc.id, title: 'T ' + sc.id, description: sc.id.endsWith('snooze') ? '' : 'D ' + sc.id, category: 'reminder', enabled: true,
      scheduled_at: new Date(sc.base).toISOString(), recurrence: sc.rec, recurrence_config: sc.cfg || {},
      snooze_until: sc.snoozeFromNow ? new Date(now.getTime() + sc.snoozeFromNow).toISOString() : undefined};
    const payloads = m.buildNativeReminderPayloads([reminder], prefs, now, 'al-rabbani-general', true, m.FAR_QUEUE);
    const rules = m.buildNativeRecurrenceRules([reminder], prefs, now, [], 'al-rabbani-general');
    const rulesAfter = m.buildNativeRecurrenceRules([reminder], prefs, now, payloads, 'al-rabbani-general');
    const frontier = rulesAfter.length ? rulesAfter[0].frontierMs : now.getTime();
    const toMs = now.getTime() + (sc.rec === 'weekly' || sc.cfg ? 400 : DAYS) * 86400000;
    const from = Math.max(frontier, now.getTime());
    const tail = [];
    for (const at of m.upcomingOccurrences(reminder, new Date(from), 400)) {
      const t = at.getTime();
      if (t > toMs) break;
      if (t <= now.getTime() + 1000) continue;
      const sn = reminder.snooze_until ? new Date(reminder.snooze_until).getTime() : null;
      if (sn && at <= new Date(sn) && sn - t <= 3600000) continue;
      if (m.isQuietHoursActive(prefs, at)) continue;
      tail.push({id: m.prayerId('rem', reminder.id + ':' + at.toISOString()), at: t});
    }
    process.stdout.write(JSON.stringify({tz: process.env.PARITY_TZ, scenario: sc.id, nowMs: now.getTime(), toMs,
      rulesNoFrontier: rules, rulesAfterPlan: rulesAfter,
      // the one-off snooze notification is registered by the app itself, not part of the recurrence
      payloads: payloads.filter(p => !(reminder.snooze_until && p.id === m.prayerId('rem-snooze', reminder.id + ':' + new Date(reminder.snooze_until).toISOString()))).map(p => ({id: p.id, at: p.schedule.at.getTime(), title: p.title, body: p.body, channelId: p.channelId})),
      tail}) + '\n');
  }
}
