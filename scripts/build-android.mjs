// Build for the Android (mobile) variant: generates assets, builds the web bundle
// in LOCAL_ONLY mode, drops the large offline book PDFs (mobile ships without
// them), then syncs Capacitor.
import {spawnSync} from 'node:child_process';
import {rmSync} from 'node:fs';

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {stdio: 'inherit', env, shell: process.platform === 'win32'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, ['scripts/generate-capacitor-assets.mjs']);
run('npm', ['run', 'build'], {...process.env, VITE_LOCAL_ONLY: 'true'});
try { rmSync('dist/books', {recursive: true, force: true}); } catch {}
run('npx', ['cap', 'sync', 'android']);
console.log('Android assets and Capacitor sync ready (books excluded).');
