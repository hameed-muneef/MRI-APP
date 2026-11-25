import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

// Regression: the anon role must hold no table privilege in public, and signed-in users keep theirs.
test('anon has no table privileges in public; authenticated keeps notification table access', async () => {
  const db = new PGlite();
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, public to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key, bucket_id text, name text);
      alter table storage.objects enable row level security;`);
    await db.exec('begin');
    await applyMigrations(client, await readMigrations());
    await db.exec('commit');
    const anon = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','v','m','p')
      and (has_table_privilege('anon',c.oid,'select') or has_table_privilege('anon',c.oid,'insert')
        or has_table_privilege('anon',c.oid,'update') or has_table_privilege('anon',c.oid,'delete'))`)).rows;
    assert.deepEqual(anon, [], 'anon must have no table privileges');
    for (const t of ['reminders', 'notification_settings', 'notification_events', 'audio_resources', 'device_tokens']) {
      const r = (await db.query(`select has_table_privilege('authenticated','public.${t}','select,insert,update,delete') as ok,
        has_table_privilege('service_role','public.${t}','select,insert,update,delete') as svc`)).rows[0];
      assert.equal(r.ok, true, `authenticated keeps access to ${t}`);
      assert.equal(r.svc, true, `service_role keeps access to ${t}`);
    }
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.reminders'), error => error.code === '42501');
    await db.exec('reset role');
  } finally {
    await db.close();
  }
});
