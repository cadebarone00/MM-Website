import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../platform/golfTripCreate.ts";

// --- Database: supabase/account_deletion.sql (Accounts V2, Step 3) -----------------------------------------------------

const CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "player_rounds.sql",
  "golf_trip_scoring_corrections.sql", "shared_rounds.sql", "profile_v1.sql", "profile_initialization.sql"];

async function base(): Promise<PGlite> {
  const db = await database();
  await db.exec("alter table auth.users add column email text, add column confirmed_at timestamptz;");
  for (const file of CHAIN) await db.exec(sqlFile(file));
  return db;
}
async function setup(): Promise<PGlite> {
  const db = await base();
  await db.exec(sqlFile("account_deletion.sql"));
  return db;
}
type Json = Record<string, unknown>;
const one = async <T = Json>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const rows = async (db: PGlite, sql: string, params: unknown[] = []) => (await db.query<Json>(sql, params)).rows;
const golfer = async (db: PGlite, name: string) => {
  const id = await profile(db, name);
  await db.query("update auth.users set email = $2, confirmed_at = now() where id = $1", [id, `${name}@example.com`]);
  return id;
};
const DRAFT = { tripName: "Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8", yourName: "Org",
  yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no",
  knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
async function trip(db: PGlite, organizer: string, dates: { startDate: string; endDate: string; day1Date: string } = { startDate: "2027-04-22", endDate: "2027-04-26", day1Date: "2027-04-23" }) {
  const payload = (golfTripPayloadFromBody({ ...DRAFT, ...dates, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload }).payload;
  return (await one<{ tripId: string }>(db, "select create_golf_trip($1, $2) as r", [organizer, JSON.stringify(payload)])).tripId;
}
async function join(db: PGlite, organizer: string, tripId: string, member: string) {
  const token = `test-invite-secret-${randomUUID()}`;
  await one(db, "select invite_golf_trip_member($1, $2, $3, $4) as r", [organizer, tripId, JSON.stringify({ displayName: "Typed Name", email: `typed-${randomUUID().slice(0, 8)}@example.com` }), token]);
  await one(db, "select accept_golf_trip_invitation($1, $2) as r", [member, token]);
}
const request = (db: PGlite, id: string) => one(db, "select request_account_deletion($1) as r", [id]);
const execute = (db: PGlite, id: string) => one(db, "select execute_account_deletion($1) as r", [id]);
/** Every row of the given tables, for "nothing else changed" checks. */
const snapshot = async (db: PGlite, tables: string[], where: Record<string, string> = {}) =>
  JSON.stringify(await Promise.all(tables.map((t) => rows(db, `select * from ${t} ${where[t] ?? ""} order by 1`))));
/** Run `sql` as a signed-in browser (role authenticated, JWT sub = who). */
async function asUser<T>(db: PGlite, who: string, sql: string): Promise<T[]> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${who}', false);`);
  try { return (await db.query<T>(sql)).rows; } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}

test("the migration changes no existing row and can run twice", async () => {
  const db = await base();
  const v1 = await golfer(db, "veteran");
  const slug = (await rows(db, "select player_slug from player_slots order by 1 limit 1"))[0].player_slug as string;
  await db.query("update player_slots set claimed_by = $1 where player_slug = $2", [v1, slug]);
  await db.query("update profiles set player_slug = $2 where id = $1", [v1, slug]);
  const tables = ["profiles", "player_slots", "golf_trips", "golf_trip_members"];
  const before = await snapshot(db, tables.slice(1));
  const profileBefore = await rows(db, "select id, email, username, display_name, player_slug, is_host from profiles order by 1");
  await db.exec(sqlFile("account_deletion.sql"));
  await db.exec(sqlFile("account_deletion.sql"));
  assert.equal(await snapshot(db, tables.slice(1)), before);
  assert.deepEqual(await rows(db, "select id, email, username, display_name, player_slug, is_host from profiles order by 1"), profileBefore);
  assert.equal(await one(db, "select count(*)::int as r from profiles where deleted_at is not null"), 0);
});

test("guards: profiles can't be deleted, need a real login to be created, and creator / host deletes are RESTRICT", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha");
  await trip(db, a);
  await assert.rejects(db.query("delete from profiles where id = $1", [a]), /never deleted/);
  await assert.rejects(db.query("insert into profiles (id, email) values ($1, 'x@example.com')", [randomUUID()]), /No account/);
  await db.exec("set maroon.allow_profile_delete = 'on'");
  await assert.rejects(db.query("delete from profiles where id = $1", [a]), /violates foreign key|restrict/i, "a trip's creator can't be removed");
  await db.exec("reset maroon.allow_profile_delete");
  const rules = await rows(db, `select rel.relname t, con.confdeltype r from pg_constraint con join pg_class rel on rel.oid = con.conrelid
    where con.contype = 'f' and con.confrelid = 'public.profiles'::regclass and rel.relname in ('golf_trips', 'shared_rounds')`);
  assert.ok(rows.length && rules.every((x) => x.r === "r"), JSON.stringify(rules));
  assert.equal(await one(db, "select count(*)::int as r from pg_constraint where conrelid = 'public.profiles'::regclass and confrelid = 'auth.users'::regclass"), 0);
  await db.query("delete from auth.users where id = $1", [a]); // what Auth's hard delete does
  assert.equal(await one(db, "select count(*)::int as r from profiles where id = $1", [a]), 1, "the login going away no longer takes the profile");
  assert.equal(await one(db, "select count(*)::int as r from golf_trips where created_by = $1", [a]), 1, "...or the trip");
});

test("a deletion request blocks the account at once: its own rows, RLS tables and REST pre-request; others unaffected", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha"), b = await golfer(db, "bravo");
  await db.exec("grant select on public.profiles to authenticated; grant select on public.player_slots to authenticated;");
  assert.equal((await asUser(db, a, "select id from profiles")).length, 1, "before: sees own profile");
  await assert.rejects(request(db, randomUUID()), /No account/);
  assert.deepEqual(await request(db, a), { state: "requested" });
  assert.deepEqual(await request(db, a), { state: "requested" }, "repeat is safe");
  assert.equal((await asUser(db, a, "select id from profiles")).length, 0, "after: an old token sees nothing");
  assert.equal((await asUser(db, b, "select id from profiles")).length, 1, "another account is unaffected");
  await assert.rejects(asUser(db, a, "select public.reject_deleted_accounts()"), /deleted/);
  await asUser(db, b, "select public.reject_deleted_accounts()");
  await assert.rejects(db.query("update profiles set display_name = 'Back' where id = $1", [a]), /deleted/, "can't edit a closed account");
  await assert.rejects(one(db, "select initialize_my_profile($1) as r", [a]), /deleted/);
  const policies = await one<number>(db, "select count(*)::int as r from pg_policies where policyname = 'active_account_only' and permissive = 'RESTRICTIVE'");
  const rlsTables = await one<number>(db, "select count(*)::int as r from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity and c.relkind in ('r','p')");
  assert.equal(policies, rlsTables, "every RLS table carries the restrictive policy");
});

test("the database step: hand-off, archive, restrict; scrubs only the deleter; shared data stays; idempotent", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha"), b = await golfer(db, "bravo"), c = await golfer(db, "charlie");
  const t1 = await trip(db, a), t2 = await trip(db, a), t3 = await trip(db, a, { startDate: "2024-04-22", endDate: "2024-04-26", day1Date: "2024-04-23" });
  for (const t of [t1, t2, t3]) { await join(db, a, t, b); await join(db, a, t, c); }
  await one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [a, t1, b]);
  await one(db, "select accept_golf_trip_organizer($1, $2) as r", [b, t1]);
  await one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [a, t2, c]); // offered, never accepted
  const slugs = (await rows(db, "select player_slug from player_slots order by 1 limit 2")).map((r) => r.player_slug as string);
  await db.query("update player_slots set claimed_by = $1 where player_slug = $2", [a, slugs[0]]);
  await db.query("update profiles set player_slug = $2 where id = $1", [a, slugs[0]]);
  await db.query("update player_slots set claimed_by = $1 where player_slug = $2", [c, slugs[1]]);
  await db.query("update profiles set player_slug = $2 where id = $1", [c, slugs[1]]);
  const round = await one<string>(db, "insert into shared_rounds (host, setup) values ($1, '{}') returning id as r", [a]);
  await db.query("insert into shared_round_players (round_id, profile_id, position, status) values ($1, $2, 0, 'joined'), ($1, $3, 1, 'joined')", [round, a, b]);
  await db.query("insert into shared_round_holes (round_id, profile_id, hole, strokes) values ($1, $2, 1, 4), ($1, $3, 1, 5)", [round, a, b]);
  const group = await one<string>(db, "insert into scoring_groups (source, group_number, created_by) values ('personal', 1, $1) returning id as r", [a]);
  await db.query("insert into scoring_group_players (group_id, profile_id, play_order) values ($1, $2, 1), ($1, $3, 2)", [group, a, b]);
  await db.query(`insert into wagers_accounts (profile_id) values ($1)`, [a]);
  const othersBefore = await snapshot(db, ["profiles", "player_slots", "golf_trip_members", "shared_round_holes", "scoring_group_players"],
    { profiles: `where id <> '${a}'`, player_slots: `where claimed_by is distinct from '${a}'`, golf_trip_members: `where profile_id is distinct from '${a}'` });

  await request(db, a);
  const done = await execute(db, a) as { state: string; changed: boolean; counts: Json };
  assert.equal(done.state, "database_done");
  assert.equal(done.counts.tripsTransferred, 1);
  assert.equal(done.counts.tripsRestricted, 1);
  assert.equal(done.counts.tripsArchived, 1);
  const owner = async (t: string) => (await rows(db, "select profile_id from golf_trip_members where golf_trip_id = $1 and role = 'organizer'", [t])).map((r) => r.profile_id);
  assert.deepEqual(await owner(t1), [b], "accepted hand-off: B organizes");
  assert.deepEqual(await owner(t2), [], "offered but never accepted: nobody is made organizer");
  assert.deepEqual((await rows(db, "select ownership_state s from golf_trips where id = any($1) order by array_position($1, id)", [[t1, t2, t3]])).map((r) => r.s), ["owned", "restricted", "archived"]);
  assert.deepEqual(await rows(db, "select email, username, display_name, player_slug, is_host from profiles where id = $1", [a]),
    [{ email: "", username: null, display_name: null, player_slug: null, is_host: false }]);
  assert.equal(await one(db, "select (deleted_at is not null) as r from profiles where id = $1", [a]), true);
  assert.equal(await one(db, "select bio as r from profiles where id = $1", [a]), null);
  assert.deepEqual((await rows(db, "select distinct display_name, email from golf_trip_members where profile_id = $1", [a])), [{ display_name: "Former member", email: null }]);
  assert.equal((await rows(db, "select claimed_by from player_slots where player_slug = $1", [slugs[0]]))[0].claimed_by, null, "their legacy claim is released");
  assert.equal(await one(db, "select status as r from shared_rounds where id = $1", [round]), "ended");
  assert.equal(await one(db, "select count(*)::int as r from shared_round_holes where round_id = $1", [round]), 2, "everyone's scores stay");
  assert.equal(await one(db, "select count(*)::int as r from scoring_group_players where group_id = $1", [group]), 2);
  assert.equal(await one(db, "select count(*)::int as r from wagers_accounts where profile_id = $1", [a]), 0, "coin balance removed");
  const [profilesBefore, slotsBefore, membersBefore, holesBefore, groupBefore] = JSON.parse(othersBefore) as Json[][];
  const now = async (sql: string) => JSON.parse(JSON.stringify(await rows(db, sql))) as Json[]; // same text form as the snapshot
  assert.deepEqual(await now(`select * from profiles where id <> '${a}' order by 1`), profilesBefore, "no other profile changed");
  assert.deepEqual(await now(`select * from player_slots where claimed_by is distinct from '${a}' and player_slug <> '${slugs[0]}' order by 1`),
    slotsBefore.filter((r) => r.player_slug !== slugs[0]), "no other legacy claim changed");
  const strip = (r: Json) => ({ ...r, role: undefined });
  assert.deepEqual((await now(`select * from golf_trip_members where profile_id is distinct from '${a}' order by 1`)).map(strip), membersBefore.map(strip),
    "other members' rows unchanged (apart from B's accepted organizer role)");
  assert.deepEqual(await now("select * from shared_round_holes order by 1"), holesBefore, "shared round scores unchanged");
  assert.deepEqual(await now("select * from scoring_group_players order by 1"), groupBefore, "scoring group unchanged");
  assert.deepEqual(await execute(db, a), { state: "database_done", changed: false }, "re-running changes nothing");
});

test("hand-off rules: only the organizer offers, only to a joined member with a finished profile, only they accept", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha"), b = await golfer(db, "bravo"), x = await golfer(db, "xray");
  const t = await trip(db, a);
  await join(db, a, t, b);
  await assert.rejects(one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [b, t, a]), /Only the organizer/);
  await assert.rejects(one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [a, t, x]), /joined the trip/, "not a member");
  await one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [a, t, b]);
  await assert.rejects(one(db, "select accept_golf_trip_organizer($1, $2) as r", [x, t]), /no organizer hand-off for you/);
  assert.deepEqual(await one(db, "select accept_golf_trip_organizer($1, $2) as r", [b, t]), { accepted: true });
});

test("failure injection: an error mid-way rolls the whole database step back; the retry finishes it", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha"), b = await golfer(db, "bravo");
  const t = await trip(db, a);
  await join(db, a, t, b);
  await request(db, a);
  await db.exec(`create table fail_once (armed boolean); insert into fail_once values (true);
    create function fail_scrub() returns trigger language plpgsql as $$ begin
      if (select armed from fail_once) and new.display_name = 'Former member' then raise exception 'injected failure'; end if; return new; end $$;
    create trigger fail_scrub before update on golf_trip_members for each row execute function fail_scrub();`);
  await assert.rejects(execute(db, a), /injected failure/);
  assert.equal(await one(db, "select state as r from account_deletions where account_id = $1", [a]), "requested", "still waiting to run");
  assert.equal(await one(db, "select ownership_state as r from golf_trips where id = $1", [t]), "owned", "trip changes rolled back too");
  assert.equal(await one(db, "select count(*)::int as r from golf_trip_members where golf_trip_id = $1 and role = 'organizer'", [t]), 1);
  assert.equal((await rows(db, "select username from profiles where id = $1", [a]))[0].username, "alpha", "profile not half-scrubbed");
  await db.exec("update fail_once set armed = false");
  assert.equal((await execute(db, a) as Json).state, "database_done");
});

test("storage / auth steps: forward-only, failures counted, repeats harmless, then completed", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha");
  await request(db, a);
  const step = (s: string, ok: boolean, e: string | null = null) => one<Json>(db, "select record_account_deletion_step($1, $2, $3, $4) as r", [a, s, ok, e]);
  assert.deepEqual(await step("storage", true), { state: "requested", changed: false }, "can't skip the database step");
  await execute(db, a);
  assert.deepEqual(await step("storage", false, "storage_unavailable"), { state: "database_done", changed: false });
  assert.deepEqual(await one(db, "select account_deletion_state($1) as r", [a]), { state: "database_done", attempts: 1, lastError: "storage_unavailable" });
  assert.deepEqual(await step("storage", true), { state: "storage_done", changed: true });
  assert.deepEqual(await step("storage", true), { state: "storage_done", changed: false }, "repeat");
  await step("auth", true);
  assert.deepEqual(await step("completed", true), { state: "completed", changed: true });
  assert.equal(await one(db, "select count(*)::int as r from pending_account_deletions()"), 0);
  const events = await rows(db, "select step, outcome, detail from account_deletion_events where account_id = $1 order by id", [a]);
  assert.ok(events.length >= 5);
  assert.ok(!JSON.stringify(events).includes("@"), "no email anywhere in the log");
});

test("restore protection: a completed deletion that comes back from a backup is queued again", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha");
  await request(db, a); await execute(db, a);
  await one(db, "select record_account_deletion_step($1, 'storage', true) as r", [a]);
  await db.query("delete from auth.users where id = $1", [a]); // the server's hard delete of the login
  for (const s of ["auth", "completed"]) await one(db, "select record_account_deletion_step($1, $2, true) as r", [a, s]);
  assert.equal(await one(db, "select reapply_account_deletions() as r"), 0, "nothing to redo");
  // Simulate an old backup restoring the profile's personal fields.
  await db.exec("set maroon.account_deletion = 'on'");
  await db.query("update profiles set email = 'alpha@example.com', username = 'alpha', deleted_at = null where id = $1", [a]);
  await db.exec("reset maroon.account_deletion");
  assert.equal(await one(db, "select reapply_account_deletions() as r"), 1);
  assert.equal(await one(db, "select state as r from account_deletions where account_id = $1", [a]), "requested");
  assert.equal((await execute(db, a) as Json).state, "database_done", "and the workflow scrubs it again");
  assert.equal((await rows(db, "select username from profiles where id = $1", [a]))[0].username, null);
});

test("90-day log retention and server-only grants", async () => {
  const db = await setup();
  const a = await golfer(db, "alpha");
  await request(db, a);
  await db.query("insert into account_deletion_events (account_id, step, outcome, created_at) values ($1, 'storage', 'failed', now() - interval '91 days')", [a]);
  assert.equal(await one(db, "select purge_account_deletion_events() as r"), 1);
  assert.equal(await one(db, "select count(*)::int as r from account_deletion_events where account_id = $1", [a]), 1, "recent entries kept");
  for (const fn of ["request_account_deletion(uuid)", "execute_account_deletion(uuid)", "record_account_deletion_step(uuid, text, boolean, text)",
    "list_account_storage_objects(uuid)", "offer_golf_trip_organizer(uuid, uuid, uuid)", "accept_golf_trip_organizer(uuid, uuid)", "reapply_account_deletions()"]) {
    for (const role of ["anon", "authenticated"]) assert.equal(await one(db, "select has_function_privilege($1, $2, 'execute') as r", [role, `public.${fn}`]), false, `${role} ${fn}`);
  }
  assert.equal(await one(db, "select has_function_privilege('authenticated', 'public.account_is_active()', 'execute') as r"), true);
  assert.equal(await one(db, "select has_table_privilege('authenticated', 'public.account_deletions', 'select') as r"), false);
});
