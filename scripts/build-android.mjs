// بناء حزمة الويب لتطبيق الأندرويد ثم مزامنتها مع مشروع Capacitor.
// يضمن توليد أيقونات وشاشات إقلاع الأندرويد أولًا قبل البناء والمزامنة.
import {spawnSync} from 'node:child_process';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {stdio: 'inherit', env, shell: process.platform === 'win32'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['scripts/generate-capacitor-assets.mjs']);
run('npm', ['run', 'build'], {...process.env, VITE_LOCAL_ONLY: 'true'});
run('npx', ['cap', 'sync', 'android']);
console.log('Android assets and Capacitor sync ready.');
