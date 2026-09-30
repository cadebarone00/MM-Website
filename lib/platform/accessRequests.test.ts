import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { accessRequestFailure, parseMyAccess, parseRequestsForReview, validateAccessRequest, type AccessRequestInput } from "./accessRequests.ts";
import { canCreateTournament } from "./entitlements.ts";
import { createTournament, database, profile, protectedSnapshot, quick } from "./testDatabase.ts";

const NOW = new Date("2026-09-30T12:00:00Z");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const input: AccessRequestInput = { requesterName: "Casey Hill", groupName: "Hill Country Cup", seasonYear: 2027, expectedPlayers: 16, destination: "Kerrville, TX", note: "Annual trip with friends." };

const myAccess = async (db: PGlite, who: string) => parseMyAccess((await db.query<{ a: unknown }>("select get_my_tournament_access($1) a", [who])).rows[0].a);
const submit = async (db: PGlite, who: string, body: Partial<AccessRequestInput> = {}) =>
  (await db.query<{ r: { duplicate: boolean; access: unknown } }>("select submit_tournament_access_request($1, $2) r", [who, JSON.stringify({ ...input, ...body })])).rows[0].r;
const list = async (db: PGlite, admin: string) => parseRequestsForReview((await db.query<{ l: unknown }>("select list_tournament_access_requests($1) l", [admin])).rows[0].l);
const review = (db: PGlite, admin: string, reference: number, decision: string, note = "") =>
  db.query("select review_tournament_access_request($1, $2, $3, $4)", [admin, reference, decision, note]);
const creatorStatus = async (db: PGlite, who: string) =>
  (await db.query<{ s: string }>("select status s from tournament_creator_access where profile_id = $1", [who])).rows[0]?.s ?? null;
const canSave = async (db: PGlite, who: string, slug: string) => {
  try { await createTournament(db, who, { ...quick, name: slug, slug }); return true; } catch (e) { if ((e as { code?: string }).code === "42501") return false; throw e; }
};

test("the form only accepts what the review needs", () => {
  assert.deepEqual(validateAccessRequest({ ...input, requesterName: "  Casey Hill ", destination: " ", note: "" }, NOW),
    { ok: true, data: { ...input, destination: null, note: null } });
  const bad = validateAccessRequest({ requesterName: "", groupName: "x".repeat(81), seasonYear: 1999, expectedPlayers: 1, destination: "x".repeat(121), note: "x".repeat(1001) }, NOW);
  assert.equal(bad.ok, false);
  assert.deepEqual(!bad.ok && bad.errors.map((e) => e.field), ["requesterName", "groupName", "seasonYear", "expectedPlayers", "destination", "note"]);
  // Anything else the browser sends (email, status, profile) is ignored.
  const extra = validateAccessRequest({ ...input, email: "attacker@example.com", status: "approved", profileId: "x" }, NOW);
  assert.ok(extra.ok && !("email" in extra.data) && !("status" in extra.data));
  assert.equal(accessRequestFailure({ code: "P0001", hint: "denied" }).status, 409);
  assert.equal(accessRequestFailure({ code: "42501" }).status, 404);
});

test("an unapproved user submits once; a second submit returns the same pending request; the request grants nothing", async () => {
  const db = await database();
  try {
    const casey = await profile(db, "casey");
    assert.deepEqual(await myAccess(db, casey), { canCreate: false, request: null });
    const first = await submit(db, casey);
    assert.equal(first.duplicate, false);
    const access = parseMyAccess(first.access);
    assert.equal(access.canCreate, false, "a request never grants creation");
    assert.equal(access.request?.status, "pending");
    assert.equal(access.request?.groupName, "Hill Country Cup");
    assert.ok(!UUID.test(JSON.stringify(first)), "no internal ids back to the requester");

    const again = await submit(db, casey, { groupName: "Something Else" });
    assert.equal(again.duplicate, true);
    assert.equal(parseMyAccess(again.access).request?.groupName, "Hill Country Cup", "the pending request is shown, not replaced");
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from tournament_access_requests where profile_id = $1", [casey])).rows[0].n, 1);

    // The one-pending rule holds in the database itself, too.
    await assert.rejects(db.query("insert into tournament_access_requests(profile_id,email,requester_name,group_name,season_year,expected_players) values ($1,'c@test','C','G',2027,8)", [casey]), /duplicate key/);
    assert.equal(await creatorStatus(db, casey), null, "no creator-access row was created");
    assert.equal(await canSave(db, casey, "casey-cup"), false, "still can't create");

    // The email is the account's, whatever the browser sent.
    assert.equal((await db.query<{ e: string }>("select email e from tournament_access_requests where profile_id = $1", [casey])).rows[0].e, "casey@test");
  } finally { await db.close(); }
});

test("requesters see only their own request; only platform admins list and review", async () => {
  const db = await database();
  try {
    const casey = await profile(db, "casey");
    const drew = await profile(db, "drew");
    const organizer = await profile(db, "organizer", { approved: true });
    const host = await profile(db, "host", { host: true });
    const admin = await profile(db, "admin", { admin: true });
    await submit(db, casey);
    await submit(db, drew, { groupName: "Drew's Desert Classic" });

    assert.equal((await myAccess(db, casey)).request?.groupName, "Hill Country Cup");
    assert.equal((await myAccess(db, drew)).request?.groupName, "Drew's Desert Classic");
    assert.equal((await myAccess(db, organizer)).request, null, "someone with no request sees none");

    for (const who of [casey, organizer, host]) {
      await assert.rejects(db.query("select list_tournament_access_requests($1)", [who]), (e: { code?: string }) => e.code === "42501");
      await assert.rejects(review(db, who, 1, "approved"), (e: { code?: string }) => e.code === "42501");
    }
    const requests = await list(db, admin);
    assert.deepEqual(requests.map((r) => [r.groupName, r.status, r.email]).sort(), [["Drew's Desert Classic", "pending", "drew@test"], ["Hill Country Cup", "pending", "casey@test"]]);
    assert.ok(!UUID.test(JSON.stringify((await db.query("select list_tournament_access_requests($1) l", [admin])).rows[0])), "review list uses short references, no ids");

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const sql of ["select * from tournament_access_requests", `select submit_tournament_access_request('${casey}', '{}')`, `select list_tournament_access_requests('${admin}')`,
        `select get_my_tournament_access('${casey}')`, `select review_tournament_access_request('${admin}', 1, 'approved', '')`]) {
        await assert.rejects(db.query(sql), /permission denied/, `${role}: ${sql}`);
      }
      await db.exec("reset role");
    }
  } finally { await db.close(); }
});

test("approval explicitly activates the existing creator access; denial doesn't; decisions are final and visible to the requester", async () => {
  const db = await database();
  try {
    const before = await protectedSnapshot(db);
    const casey = await profile(db, "casey");
    const drew = await profile(db, "drew");
    const admin = await profile(db, "admin", { admin: true });
    await submit(db, casey);
    await submit(db, drew);
    const [caseyRef, drewRef] = [casey, drew].map((who, i) => i + 1);
    assert.deepEqual((await list(db, admin)).map((r) => r.reference).sort(), [caseyRef, drewRef]);

    await review(db, admin, caseyRef, "approved", "Welcome aboard.");
    assert.equal(await creatorStatus(db, casey), "approved", "approval writes tournament_creator_access");
    const caseyAccess = await myAccess(db, casey);
    assert.deepEqual([caseyAccess.canCreate, caseyAccess.request?.status, caseyAccess.request?.decisionNote], [true, "approved", "Welcome aboard."]);
    assert.equal(await canSave(db, casey, "casey-cup"), true, "approved → can create");

    await review(db, admin, drewRef, "denied", "Not in this beta wave.");
    assert.equal(await creatorStatus(db, drew), null, "denial grants nothing and writes no access row");
    const drewAccess = await myAccess(db, drew);
    assert.deepEqual([drewAccess.canCreate, drewAccess.request?.status, drewAccess.request?.decisionNote], [false, "denied", "Not in this beta wave."]);
    assert.equal(await canSave(db, drew, "drew-cup"), false);
    await assert.rejects(submit(db, drew), (e: { hint?: string }) => e.hint === "denied", "denied: contact us instead of re-requesting");
    await assert.rejects(submit(db, casey), (e: { hint?: string }) => e.hint === "already_approved");

    await assert.rejects(review(db, admin, caseyRef, "denied"), (e: { hint?: string }) => e.hint === "already_reviewed");
    await assert.rejects(review(db, admin, 999, "approved"), (e: { code?: string }) => e.code === "P0002");
    await assert.rejects(review(db, admin, drewRef, "maybe"), (e: { code?: string }) => e.code === "22023");
    const reviewed = await list(db, admin);
    assert.ok(reviewed.every((r) => r.reviewedBy === "admin" && r.reviewedAt));

    // A request record alone never grants access, even if written by hand.
    const eve = await profile(db, "eve");
    await db.query("insert into tournament_access_requests(profile_id,email,requester_name,group_name,season_year,expected_players,status,reviewed_at) values ($1,'e@test','E','G',2027,8,'approved',now())", [eve]);
    assert.equal(await canSave(db, eve, "eve-cup"), false, "only tournament_creator_access decides");
    assert.equal((await myAccess(db, eve)).canCreate, false);

    const body = (await db.query<{ d: string }>(`select string_agg(pg_get_functiondef(p.oid), '') d from pg_proc p where p.proname in
      ('can_create_tournament','get_my_tournament_access','submit_tournament_access_request','list_tournament_access_requests','review_tournament_access_request')`)).rows[0].d;
    assert.ok(!/live_|career_|broadcast_/.test(body), "never touches live scoring");
    assert.deepEqual(await protectedSnapshot(db), before);
  } finally { await db.close(); }
});

test("can_create_tournament agrees with create_tournament_shell and entitlements.ts in every mode", async () => {
  const db = await database();
  try {
    for (const mode of ["invite_only", "self_serve"] as const) {
      await db.query("update platform_settings set tournament_creation = $1", [mode]);
      for (const [name, options, status] of [["none", {}, null], ["requested", {}, "requested"], ["approved", {}, "approved"], ["revoked", {}, "revoked"], ["admin", { admin: true }, null]] as const) {
        const who = await profile(db, `${mode}-${name}`, options);
        if (status) await db.query("insert into tournament_creator_access(profile_id,status) values ($1,$2)", [who, status]);
        const sql = (await db.query<{ c: boolean }>("select can_create_tournament($1) c", [who])).rows[0].c;
        const ts = canCreateTournament({ signedIn: true, platformRole: name === "admin" ? "admin" : null, creationMode: mode, accessStatus: status });
        const real = await canSave(db, who, `${mode}-${name}`.replace("_", "-"));
        assert.deepEqual([sql, ts], [real, real], `${mode}/${name}`);
      }
    }
  } finally { await db.close(); }
});
