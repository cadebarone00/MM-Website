import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const migration = readFileSync(new URL('../supabase/player_slots_password_created.sql', import.meta.url), 'utf8');
try {
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, encrypted_password text);
    create table public.profiles (id uuid primary key references auth.users on delete cascade);
    create table public.player_slots (player_slug text primary key, claimed_by uuid references public.profiles on delete set null);
    insert into auth.users values ('00000000-0000-0000-0000-000000000001', 'test-hash'), ('00000000-0000-0000-0000-000000000002', null);
    insert into public.profiles select id from auth.users;
    insert into public.player_slots values ('existing', '00000000-0000-0000-0000-000000000001'), ('invited', '00000000-0000-0000-0000-000000000002'), ('unlinked', null);
  `);
  const status = async (slug) => (await db.query('select password_created from public.player_slots where player_slug = $1', [slug])).rows[0].password_created;
  await db.exec(migration);
  assert.equal(await status('existing'), true);
  assert.equal(await status('invited'), false);
  assert.equal(await status('unlinked'), false);
  await db.exec("update auth.users set encrypted_password = 'new-hash' where id = '00000000-0000-0000-0000-000000000002'");
  assert.equal(await status('invited'), true);
  await db.exec("update public.player_slots set password_created = false where player_slug = 'existing'");
  assert.equal(await status('existing'), true);
  await db.exec("update public.player_slots set claimed_by = null where player_slug = 'existing'");
  assert.equal(await status('existing'), false);
  await db.exec("update public.player_slots set claimed_by = '00000000-0000-0000-0000-000000000001' where player_slug = 'unlinked'");
  assert.equal(await status('unlinked'), true);
  await db.exec("update auth.users set encrypted_password = '' where id = '00000000-0000-0000-0000-000000000002'");
  assert.equal(await status('invited'), false);
  await db.exec(migration);
  assert.equal(await status('unlinked'), true);
  await db.exec("delete from auth.users where id = '00000000-0000-0000-0000-000000000001'");
  assert.equal(await status('unlinked'), false);
  console.log('PASS: backfill, invitations, password creation/removal, derived-only status, linking/unlinking, account deletion, and migration rerun.');
} finally {
  await db.close();
}
