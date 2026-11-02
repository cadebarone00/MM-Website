// Runs supabase/ribbon_content.sql on a throwaway in-memory database and checks its rules. Never touches a real project.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
const sql = readFileSync(new URL('../supabase/ribbon_content.sql', import.meta.url), 'utf8');
const refused = async (query, params = []) => { await assert.rejects(() => db.query(query, params)); };
const insert = (id, status, publishAt, extra = {}) => db.query(
  `insert into ribbon_content(id, kind, tab, format, status, publish_at, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
  [id, extra.kind ?? 'post', extra.tab ?? 'News', extra.format === undefined ? 'story' : extra.format, status, publishAt, extra.by ?? null]);
const asRole = async (role, fn) => { await db.exec(`set role ${role}`); try { return await fn(); } finally { await db.exec('reset role'); } };

try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; -- as on real Supabase
    create table profiles(id uuid primary key);`);
  await db.exec(sql);
  await db.exec(sql);
  console.log('PASS: migration runs, and runs again safely');

  const person = randomUUID();
  await db.query('insert into profiles values ($1)', [person]);
  const live = randomUUID(), later = randomUUID(), draft = randomUUID(), pending = randomUUID();
  await insert(live, 'published', '2020-01-01');
  await insert(later, 'published', '2099-01-01');
  await insert(draft, 'draft', null);
  await insert(pending, 'pending', null);

  for (const role of ['anon', 'authenticated']) {
    const rows = await asRole(role, () => db.query('select id from ribbon_content'));
    assert.deepEqual(rows.rows.map((r) => r.id), [live]);
    await asRole(role, async () => {
      await refused(`insert into ribbon_content(id, kind, tab, format) values ('${randomUUID()}', 'post', 'News', 'story')`);
      await refused(`update ribbon_content set title = 'hacked'`);
      await refused(`delete from ribbon_content`);
      await refused(`select * from content_team`);
    });
  }
  console.log('PASS: the public reads live items only and can write nothing, and cannot see the team');

  const all = await asRole('service_role', () => db.query('select count(*)::int as n from ribbon_content'));
  assert.equal(all.rows[0].n, 4);
  console.log('PASS: the server can read everything');

  await refused(`insert into ribbon_content(id, kind, tab, format, status) values ('${randomUUID()}', 'post', 'News', 'story', 'published')`);
  await refused(`insert into ribbon_content(id, kind, tab, format) values ('${randomUUID()}', 'post', 'Admin', 'story')`);
  await refused(`insert into ribbon_content(id, kind, tab, format) values ('${randomUUID()}', 'trip_plan', 'News', null)`);
  await refused(`insert into ribbon_content(id, kind, tab, format) values ('${randomUUID()}', 'post', 'News', null)`);
  await refused(`insert into ribbon_content(id, kind, tab, format, status) values ('${randomUUID()}', 'post', 'News', 'story', 'live')`);
  await insert(randomUUID(), 'draft', null, { kind: 'trip_plan', tab: 'Explore', format: null });
  console.log('PASS: bad statuses, tabs and missing fields are refused');

  await db.query(`insert into content_team(profile_id, status) values ($1, 'invited')`, [person]);
  await refused(`insert into content_team(profile_id) values ('${person}')`);
  await refused(`insert into content_team(profile_id, role) values ('${randomUUID()}', 'admin')`);
  await refused(`insert into content_team(status) values ('invited')`);
  await db.query(`insert into content_team(invite_token_hash, expires_at) values ('hash', now() + interval '7 days')`);
  await refused(`insert into content_team(invite_token_hash, expires_at) values ('hash', now() + interval '7 days')`);
  await refused(`insert into content_team(invite_token_hash, expires_at, status) values ('other', now(), 'active')`);
  console.log('PASS: one row per person, no Admins from the app, links stay one-time and can never be active');

  const authored = randomUUID();
  await insert(authored, 'draft', null, { by: person });
  await db.query('delete from profiles where id = $1', [person]);
  assert.equal((await db.query('select created_by from ribbon_content where id = $1', [authored])).rows[0].created_by, null);
  assert.equal((await db.query('select count(*)::int as n from content_team where profile_id is not null')).rows[0].n, 0);
  console.log('PASS: deleting an account keeps its posts, removes the author, and removes its team row');
  console.log('ALL PASS');
} catch (error) {
  console.error('FAIL:', error);
  process.exitCode = 1;
} finally {
  await db.close();
}
