import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Runs the inline fill-only polyfills from index.html in a context where the APIs are missing (old system WebView).
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

function oldWebViewContext(crypto = {getRandomValues: arr => { for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 255; return arr; }}) {
  const ctx = {crypto};
  ctx.window = ctx;
  vm.createContext(ctx); // own intrinsics, so removing APIs here never touches the test runner
  vm.runInContext('delete Object.fromEntries; Promise.allSettled = undefined;', ctx);
  return ctx;
}

test('Object.fromEntries fills in when missing and keeps pairs, order and duplicates', () => {
  const ctx = oldWebViewContext();
  vm.runInContext(code, ctx);
  const out = vm.runInContext("Object.fromEntries([['b',1],['a',2],['b',3]].values())", ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(Object.entries(out))), [['b', 3], ['a', 2]]);
  const slot = vm.runInContext("Object.fromEntries([{id:'x'}].map(s=>[s.id,[]]))", ctx);
  assert.equal(JSON.stringify(slot.x), '[]');
  const proto = vm.runInContext("Object.fromEntries([['__proto__',1]])", ctx);
  assert.equal(Object.keys(proto)[0], '__proto__');
});

test('Promise.allSettled keeps order, accepts iterables and never rejects', async () => {
  const ctx = oldWebViewContext();
  vm.runInContext(code, ctx);
  const res = await vm.runInContext("Promise.allSettled(new Set([Promise.resolve(1), Promise.reject(new Error('x')), 3]))", ctx);
  assert.equal(res.map(r => r.status).join(), 'fulfilled,rejected,fulfilled');
  assert.equal(res[0].value, 1);
  assert.equal(res[1].reason.message, 'x');
  assert.equal(res[2].value, 3);
});

test('crypto.randomUUID is built from crypto.getRandomValues and has the v4 format', () => {
  const ctx = oldWebViewContext();
  vm.runInContext(code, ctx);
  const id = vm.runInContext('crypto.randomUUID()', ctx);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(/Math\.random/.test(code), false);
});

test('existing implementations are not replaced', () => {
  const ctx = {crypto: {randomUUID: () => 'native', getRandomValues: a => a}};
  ctx.window = ctx;
  vm.createContext(ctx);
  const before = vm.runInContext('[Object.fromEntries, Promise.allSettled]', ctx);
  vm.runInContext(code, ctx);
  const after = vm.runInContext('[Object.fromEntries, Promise.allSettled]', ctx);
  assert.equal(after[0], before[0]);
  assert.equal(after[1], before[1]);
  assert.equal(ctx.crypto.randomUUID(), 'native');
});
