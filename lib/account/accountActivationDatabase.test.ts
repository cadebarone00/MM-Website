import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../platform/golfTripCreate.ts";

// --- Database: supabase/account_activation.sql (Phase 1 foundation) + account_activation_enforcement.sql (PROPOSED) ---

const CHAIN = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql", "golf_trip_scoring_fix_groups.sql",
  "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql", "golf_trip_scoring_submission.sql", "player_rounds.sql",
  "golf_trip_scoring_corrections.sql", "shared_rounds.sql", "profile_v1.sql", "profile_initialization.sql", "account_deletion.sql",
  "profile_friends.sql", "profile_read_model.sql"];
const TERMS = "2026-10-28-test";
const PRIVACY = "2026-10-28-test-privacy";

/** Everything up to (not including) the new file: "today's" database. */
async function before(): Promise<PGlite> {
  const db = await database();
  // Hosted Supabase runs in UTC; the in-memory database would otherwise use this computer's zone, so its current_date
  // could differ from the UTC date these tests compute (found 2026-10-28 when a run crossed midnight UTC).
  await db.exec("set timezone to 'UTC'");
  await db.exec("alter table auth.users add column email text, add column confirmed_at timestamptz, add column banned_until timestamptz, add column deleted_at timestamptz;");
  for (const file of CHAIN) await db.exec(sqlFile(file));
  return db;
}
/** Foundation installed; activation switched on and legal versions set ONLY for these isolated tests. */
async function setup(options: { enforce?: boolean; enable?: boolean } = {}): Promise<PGlite> {
  const db = await before();
  await db.exec(sqlFile("account_activation.sql"));
  if (options.enable ?? true) {
    await db.exec(`update account_activation_settings set activation_enabled = true;
      insert into legal_document_versions (document, current_version) values ('terms', '${TERMS}'), ('privacy', '${PRIVACY}');`);
  }
  if (options.enforce) await db.exec(sqlFile("account_activation_enforcement.sql"));
  return db;
}

type Json = Record<string, unknown>;
const one = async <T = Json>(db: PGlite, sql: string, params: unknown[] = []) => (await db.query<{ r: T }>(sql, params)).rows[0]?.r;
const rows = async (db: PGlite, sql: string, params: unknown[] = []) => (await db.query<Json>(sql, params)).rows;
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** The date `years` years before today, shifted by `days`. */
const yearsAgo = (years: number, days = 0) => { const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - years); d.setUTCDate(d.getUTCDate() + days); return iso(d); };

/** A verified login with an initialized profile; complete (name + username) unless told otherwise. */
async function account(db: PGlite, name: string, o: { verified?: boolean; complete?: boolean } = {}) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email, confirmed_at) values ($1, $2, $3)", [id, `${name}@example.com`, (o.verified ?? true) ? new Date().toISOString() : null]);
  await db.query("insert into profiles (id, email) values ($1, $2)", [id, `${name}@example.com`]);
  if (o.complete ?? true) await db.query("update profiles set display_name = $2, username = $3 where id = $1", [id, `${name} Golfer`, name]);
  return id;
}
const birthday = (db: PGlite, id: string, date: string) => one<{ eligible: boolean }>(db, "select set_my_birthdate($1, $2::date) as r", [id, date]);
const accept = async (db: PGlite, id: string) => {
  await one(db, "select record_terms_acceptance($1, 'terms', $2, 'signup') as r", [id, TERMS]);
  await one(db, "select record_terms_acceptance($1, 'privacy', $2, 'signup') as r", [id, PRIVACY]);
};
/** Everything Finish needs. */
async function ready(db: PGlite, name: string) {
  const id = await account(db, name);
  await birthday(db, id, "2000-06-15");
  await accept(db, id);
  return id;
}
const finish = (db: PGlite, id: string) => one(db, "select activate_my_profile($1) as r", [id]);
const active = async (db: PGlite, id: string) => (await one<boolean>(db, "select profile_is_active($1) as r", [id])) === true;
const state = (db: PGlite, id: string) => one<string>(db, "select account_lifecycle_state($1) as r", [id]);
const activatedAt = async (db: PGlite, id: string) => (await rows(db, "select activated_at from profiles where id = $1", [id]))[0]?.activated_at ?? null;

const DRAFT = { tripName: "Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8", yourName: "Org",
  yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no",
  knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no" };
async function trip(db: PGlite, organizer: string) {
  const payload = (golfTripPayloadFromBody({ ...DRAFT, requestId: randomUUID() }) as { ok: true; payload: CreateGolfTripPayload }).payload;
  return (await one<{ tripId: string }>(db, "select create_golf_trip($1, $2) as r", [organizer, JSON.stringify(payload)])).tripId;
}
async function invite(db: PGlite, organizer: string, tripId: string) {
  const token = `test-invite-secret-${randomUUID()}`;
  await one(db, "select invite_golf_trip_member($1, $2, $3, $4) as r", [organizer, tripId, JSON.stringify({ displayName: "Invited Golfer" }), token]);
  return token;
}
const members = (db: PGlite, tripId: string) => rows(db, "select id, profile_id, role, invitation_status, display_name from golf_trip_members where golf_trip_id = $1 order by created_at, id", [tripId]);
/** Run `sql` as a signed-in browser (role authenticated, JWT sub = who). Returns rows or the error message. */
async function asUser(db: PGlite, who: string, sql: string): Promise<{ rows?: Json[]; error?: string }> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${who}', false);`);
  try { return { rows: (await db.query<Json>(sql)).rows }; }
  catch (e) { return { error: (e as Error).message }; }
  finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}

// === Inert foundation ====================================================================================================

test("the foundation is inert: existing rows unchanged, nothing activated, Finish refuses while disabled, runs twice", async () => {
  const db = await before();
  const veteran = await account(db, "veteran");
  const tripId = await trip(db, veteran);
  const snap = async () => JSON.stringify([await rows(db, "select id, email, display_name, username, player_slug, rounds_visibility, deleted_at from profiles order by id"),
    await members(db, tripId), await rows(db, "select player_slug, claimed_by from player_slots order by 1")]);
  const was = await snap();
  await db.exec(sqlFile("account_activation.sql"));
  await db.exec(sqlFile("account_activation.sql"));
  assert.equal(await snap(), was, "no existing row changes");
  assert.equal((await rows(db, "select count(*)::int n from profiles where activated_at is not null"))[0].n, 0, "nobody is activated");
  assert.equal((await rows(db, "select activation_enabled from account_activation_settings"))[0].activation_enabled, false, "switched off by default");
  assert.equal((await rows(db, "select count(*)::int n from legal_document_versions"))[0].n, 0, "no legal version configured");
  await assert.rejects(finish(db, veteran), /Activation is not enabled yet/);
  assert.equal(await state(db, veteran), "pending", "existing complete profiles are NOT treated as active by the foundation");
});

test("activated_at can only be set by Finish (direct updates and inserts are refused)", async () => {
  const db = await setup();
  const id = await account(db, "direct");
  await assert.rejects(db.query("update profiles set activated_at = now() where id = $1", [id]), /Only Finish can activate a profile/);
  const other = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [other]);
  await assert.rejects(db.query("insert into profiles (id, email, activated_at) values ($1, 'x@example.com', now())", [other]), /Only Finish can activate a profile/);
});

// === Pending -> Active ====================================================================================================

test("Pending -> Active: Finish activates once; repeats answer 'already' and change nothing", async () => {
  const db = await setup();
  const id = await ready(db, "golfer");
  assert.equal(await state(db, id), "pending");
  assert.equal(await active(db, id), false);
  const first = await finish(db, id);
  assert.deepEqual([first.activated, first.already], [true, false]);
  assert.equal(await active(db, id), true);
  assert.equal(await state(db, id), "active");
  const at = await activatedAt(db, id);
  const second = await finish(db, id);
  assert.deepEqual([second.activated, second.already], [true, true], "double-click answers already-active");
  assert.deepEqual(await activatedAt(db, id), at, "activated_at not moved");
  assert.equal((await rows(db, "select count(*)::int n from profiles where id = $1", [id]))[0].n, 1, "still exactly one profile");
});

test("Finish lists every missing requirement and activates nothing", async () => {
  const db = await setup();
  const cases: [string, (id: string) => Promise<unknown>, string][] = [
    ["verification", (id) => db.query("update auth.users set confirmed_at = null where id = $1", [id]), "verification"],
    ["birthday", (id) => db.query("delete from account_birthdates where account_id = $1", [id]), "birthday"],
    ["username", (id) => db.query("update profiles set username = null where id = $1", [id]), "username"],
    ["name", (id) => db.query("update profiles set display_name = null where id = $1", [id]), "name"],
    ["terms", (id) => db.query("delete from terms_acceptances where account_id = $1 and document = 'terms'", [id]), "terms"],
    ["privacy acknowledgement", (id) => db.query("delete from terms_acceptances where account_id = $1 and document = 'privacy'", [id]), "privacy"],
    ["privacy setting", async (id) => {
      await db.exec("alter table profiles drop constraint if exists profiles_rounds_visibility_check");
      await db.query("update profiles set rounds_visibility = 'friends' where id = $1", [id]);
    }, "privacy_setting"],
  ];
  for (const [label, breakIt, key] of cases) {
    const id = await ready(db, `missing${key.replace(/_/g, "")}`);
    await breakIt(id);
    const r = await finish(db, id);
    assert.equal(r.activated, false, label);
    assert.ok((r.missing as string[]).includes(key), `${label}: ${JSON.stringify(r)}`);
    assert.equal(await activatedAt(db, id), null, `${label}: not activated`);
  }
  const noProfile = randomUUID();
  await db.query("insert into auth.users (id, confirmed_at) values ($1, now())", [noProfile]);
  assert.deepEqual((await finish(db, noProfile)).missing, ["profile"]);
});

test("Finish requires the CURRENT Terms version; an unconfigured document blocks activation", async () => {
  const db = await setup();
  const id = await ready(db, "termsuser");
  await assert.rejects(one(db, "select record_terms_acceptance($1, 'terms', 'old-version', 'signup') as r", [id]), /not the current version/);
  await one(db, "select record_terms_acceptance($1, 'terms', $2, 'signup') as r", [id, TERMS]); // repeat is harmless
  await db.query("update legal_document_versions set current_version = 'v2' where document = 'terms'");
  assert.ok(((await finish(db, id)).missing as string[]).includes("terms"), "new Terms version must be accepted again");
  const db2 = await setup({ enable: false });
  await db2.exec("update account_activation_settings set activation_enabled = true");
  const other = await account(db2, "noversions");
  await birthday(db2, other, "1990-01-01");
  const r = await finish(db2, other);
  assert.ok((r.missing as string[]).includes("terms_not_configured") && (r.missing as string[]).includes("privacy_not_configured"), JSON.stringify(r));
});

// === Age =================================================================================================================

test("age boundaries: exactly 13 today is eligible, 13 tomorrow is not, 29 February turns over on 1 March", async () => {
  const db = await setup();
  const age = (b: string, on: string) => one<number>(db, "select account_age_years($1::date, $2::date) as r", [b, on]);
  assert.equal(await age("2012-02-29", "2025-02-28"), 12);
  assert.equal(await age("2012-02-29", "2025-03-01"), 13);
  assert.equal(await age("2012-02-29", "2024-02-29"), 12);
  assert.equal(await age("2011-02-28", "2024-02-28"), 13);
  assert.equal(await age("2011-03-01", "2024-02-29"), 12);
  const today13 = await account(db, "thirteen");
  assert.equal((await birthday(db, today13, yearsAgo(13))).eligible, true, "13th birthday today = eligible");
  const tomorrow13 = await account(db, "almost");
  assert.equal((await birthday(db, tomorrow13, yearsAgo(13, 1))).eligible, false, "turns 13 tomorrow = not yet");
  const adult = await account(db, "adult");
  assert.equal((await birthday(db, adult, yearsAgo(40))).eligible, true);
});

test("under 13: marked Ineligible at once, never activated, no golf intent kept", async () => {
  const db = await setup();
  const kid = await account(db, "kid");
  await accept(db, kid);
  const r = await birthday(db, kid, yearsAgo(10));
  assert.deepEqual(r, { eligible: false }, "the answer is only eligible yes/no");
  assert.deepEqual(await rows(db, "select status, reason from account_eligibility where account_id = $1", [kid]), [{ status: "ineligible", reason: "under_13" }]);
  assert.equal(await state(db, kid), "ineligible");
  assert.deepEqual(await finish(db, kid), { activated: false, state: "ineligible" });
  assert.equal(await activatedAt(db, kid), null);
  const organizer = await ready(db, "org1");
  await finish(db, organizer);
  const token = await invite(db, organizer, await trip(db, organizer));
  await assert.rejects(one(db, "select hold_golf_trip_invitation($1, $2) as r", [kid, token]), /can't accept invitations/);
});

test("birthday is write-once and must be a real past date", async () => {
  const db = await setup();
  const id = await account(db, "once");
  await assert.rejects(birthday(db, id, "2999-01-01"), /real date of birth/);
  await assert.rejects(birthday(db, id, "1899-12-31"), /real date of birth/);
  await birthday(db, id, "1995-05-05");
  await assert.rejects(birthday(db, id, "2015-05-05"), /already saved\. Contact support/);
  await assert.rejects(birthday(db, id, "1980-05-05"), /already saved/);
  assert.equal(iso((await rows(db, "select birthdate from account_birthdates where account_id = $1", [id]))[0].birthdate as Date), "1995-05-05", "unchanged");
  assert.equal((await rows(db, "select count(*)::int n from account_eligibility where account_id = $1", [id]))[0].n, 0, "a refused retry can't create a restriction");
});

// === Privacy ============================================================================================================

test("birthdates, eligibility and the other private tables are invisible to browsers; functions are server-only", async () => {
  const db = await setup();
  const id = await ready(db, "private");
  for (const table of ["account_birthdates", "account_eligibility", "terms_acceptances", "pending_invitations", "birthdate_corrections", "account_activation_settings", "legal_document_versions"]) {
    const r = await asUser(db, id, `select * from public.${table}`);
    assert.match(r.error ?? "", /permission denied/, `${table} readable by its own user: ${JSON.stringify(r)}`);
  }
  for (const call of [`select set_my_birthdate('${id}', '2000-01-01')`, `select activate_my_profile('${id}')`, `select account_lifecycle_state('${id}')`,
    "select legacy_activation_inventory()", `select profile_is_active('${id}')`]) {
    assert.match((await asUser(db, id, call)).error ?? "", /permission denied/, call);
  }
  const result = JSON.stringify([await finish(db, id), await state(db, id), await one(db, "select legacy_activation_inventory() as r")]);
  assert.ok(!result.includes("2000-06-15") && !/birth/i.test(result), "no function answer contains the birthdate");
});

// === Concurrency / double Finish (single connection here; the two-connection race is scripts/auth-local/activation-concurrency.mts) ==

test("repeated Finish never accepts an invitation twice or makes a second profile", async () => {
  const db = await setup();
  const organizer = await ready(db, "orgrepeat");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const token = await invite(db, organizer, tripId);
  const id = await ready(db, "repeater");
  assert.equal((await one(db, "select hold_golf_trip_invitation($1, $2) as r", [id, token])).status, "held");
  assert.equal((await one(db, "select hold_golf_trip_invitation($1, $2) as r", [id, token])).status, "held");
  assert.equal((await rows(db, "select count(*)::int n from pending_invitations where account_id = $1", [id]))[0].n, 1, "held once");
  assert.equal((await members(db, tripId)).filter((m) => m.profile_id === id).length, 0, "holding changes no membership");
  const results = await Promise.all([finish(db, id), finish(db, id), finish(db, id)]);
  assert.equal(results.filter((r) => r.already === false).length, 1, "exactly one activation");
  assert.equal((await members(db, tripId)).filter((m) => m.profile_id === id).length, 1, "exactly one membership");
  assert.equal((await rows(db, "select count(*)::int n from profiles where id = $1", [id]))[0].n, 1);
});

// === Invitations at Finish ================================================================================================

test("held invitations: accepted at Finish; organizer/member rows never overwritten; revoked or taken ones skipped; failures never block activation", async () => {
  const db = await setup();
  const organizer = await ready(db, "orginv");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const organizerRow = JSON.stringify((await members(db, tripId)).find((m) => m.role === "organizer"));

  const good = await invite(db, organizer, tripId);
  const taken = await invite(db, organizer, tripId);
  const revoked = await invite(db, organizer, tripId);
  const id = await ready(db, "newbie");
  for (const t of [good, taken, revoked]) assert.equal((await one(db, "select hold_golf_trip_invitation($1, $2) as r", [id, t])).status, "held");
  // Someone else (Active) accepts `taken` first; the organizer cancels `revoked` (link cleared).
  const rival = await ready(db, "rival");
  await finish(db, rival);
  assert.equal((await one(db, "select accept_golf_trip_invitation($1, $2) as r", [rival, taken])).status, "accepted");
  await db.query("update golf_trip_members set invite_token_hash = null, invitation_status = 'declined' where invite_token_hash = golf_trip_invite_hash($1)", [revoked]);
  const rivalRow = JSON.stringify((await members(db, tripId)).find((m) => m.profile_id === rival));

  const r = await finish(db, id);
  assert.equal(r.activated, true);
  const outcomes = (r.invitations as Json[]).map((i) => i.outcome).sort();
  assert.deepEqual(outcomes, ["accepted", "skipped", "skipped"], JSON.stringify(r));
  const after = await members(db, tripId);
  assert.equal(after.filter((m) => m.profile_id === id).length, 1, "joined once");
  assert.equal(JSON.stringify(after.find((m) => m.role === "organizer")), organizerRow, "organizer row untouched");
  assert.equal(JSON.stringify(after.find((m) => m.profile_id === rival)), rivalRow, "someone else's accepted row untouched");

  // A failing invitation never undoes activation.
  const db2 = await setup();
  const org2 = await ready(db2, "org2");
  await finish(db2, org2);
  const trip2 = await trip(db2, org2);
  const boom = await invite(db2, org2, trip2);
  const person = await ready(db2, "unlucky");
  await one(db2, "select hold_golf_trip_invitation($1, $2) as r", [person, boom]);
  await db2.exec(`create function boom() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$;
    create trigger boom before update on golf_trip_members for each row execute function boom();`);
  const r2 = await finish(db2, person);
  assert.equal(r2.activated, true, "activation stands");
  assert.deepEqual((r2.invitations as Json[]).map((i) => i.outcome), ["failed"]);
  assert.equal(await active(db2, person), true);
});

// === Existing data preserved ============================================================================================

test("activation preserves identity, golf records, memberships and other people's rows", async () => {
  const db = await setup();
  const organizer = await ready(db, "keeper");
  const tripId = await trip(db, organizer);
  const slug = (await rows(db, "select player_slug from player_slots order by 1 limit 1"))[0].player_slug as string;
  await db.query("update player_slots set claimed_by = $1 where player_slug = $2", [organizer, slug]);
  await db.query("update profiles set player_slug = $2 where id = $1", [organizer, slug]);
  const bystander = await account(db, "bystander");
  const snap = async () => JSON.stringify([
    await rows(db, "select id, email, display_name, username, player_slug, rounds_visibility, avatar_path from profiles order by id"),
    await members(db, tripId), await rows(db, "select player_slug, claimed_by from player_slots order by 1"),
    await rows(db, "select id, created_by, name from golf_trips order by id")]);
  const was = await snap();
  await finish(db, organizer);
  assert.equal(await snap(), was, "only activated_at changed");
  assert.equal(await activatedAt(db, bystander), null, "nobody else activated");
});

// === Ineligible handling ================================================================================================

test("ineligible cleanup: locks when records exist, removes only a clean never-activated account, never touches others", async () => {
  const db = await setup();
  await assert.rejects(one(db, "select close_ineligible_registration($1) as r", [await ready(db, "eligible")]), /Only Ineligible/);

  const clean = await account(db, "cleankid");
  await accept(db, clean);
  await birthday(db, clean, yearsAgo(9));
  const organizer = await ready(db, "orgkid");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const busy = await account(db, "busykid");
  await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, 'Busy', 'member', 'accepted')", [tripId, busy]);
  await birthday(db, busy, yearsAgo(9));
  const othersBefore = JSON.stringify(await rows(db, "select * from profiles where id not in ($1, $2) order by id", [clean, busy]));

  const locked = await one(db, "select close_ineligible_registration($1, true) as r", [busy]);
  assert.deepEqual([locked.action, locked.blockers], ["lock", ["trip_membership"]]);
  assert.equal((await rows(db, "select count(*)::int n from account_deletions where account_id = $1", [busy]))[0].n, 0, "locked, not deleted");
  assert.equal((await members(db, tripId)).some((m) => m.profile_id === busy), true, "shared trip record kept");

  const dry = await one(db, "select close_ineligible_registration($1) as r", [clean]);
  assert.deepEqual([dry.action, dry.started], ["remove", false], "default is a dry run");
  assert.equal((await rows(db, "select count(*)::int n from account_birthdates where account_id = $1", [clean]))[0].n, 1);
  const removed = await one(db, "select close_ineligible_registration($1, true) as r", [clean]);
  assert.deepEqual([removed.action, removed.started], ["remove", true]);
  for (const t of ["account_birthdates", "terms_acceptances", "pending_invitations", "birthdate_corrections"]) {
    assert.equal((await rows(db, `select count(*)::int n from ${t} where account_id = $1`, [clean]))[0].n, 0, `${t} purged`);
  }
  assert.equal((await rows(db, "select state from account_deletions where account_id = $1", [clean]))[0].state, "requested", "existing deletion workflow started");
  assert.ok((await rows(db, "select deleted_at from profiles where id = $1", [clean]))[0].deleted_at, "profile closed (tombstone path)");
  assert.equal(JSON.stringify(await rows(db, "select * from profiles where id not in ($1, $2) order by id", [clean, busy])), othersBefore, "no other account touched");
});

test("birthday correction: one open request, admin only, re-evaluates eligibility, audit keeps no dates", async () => {
  const db = await setup();
  const adminId = await account(db, "boss");
  await db.query("update profiles set platform_role = 'admin' where id = $1", [adminId]);
  const notAdmin = await account(db, "notboss");
  const kid = await account(db, "mistyped");
  await birthday(db, kid, yearsAgo(10));
  assert.equal(await state(db, kid), "ineligible");
  const { requestId } = await one<{ requestId: string }>(db, "select request_birthdate_correction($1, 'I typed the wrong year') as r", [kid]);
  await assert.rejects(one(db, "select request_birthdate_correction($1, 'again') as r", [kid]), /already have an open/);
  await assert.rejects(one(db, "select admin_correct_birthdate($1, $2, '1990-01-01') as r", [notAdmin, requestId]), /Only a platform admin/);
  assert.deepEqual(await one(db, "select admin_correct_birthdate($1, $2, '1990-01-01', 'checked ID') as r", [adminId, requestId]), { eligible: true });
  assert.equal(await state(db, kid), "pending", "restriction lifted; still has to Finish");
  const audit = (await rows(db, "select * from birthdate_corrections where id = $1", [requestId]))[0];
  assert.deepEqual([audit.status, audit.eligible_after, audit.decided_by], ["approved", true, adminId]);
  assert.ok(!JSON.stringify(audit).includes("1990") && !JSON.stringify(audit).includes(yearsAgo(10)), "audit row holds no dates");
  await assert.rejects(one(db, "select admin_correct_birthdate($1, $2, '1990-01-01') as r", [adminId, requestId]), /not open/, "a decided request can't be reused");

  // An Active adult corrected to under 13 becomes Ineligible.
  const grown = await ready(db, "grown");
  await finish(db, grown);
  const r2 = await one<{ requestId: string }>(db, "select request_birthdate_correction($1, 'wrong date') as r", [grown]);
  assert.deepEqual(await one(db, "select admin_correct_birthdate($1, $2, $3::date) as r", [adminId, r2.requestId, yearsAgo(11)]), { eligible: false });
  assert.equal(await state(db, grown), "ineligible");
  assert.equal(await active(db, grown), false);
  const r3 = await one<{ requestId: string }>(db, "select request_birthdate_correction($1, 'please') as r", [grown]);
  assert.deepEqual(await one(db, "select admin_reject_birthdate_correction($1, $2, 'no evidence') as r", [adminId, r3.requestId]), { rejected: true });
});

test("correction requests: at most 3 in 30 days (rate limit), reason required", async () => {
  const db = await setup();
  const adminId = await account(db, "limiter");
  await db.query("update profiles set platform_role = 'admin' where id = $1", [adminId]);
  const id = await account(db, "cycler");
  await birthday(db, id, yearsAgo(10));
  await assert.rejects(one(db, "select request_birthdate_correction($1, '   ') as r", [id]), /Tell us what is wrong/);
  for (let i = 1; i <= 3; i++) {
    const { requestId } = await one<{ requestId: string }>(db, "select request_birthdate_correction($1, $2) as r", [id, `try ${i}`]);
    await one(db, "select admin_reject_birthdate_correction($1, $2) as r", [adminId, requestId]);
  }
  await assert.rejects(one(db, "select request_birthdate_correction($1, 'try 4') as r", [id]), (e: Error & { code?: string }) => /Too many/.test(e.message) && e.code === "54000");
  await db.query("update birthdate_corrections set requested_at = now() - interval '31 days' where account_id = $1", [id]);
  assert.ok(await one(db, "select request_birthdate_correction($1, 'next month') as r", [id]), "allowed again after 30 days");
});

test("onboarding progress answers yes/no facts only", async () => {
  const db = await setup();
  const id = await account(db, "progress", { verified: false });
  assert.deepEqual(await one(db, "select account_onboarding_progress($1) as r", [id]),
    { verified: false, birthday: false, termsConfigured: true, termsAccepted: false, activationEnabled: true });
  await db.query("update auth.users set confirmed_at = now() where id = $1", [id]);
  await birthday(db, id, "1999-09-09");
  await accept(db, id);
  const p = await one(db, "select account_onboarding_progress($1) as r", [id]);
  assert.deepEqual(p, { verified: true, birthday: true, termsConfigured: true, termsAccepted: true, activationEnabled: true });
  assert.ok(!JSON.stringify(p).includes("1999"), "no birthdate in the answer");
  await db.query("update legal_document_versions set current_version = 'v-next' where document = 'privacy'");
  assert.equal((await one(db, "select account_onboarding_progress($1) as r", [id])).termsAccepted, false, "a new version needs accepting again");
  const off = await setup({ enable: false });
  const other = await account(off, "progressoff");
  const q = await one(off, "select account_onboarding_progress($1) as r", [other]);
  assert.deepEqual([q.termsConfigured, q.activationEnabled], [false, false]);
});

// === Phase 4: revocation + recorded, serialized cleanup decisions =========================================================

/** Stand-in for Supabase Auth's sessions table (the real one is tested on the local stack). */
async function withSessions(db: PGlite) {
  await db.exec("create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null)");
  return {
    open: (id: string, n = 2) => db.query(`insert into auth.sessions (user_id) select $1 from generate_series(1, ${n})`, [id]),
    count: async (id: string) => (await rows(db, "select count(*)::int n from auth.sessions where user_id = $1", [id]))[0].n as number,
  };
}

test("under 13 ends every session of THAT account in the same transaction; other accounts keep theirs", async () => {
  const db = await setup();
  const sessions = await withSessions(db);
  const kid = await account(db, "sessionkid");
  const bystander = await account(db, "sessionbystander");
  await sessions.open(kid, 3);
  await sessions.open(bystander, 2);
  await birthday(db, kid, yearsAgo(9));
  assert.equal(await sessions.count(kid), 0, "all of the kid's sessions gone");
  assert.equal(await sessions.count(bystander), 2, "nobody else signed out");
  const adult = await account(db, "sessionadult");
  await sessions.open(adult, 2);
  await birthday(db, adult, "1990-01-01");
  assert.equal(await sessions.count(adult), 2, "an eligible birthday signs nobody out");
});

test("an approved correction to under 13 revokes sessions and sends the account back to an undecided cleanup", async () => {
  const db = await setup();
  const sessions = await withSessions(db);
  const adminId = await account(db, "revokeadmin");
  await db.query("update profiles set platform_role = 'admin' where id = $1", [adminId]);
  const grown = await ready(db, "revokegrown");
  await finish(db, grown);
  await sessions.open(grown, 2);
  const { requestId } = await one<{ requestId: string }>(db, "select request_birthdate_correction($1, 'wrong') as r", [grown]);
  await one(db, "select admin_correct_birthdate($1, $2, $3::date) as r", [adminId, requestId, yearsAgo(12)]);
  assert.equal(await sessions.count(grown), 0);
  assert.deepEqual(await rows(db, "select status, cleanup_state from account_eligibility where account_id = $1", [grown]), [{ status: "ineligible", cleanup_state: "pending" }]);
  assert.deepEqual((await rows(db, "select account_id from pending_ineligible_cleanups()")).map((r) => r.account_id), [grown]);
});

test("cleanup decisions are recorded and repeat-safe: remove once, lock with record kinds, never re-run a removal", async () => {
  const db = await setup();
  const clean = await account(db, "decideclean");
  await birthday(db, clean, yearsAgo(8));
  const first = await one(db, "select close_ineligible_registration($1, true) as r", [clean]);
  const second = await one(db, "select close_ineligible_registration($1, true) as r", [clean]);
  assert.deepEqual([first.action, first.started, second.action, second.already], ["remove", true, "remove", true]);
  assert.equal((await rows(db, "select count(*)::int n from account_deletions where account_id = $1", [clean]))[0].n, 1, "one deletion job");
  assert.equal((await rows(db, "select count(*)::int n from account_deletion_events where account_id = $1 and step = 'requested'", [clean]))[0].n, 1, "requested once");
  assert.equal((await rows(db, "select cleanup_state from account_eligibility where account_id = $1", [clean]))[0].cleanup_state, "removing");
  assert.deepEqual(await rows(db, "select account_id from pending_ineligible_cleanups()"), [], "decided accounts aren't retried");

  const organizer = await ready(db, "decideorg");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const member = await account(db, "decidemember");
  await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, 'Kid', 'member', 'accepted')", [tripId, member]);
  await birthday(db, member, yearsAgo(11));
  const membersBefore = JSON.stringify(await members(db, tripId));
  const locked = await one(db, "select close_ineligible_registration($1, true) as r", [member]);
  assert.equal(locked.action, "lock");
  assert.deepEqual(await rows(db, "select cleanup_state, review_reasons from account_eligibility where account_id = $1", [member]),
    [{ cleanup_state: "locked", review_reasons: ["trip_membership"] }]);
  assert.equal(JSON.stringify(await members(db, tripId)), membersBefore, "organizer and member rows unchanged");
  assert.equal((await rows(db, "select count(*)::int n from account_deletions where account_id = $1", [member]))[0].n, 0);
});

test("catch-all: a record in ANY other table pointing at the account means lock, not remove", async () => {
  const db = await setup();
  await db.exec("create table public.future_feature_rows (id serial primary key, owner uuid references public.profiles(id))");
  const kid = await account(db, "catchall");
  await db.query("insert into future_feature_rows (owner) values ($1)", [kid]);
  await birthday(db, kid, yearsAgo(10));
  const r = await one(db, "select close_ineligible_registration($1, true) as r", [kid]);
  assert.deepEqual([r.action, r.blockers], ["lock", ["records:future_feature_rows.owner"]]);
  const other = await account(db, "catchallclean");
  await birthday(db, other, yearsAgo(10));
  assert.deepEqual((await one(db, "select close_ineligible_registration($1) as r", [other])).blockers, [], "someone else's rows don't count against this account");
});

// === Legacy dry run =====================================================================================================

test("legacy dry-run classification: every category, ids and reason codes only, changes nothing", async () => {
  const db = await setup();
  const ok = await account(db, "goodlegacy");
  const incomplete = await account(db, "halfdone", { complete: false });
  const unverified = await account(db, "unverified", { verified: false });
  const mismatch = await account(db, "mismatch");
  await db.query("update auth.users set email = 'changed@example.com' where id = $1", [mismatch]);
  const claimOff = await account(db, "claimoff");
  await db.query("update profiles set player_slug = (select player_slug from player_slots order by 1 limit 1) where id = $1", [claimOff]);
  const banned = await account(db, "banned");
  await db.query("update auth.users set banned_until = now() + interval '1 day' where id = $1", [banned]);
  const restricted = await account(db, "restricted");
  await birthday(db, restricted, yearsAgo(8));
  const gone = await account(db, "gone");
  await one(db, "select request_account_deletion($1) as r", [gone]);
  const orphan = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [orphan]);
  await db.query("insert into profiles (id, email, display_name, username) values ($1, 'orphan@example.com', 'Orphan', 'orphan')", [orphan]);
  await db.query("delete from auth.users where id = $1", [orphan]); // profiles are detached from auth.users by account_deletion.sql
  const activeOne = await ready(db, "alreadyactive");
  await finish(db, activeOne);

  const before = JSON.stringify(await rows(db, "select * from profiles order by id"));
  const classes = Object.fromEntries((await rows(db, "select account_id, category, reasons from legacy_activation_classify()")).map((r) => [r.account_id, r]));
  assert.equal(classes[ok].category, "eligible_completed");
  assert.equal(classes[incomplete].category, "incomplete");
  assert.deepEqual([classes[unverified].category, classes[unverified].reasons], ["review", ["email_unverified"]]);
  assert.deepEqual([classes[mismatch].category, classes[mismatch].reasons], ["review", ["email_mismatch"]]);
  assert.deepEqual([classes[claimOff].category, classes[claimOff].reasons], ["review", ["player_claim_mismatch"]]);
  assert.deepEqual([classes[banned].category, classes[banned].reasons], ["restricted", ["login_banned"]]);
  assert.deepEqual([classes[restricted].category, classes[restricted].reasons], ["restricted", ["eligibility_restriction"]]);
  assert.equal(classes[gone].category, "deleted");
  assert.deepEqual([classes[orphan].category, classes[orphan].reasons], ["review", ["no_login"]]);
  assert.equal(classes[activeOne].category, "already_active");
  const inventory = await one(db, "select legacy_activation_inventory() as r");
  assert.deepEqual(Object.keys(inventory).sort(), ["categories", "reasons", "total"]);
  assert.ok(!/@|goodlegacy|Golfer/.test(JSON.stringify(inventory)), "no emails, usernames or names in the inventory");
  assert.equal(JSON.stringify(await rows(db, "select * from profiles order by id")), before, "classification changes nothing");
});

// === PROPOSED enforcement (account_activation_enforcement.sql; not run in Phase 1) ======================================

test("enforcement (proposed): Pending can't join or score, Active can; legacy backfill only activates eligible_completed", async () => {
  const db = await setup({ enforce: true });
  const organizer = await ready(db, "enforcer");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const token = await invite(db, organizer, tripId);
  const pending = await ready(db, "waiting");
  await assert.rejects(one(db, "select accept_golf_trip_invitation($1, $2) as r", [pending, token]), /Finish setting up your profile first/, "Pending can't become a member");
  assert.equal((await one(db, "select hold_golf_trip_invitation($1, $2) as r", [pending, token])).status, "held", "but can hold the invitation");
  const r = await finish(db, pending);
  assert.deepEqual((r.invitations as Json[]).map((i) => i.outcome), ["accepted"], "accepted at Finish once Active");

  const legacyOk = await account(db, "legacyok");
  const legacyHalf = await account(db, "legacyhalf", { complete: false });
  await assert.rejects(one(db, "select backfill_legacy_activation('yes') as r"), /not confirmed/);
  const done = await one(db, "select backfill_legacy_activation('ACTIVATE-ELIGIBLE-LEGACY-PROFILES') as r");
  assert.ok((done.activated as number) >= 1);
  assert.ok(await activatedAt(db, legacyOk), "eligible legacy profile activated");
  assert.equal(await activatedAt(db, legacyHalf), null, "incomplete legacy profile left alone");
  assert.equal(await state(db, legacyOk), "active_needs_birthday", "legacy account must still give a birthday");
  assert.equal(await active(db, legacyOk), false, "...and has no golf access until then");
  await birthday(db, legacyOk, "1985-03-03");
  assert.equal(await active(db, legacyOk), true);
});

test("enforcement (proposed): organizers can still record activated legacy members (no birthday yet); never Pending or Ineligible ones", async () => {
  const db = await setup({ enforce: true });
  const organizer = await ready(db, "rosterorg");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const legacy = await account(db, "rosterlegacy");
  await one(db, "select backfill_legacy_activation('ACTIVATE-ELIGIBLE-LEGACY-PROFILES') as r");
  assert.equal(await state(db, legacy), "active_needs_birthday");
  const add = (who: string) => db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, 'Member', 'member', 'accepted')", [tripId, who]);
  await add(legacy);
  assert.equal((await members(db, tripId)).filter((m) => m.profile_id === legacy).length, 1, "activated legacy member can be recorded");
  const pending = await ready(db, "rosterpending");
  await assert.rejects(add(pending), /Finish setting up your profile first/, "Pending can't be attached");
  const kid = await account(db, "rosterkid");
  await birthday(db, kid, yearsAgo(10));
  await assert.rejects(add(kid), /Finish setting up your profile first/, "Ineligible can't be attached");
});

test("enforcement (proposed): organizer hand-offs only go to participating members; offers to an account withdrawn when it becomes Ineligible", async () => {
  const db = await setup({ enforce: true });
  const organizer = await ready(db, "handorg");
  await finish(db, organizer);
  const tripId = await trip(db, organizer);
  const member = await ready(db, "handmember");
  await finish(db, member);
  await db.query("insert into golf_trip_members (golf_trip_id, profile_id, display_name, role, invitation_status) values ($1, $2, 'Member', 'member', 'accepted')", [tripId, member]);
  await one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [organizer, tripId, member]);
  assert.equal((await rows(db, "select count(*)::int n from golf_trip_organizer_handoffs where to_profile = $1", [member]))[0].n, 1);
  await db.query("insert into account_eligibility (account_id, status, reason) values ($1, 'review', 'manual')", [member]);
  assert.equal((await rows(db, "select count(*)::int n from golf_trip_organizer_handoffs where to_profile = $1", [member]))[0].n, 0, "offer withdrawn");
  await assert.rejects(one(db, "select offer_golf_trip_organizer($1, $2, $3) as r", [organizer, tripId, member]), /can't take over this trip/);
  assert.equal((await members(db, tripId)).find((m) => m.role === "organizer")?.profile_id, organizer, "organizer unchanged");
});

test("enforcement (proposed): Ineligible is blocked everywhere; discovery shows Active profiles only", async () => {
  const db = await setup({ enforce: true });
  const viewer = await ready(db, "viewer");
  await finish(db, viewer);
  const shown = await ready(db, "shownfinder");
  await finish(db, shown);
  const hidden = await ready(db, "hiddenfinder"); // Pending: has a name and username but hasn't finished
  const kid = await account(db, "kidfinder");
  await birthday(db, kid, yearsAgo(10));

  // Hosted Supabase grants signed-in users table access by default (RLS then decides rows); the test stub doesn't.
  await db.exec("grant select on public.profiles to authenticated");
  const own = async (who: string) => asUser(db, who, `select id from profiles where id = '${who}'`);
  assert.equal((await own(hidden)).rows?.length, 1, "Pending can still read its own profile to finish onboarding");
  assert.equal((await own(kid)).rows?.length ?? 0, 0, "Ineligible can't read anything");
  // Its token must stay VERIFIABLE (the server checks app tokens through the pre-request hook + session_is_revoked), or it
  // couldn't ask for a correction or delete itself; it simply sees no rows (checked just above).
  assert.equal((await asUser(db, kid, "select public.reject_deleted_accounts()")).error, undefined, "Ineligible token still verifiable");

  const found = (await one<Json[]>(db, "select search_golfers($1, 'finder') as r", [viewer])).map((g) => g.id);
  assert.deepEqual(found, [shown], "search finds Active only");
  assert.equal(await one(db, "select profile_id_for_username('hiddenfinder') as r"), null);
  assert.equal(await one(db, "select profile_id_for_username('shownfinder') as r"), shown);
  await db.query("update profiles set rounds_visibility = 'public' where id in ($1, $2)", [shown, hidden]);
  assert.equal((await one(db, "select get_profile_history($1, $2) as r", [viewer, hidden])).restricted, true, "Pending profile not viewable by others");
  assert.equal((await one(db, "select get_profile_history($1, $2) as r", [viewer, shown])).restricted, false);
  assert.equal((await one(db, "select get_profile_history($1, $1) as r", [hidden])).restricted, false, "owner still sees their own");
});
