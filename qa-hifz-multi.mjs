// Repeatable multi-segment regression: runs browser QA scripts against ./dist and asserts on their output.
import {execFileSync} from 'node:child_process';
const run = f => execFileSync('node', [f], {encoding: 'utf8', timeout: 110000});
const fails = [];
const must = (name, ok) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) fails.push(name); };
const x = run('qa-x.mjs');
must('6 segments created for pages 603-604', /"passages":\["109:1-6","110:1-3","111:1-5","112:1-4","113:1-5","114:1-6"\]/.test(x));
must('resume restores all segments', /تابع من حيث توقفت: الكافرون.*الناس/.test(x));
must('finish: 6 attempts/assessments/schedules/projections', /"att":6,"ass":6,"sch":6,"proj":6/.test(x));
const y = run('qa-y.mjs');
const req = (y.match(/requested (.*)/) || [])[1]?.trim().split(' ') ?? [];
must('29 verses requested', /count 29/.test(y) && req.length === 29);
must('boundary order is mushaf order', req[0] === '109:1' && req[6] === '110:1' && req[28] === '114:6');
must('page follow 603->604 and ended event', /صفحة ٦٠٣/.test(y) && /صفحة ٦٠٤/.test(y) && /status end اكتمل/.test(y));
const w = run('qa-w.mjs');
must('scheduled: one task, 6 schedules', /"tasks":\[\["[0-9a-f]+-[^"]*",109,5\]\],"sch":\[("[^"]*",?){6}\]/.test(w));
must('reopen restores all 6 sessions with tail', /recite,recite,recite,recite,recite,recite"/.test(w) && /٦ سور/.test(w));
const pm = run('qa-plans-multi.mjs');
must('plans-card due button reopens the whole 6-surah group (hint)', (pm.match(/hint الكافرون: ١–٦ \+ النصر.*الناس: ١–٦ · تُفتح كل المقاطع معًا\./g) || []).length === 2);
must('reader opens with 6 open sessions and 5-segment tail saved', (pm.match(/"open":6,"groups":6,"saved":5/g) || []).length === 2);
if (fails.length) { console.error('FAILED:', fails.join('; ')); process.exit(1); }
console.log('HIFZ MULTI-SEGMENT QA PASS');
