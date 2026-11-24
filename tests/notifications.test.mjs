import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {applyMigrations, readMigrations} from '../scripts/database-migrations.mjs';

test('notifications: self delivery, read state, privacy, direct-write denial', async () => {
  const db = new PGlite({extensions: {pgcrypto}});
  const client = {query: async (sql, params) => params ? db.query(sql, params) : (await db.exec(sql)).at(-1)};
  const founder = '11111111-1111-4111-8111-111111111111';
  const member = '22222222-2222-4222-8222-222222222222';
  const admin = '33333333-3333-4333-8333-333333333333';
  const outsider = '44444444-4444-4444-8444-444444444444';
  async function asUser(id, fn) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    try { await fn(); } finally { await db.exec('reset role'); }
  }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth, public to anon, authenticated;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key, bucket_id text, name text);
      alter table storage.objects enable row level security; create extension if not exists pgcrypto;`);
    await db.exec(`insert into auth.users(id) values ('${founder}'),('${member}'),('${admin}'),('${outsider}')`);
    await db.exec('begin');
    await applyMigrations(client, await readMigrations());
    await db.exec('commit');
    await db.query('insert into public.admin_accounts(user_id) values($1)', [admin]);

    // Group creation was retired. Administrative delivery remains supported.
    // 1) founder notifies member (allowed) → id returned.
    let notifId = '';
    await asUser(member, async () => {
      notifId = (await db.query('select public.notify_self($1,$2,$3,$4)', ['reminder', 'عنوان', 'نص', ''])).rows[0].notify_self;
      assert.match(notifId, /^[0-9a-f-]{36}$/i);
    });

    // 2) member sees it; unread count 1.
    await asUser(member, async () => {
      assert.equal((await db.query('select public.unread_notification_count()')).rows[0].unread_notification_count, 1);
      const list = (await db.query('select * from public.list_notifications($1)', [10])).rows;
      assert.equal(list.length, 1);
      assert.equal(list[0].notification_title, 'عنوان');
    });

    // 3) mark read → unread 0.
    await asUser(member, async () => {
      await db.query('select public.mark_notification_read($1)', [notifId]);
      assert.equal((await db.query('select public.unread_notification_count()')).rows[0].unread_notification_count, 0);
      await db.query('select public.mark_all_notifications_read()');
    });

    // 4) privacy: outsider doesn't see member's notification.
    await asUser(outsider, async () => {
      assert.equal((await db.query('select count(*)::int as n from public.notifications')).rows[0].n, 0);
    });

    // Removed member-to-member delivery is not revived by the local app.
    await asUser(member, async () => {
      await assert.rejects(db.query("select public.notify_self('announcement','x','','')"),e=>e.code==='22023');
      await assert.rejects(db.query("select public.notify_self('reminder','','','')"),e=>e.code==='22023');
    });

    // 8) direct write denied.
    await asUser(member, async () => {
      await assert.rejects(db.query("insert into public.notifications(recipient_id,kind,title) values($1,'system','x')", [member]), e => e.code === '42501');
    });
  } finally { await db.close(); }
});
