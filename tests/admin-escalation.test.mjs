import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

// Admin grant issuance and payment-audit authorization on the final schema.
const A = '00000000-0000-0000-0000-0000000000a1'; // allowlisted + confirmed -> admin
const B = '00000000-0000-0000-0000-0000000000b2'; // ordinary member
const C = '00000000-0000-0000-0000-0000000000c3'; // allowlisted but unconfirmed -> not admin
const D = '00000000-0000-0000-0000-0000000000d4'; // second admin (to test actor spoofing)

test('admin grants require allowlist + confirmed email; members cannot self-escalate; payment audit writes are admin-only and self-attributed', async () => {
  const db = new PGlite();
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  const as = async (uid, role, fn) => {
    await db.exec(`set request.jwt.claim.sub = '${uid ?? ''}'; set role ${role}`);
    try { return await fn(); } finally { await db.exec('reset role'); }
  };
  const code = (c) => (e) => e.code === c;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key, bucket_id text, name text); alter table storage.objects enable row level security;`);
    await db.exec('begin'); await applyMigrations(client, await readMigrations()); await db.exec('commit');
    await db.exec(`insert into private.admin_allowlist(email) values ('admin@example.test'),('pending@example.test'),('second@example.test');
      insert into auth.users(id,email,email_confirmed_at) values
        ('${A}','admin@example.test',now()),('${B}','member@example.test',now()),('${C}','pending@example.test',null),('${D}','second@example.test',now());`);
    const isAdmin = async (uid) => (await db.query('select exists(select 1 from public.admin_accounts where user_id=$1) as a', [uid])).rows[0].a;
    assert.equal(await isAdmin(A), true);
    assert.equal(await isAdmin(D), true);
    assert.equal(await isAdmin(B), false, 'a confirmed non-allowlisted member is not an admin');
    assert.equal(await isAdmin(C), false, 'an unconfirmed allowlisted email is not an admin');

    // A member cannot write admin tables, the allowlist, or grant admin.
    await as(B, 'authenticated', async () => {
      await assert.rejects(db.query('insert into public.admin_accounts(user_id) values ($1)', [B]), code('42501'));
      await assert.rejects(db.query('update public.admin_accounts set user_id=$1', [B]), code('42501'));
      await assert.rejects(db.query('delete from public.admin_accounts'), code('42501'));
      await assert.rejects(db.query(`insert into private.admin_allowlist(email) values ('member@example.test')`), code('42501'));
      await assert.rejects(db.query('select public.admin_set_admin($1,true)', [B]), code('42501'));
    });
    await as(null, 'anon', async () => {
      await assert.rejects(db.query('select public.admin_set_admin($1,true)', [B]), code('42501'));
    });
    assert.equal(await isAdmin(B), false);

    // payment audit: admin as self succeeds; spoofing another actor, member, and anon are rejected.
    const audit = (actor) => db.query(`select public.record_payment_audit($1,'t','payment_order','x','{}') as r`, [actor]);
    assert.equal((await as(A, 'authenticated', () => audit(A))).rows[0].r.ok, true);
    await as(A, 'authenticated', async () => { await assert.rejects(audit(D), code('42501')); await assert.rejects(audit(B), code('42501')); });
    await as(B, 'authenticated', async () => { await assert.rejects(audit(B), code('42501')); await assert.rejects(audit(A), code('42501')); });
    await as(null, 'anon', async () => { await assert.rejects(audit(A), code('42501')); });
    const n = (await db.query(`select count(*)::int as n from public.payment_audit_logs where action='t'`)).rows[0].n;
    assert.equal(n, 1, 'only the legitimate admin audit row exists');
  } finally { await db.close(); }
});
