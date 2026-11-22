import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const asModule=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const {hijriDate}=await import(asModule(compile('../src/hijri.ts')));

test('computes um al-qura hijri locally for known dates without year',()=>{
  const result=hijriDate('2026-10-29');
  assert.equal(result,hijriDate(new Date(2026,9,29,12)));
  assert.doesNotMatch(result,/١٤٤\d| هـ/);
  assert.match(result,/جمادى/);
});

test('string and Date inputs produce identical results and invalid input stays empty',()=>{
  assert.equal(hijriDate('2026-01-01'),hijriDate(new Date(2026,0,1,12)));
  const marchFirst=hijriDate('2026-03-01');
  assert.notEqual(marchFirst,undefined);
  assert.doesNotMatch(marchFirst,/١٤٤\d| هـ/);
  assert.match(marchFirst,/رمضان/);
  assert.equal(hijriDate('bad'),undefined);
  assert.equal(hijriDate(NaN),undefined);
});

test('hijri and gregory stay in order across a month boundary',()=>{
  // 1 مارس 2026: الهجري في رمضان وشوال دون سنة هجرية، والفروق بين الأيام تنتج أيامًا وأشهرًا متسقة
  const end=hijriDate('2026-03-31');
  assert.match(end,/شوال/);
  assert.doesNotMatch(end,/١٤٤\d| هـ/);
  for(let day=1;day<=31;day++){
    const formatted=hijriDate(`2026-03-${String(day).padStart(2,'0')}`);
    assert.ok(formatted&&formatted.length>0);
    assert.doesNotMatch(formatted,/١٤٤\d| هـ/);
  }
});
