import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, profile, sqlFile } from "./testDatabase.ts";

const migration = sqlFile("golf_trip_score_overrides.sql");
const chain = ["golf_trips.sql", "golf_trip_invitations.sql", "golf_trip_flights.sql", "golf_trip_scoring.sql",
  "golf_trip_scoring_fix_groups.sql", "golf_trip_scoring_realtime.sql", "golf_trip_scoring_offline.sql",
  "golf_trip_scoring_submission.sql", "player_rounds.sql", "golf_trip_scoring_corrections.sql"];

test("foundation source adds no live scoring mutations, backfill or score-changing RPC", () => {
  const altered = [...migration.matchAll(/alter table public\.([a-z_]+)/gi)].map(m => m[1]);
  assert.ok(altered.every(name => name.startsWith("golf_trip_override_")));
  assert.ok(!/(insert into|update|delete from)\s+(public\.)?(hole_score_entries|scorecard_submissions|scorecard_submission_revisions|player_rounds)\b/i.test(migration));
  const functions = [...migration.matchAll(/create or replace function public\.(\w+)/g)].map(m => m[1]);
  assert.ok(functions.length > 0 && functions.every(name => name.startsWith("golf_override_")));
  assert.match(migration, /overrides_enabled = false/);
  assert.match(migration, /Legacy reopened\/approved corrections require inventory/);
});

test("disabled foundation in a disposable in-memory PostgreSQL fixture only", async t => {
  // database() constructs new PGlite() without a path/URL. No env, Docker,
  // Supabase endpoint or database containing user data is used by this suite.
  const db = await database();
  try {
    for (const file of chain) await db.exec(sqlFile(file));
    // Only the account predicate is stubbed: test harness has no Supabase Auth
    // session service. Actual hosted revocation remains a staging dependency.
    await db.exec("create function public.account_is_active() returns boolean language sql stable as $$select auth.uid() is not null$$");
    const organizer = await profile(db, "foundation-organizer"), member = await profile(db, "foundation-member");
    const outsider = await profile(db, "foundation-outsider"), pending = await profile(db, "foundation-pending");
    const trip = randomUUID(), round = randomUUID(), group = randomUUID();
    await db.query("insert into golf_trips(id,name,destination,start_date,end_date,created_by,client_request_id) values ($1,'Fixture trip','Fixture course','2026-10-01','2026-10-02',$2,$3)", [trip, organizer, randomUUID()]);
    for (const [id, role, status] of [[organizer, "organizer", "accepted"], [member, "member", "accepted"], [pending, "member", "pending"]]) {
      await db.query("insert into golf_trip_members(golf_trip_id,profile_id,display_name,role,invitation_status) values ($1,$2,'Fixture golfer',$3,$4)", [trip, id, role, status]);
    }
    await db.query("insert into golf_trip_rounds(id,golf_trip_id,round_number,day_number,play_date) values ($1,$2,1,1,'2026-10-01')", [round, trip]);
    await db.query("insert into scoring_groups(id,source,golf_trip_id,golf_trip_round_id,group_number,created_by) values ($1,'trip',$2,$3,1,$4)", [group, trip, round, organizer]);
    await db.query("insert into scoring_group_players(group_id,profile_id,play_order,submitted_at) values ($1,$2,1,now())", [group, member]);
    const card = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, strokes: 4, putts: 2, fairway: "center", green: "center", attestStrokes: 4 }));
    await db.query("insert into scorecard_submissions(group_id,golfer_profile_id,golf_trip_id,golf_trip_round_id,submitted_by,card_version,card) values ($1,$2,$3,$4,$2,36,$5)", [group, member, trip, round, JSON.stringify(card)]);
    const before = (await db.query("select to_jsonb(s) as value from scorecard_submissions s")).rows;
    const functionBefore = (await db.query("select pg_get_functiondef('submit_trip_scorecard(uuid,uuid,uuid,integer)'::regprocedure) as value")).rows;
    const asActor = async (id: string) => { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
    const eventId = randomUUID();
    const insertEvent = (request = eventId, newValue = "5", field = "strokes", oldValue = "4", revision = 1) => db.query(`
      insert into golf_trip_override_events(request_id,actor_profile_id,golf_trip_id,golf_trip_round_id,group_id,golfer_profile_id,
        hole,field,previous_value,new_value,reason,previous_revision,new_revision,created_at)
      values ($1,$2,$3,$4,$5,$6,1,$7,$8,$9,'Fixture correction',$10,$10+1,'1900-01-01')`,
    [request, outsider, trip, round, group, member, field, oldValue, newValue, revision]);

    await t.test("install/rerun is additive and leaves submissions and scoring RPCs byte-identical", async () => {
      await db.exec(migration);
      await db.exec(migration);
      assert.deepEqual((await db.query("select to_jsonb(s) as value from scorecard_submissions s")).rows, before);
      assert.deepEqual((await db.query("select pg_get_functiondef('submit_trip_scorecard(uuid,uuid,uuid,integer)'::regprocedure) as value")).rows, functionBefore);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from golf_trip_override_events")).rows[0].n, 0);
    });
    await t.test("controls default disabled and cannot be enabled, even by owner SQL", async () => {
      await db.query("insert into golf_trip_override_controls(golf_trip_id) values ($1)", [trip]);
      assert.deepEqual((await db.query("select overrides_enabled,lifecycle,format from golf_trip_override_controls")).rows[0], { overrides_enabled: false, lifecycle: "unreviewed", format: "gross_stroke_18" });
      await assert.rejects(db.exec("update golf_trip_override_controls set overrides_enabled=true"), /check constraint/);
      await assert.rejects(db.exec("update golf_trip_override_controls set lifecycle='reopened'"), /check constraint/);
    });
    await t.test("no insert operation is available even to the primary organizer", async () => {
      await asActor(organizer);
      await assert.rejects(insertEvent(), /overrides are disabled/);
      await assert.rejects(db.query("insert into golf_trip_override_delegations(request_id,golf_trip_id,delegate_profile_id,action,reason) values ($1,$2,$3,'grant','Fixture grant')", [randomUUID(), trip, member]), /overrides are disabled/);
    });
    await t.test("fixture seeding alone bypasses the disabled trigger; actor/time/fingerprint are server derived", async () => {
      // Owner-only fixture setup; the migration/production exposes no bypass.
      await db.exec("alter table golf_trip_override_events disable trigger override_20_disabled");
      await insertEvent();
      const row = (await db.query<{ actor_profile_id: string; created_at: Date; payload_fingerprint: string }>("select actor_profile_id,created_at,payload_fingerprint from golf_trip_override_events")).rows[0];
      assert.equal(row.actor_profile_id, organizer);
      assert.ok(new Date(String(row.created_at)).getFullYear() > 1900);
      assert.match(String(row.payload_fingerprint), /^[a-f0-9]{64}$/);
      const same = (await db.query<{ fp: string }>("select golf_override_fingerprint(actor_profile_id,golf_trip_id,golf_trip_round_id,group_id,golfer_profile_id,hole,field,new_value,reason,previous_revision) fp from golf_trip_override_events")).rows[0].fp;
      assert.equal(row.payload_fingerprint, same);
      await assert.rejects(insertEvent(), /duplicate key/);
      await assert.rejects(insertEvent(eventId, "6"), /duplicate key/);
      await assert.rejects(insertEvent(randomUUID()), /duplicate key/); // same official revision
      for (const [field, old, value] of [["strokes", "4", "21"], ["putts", "2", "11"], ["fairway", '"left"', '"invalid"'], ["penaltyGreen", "false", "1"], ["strokes", "4", "4"]]) {
        await assert.rejects(insertEvent(randomUUID(), value, field, old, 2), /check constraint/);
      }
      await db.exec("alter table golf_trip_override_events enable trigger override_20_disabled");
    });
    await t.test("all supported field shapes validate and canonical fingerprints distinguish intent", async () => {
      for (const [field, value] of [["strokes", "5"], ["putts", "null"], ["fairway", '"left"'], ["green", '"center"'], ["penaltyFairway", "true"], ["penaltyGreen", "false"]]) {
        assert.equal((await db.query<{ valid: boolean }>("select golf_override_value_valid($1,$2::jsonb) valid", [field, value])).rows[0].valid, true);
      }
      const fp = async (value: number, reason: string) => (await db.query<{ fp: string }>("select golf_override_fingerprint($1,$2,$3,$4,$5,1,'strokes',to_jsonb($6::int),$7,1) fp", [organizer, trip, round, group, member, value, reason])).rows[0].fp;
      assert.equal(await fp(5, "Reason"), await fp(5, "Reason"));
      assert.notEqual(await fp(5, "Reason"), await fp(6, "Reason"));
      assert.notEqual(await fp(5, "Reason"), await fp(5, "Other reason"));
    });
    await t.test("delegation changes require primary organizer; delegates cannot self-grant", async () => {
      await db.exec("alter table golf_trip_override_delegations disable trigger override_20_disabled");
      await asActor(member);
      await assert.rejects(db.query("insert into golf_trip_override_delegations(request_id,golf_trip_id,delegate_profile_id,action,reason) values ($1,$2,$3,'grant','Self grant')", [randomUUID(), trip, outsider]), /Only the primary organizer/);
      await asActor(organizer);
      await assert.rejects(db.query("insert into golf_trip_override_delegations(request_id,golf_trip_id,delegate_profile_id,action,reason) values ($1,$2,$3,'grant','Outsider grant')", [randomUUID(), trip, outsider]), /accepted trip participant/);
      await db.query("insert into golf_trip_override_delegations(request_id,golf_trip_id,delegate_profile_id,action,reason) values ($1,$2,$3,'grant','Fixture grant')", [randomUUID(), trip, member]);
      await db.query("insert into golf_trip_override_delegations(request_id,golf_trip_id,delegate_profile_id,action,reason) values ($1,$2,$3,'revoke','Fixture revoke')", [randomUUID(), trip, member]);
      await db.exec("alter table golf_trip_override_delegations enable trigger override_20_disabled");
      assert.equal((await db.query<{ action: string }>("select action from golf_trip_override_delegations order by sequence desc limit 1")).rows[0].action, "revoke");
      await asActor(member);
      await assert.rejects(db.query("insert into golf_trip_override_delegations(request_id,golf_trip_id,delegate_profile_id,action,reason) values ($1,$2,$3,'grant','Still forbidden')", [randomUUID(), trip, outsider]), /Only the primary organizer/);
      await asActor(organizer);
    });
    await t.test("audit rejects owner UPDATE, DELETE and TRUNCATE", async () => {
      for (const table of ["golf_trip_override_events", "golf_trip_override_delegations"]) {
        await assert.rejects(db.exec(`update ${table} set reason='Changed'`), /append-only/);
        await assert.rejects(db.exec(`delete from ${table}`), /append-only/);
        await assert.rejects(db.exec(`truncate ${table}`), /append-only/);
      }
    });
    await t.test("RLS history is visible to accepted participants only; all client mutations are denied", async () => {
      for (const [id, count] of [[organizer, 1], [member, 1], [outsider, 0], [pending, 0]] as [string, number][]) {
        await asActor(id);
        await db.exec("set role authenticated");
        try {
          assert.equal((await db.query<{ n: number }>("select count(*)::int n from golf_trip_override_events")).rows[0].n, count);
          for (const table of ["golf_trip_override_events", "golf_trip_override_delegations", "golf_trip_override_controls"]) {
            await assert.rejects(db.exec(`delete from ${table}`), /permission denied/);
            await assert.rejects(db.exec(`update ${table} set golf_trip_id=golf_trip_id`), /permission denied/);
          }
          await assert.rejects(insertEvent(randomUUID()), /permission denied/);
          await assert.rejects(db.exec("insert into golf_trip_override_delegations default values"), /permission denied/);
        } finally { await db.exec("reset role"); }
      }
      for (const role of ["anon", "service_role"]) {
        await db.exec(`set role ${role}`);
        try { await assert.rejects(db.exec("select * from golf_trip_override_events"), /permission denied/); }
        finally { await db.exec("reset role"); }
      }
    });
    await t.test("missing account predicate fails closed instead of granting historical visibility", async () => {
      await asActor(member);
      await db.exec("drop function public.account_is_active()");
      assert.equal((await db.query<{ allowed: boolean }>("select golf_override_participant($1) allowed", [trip])).rows[0].allowed, false);
      await db.exec("create function public.account_is_active() returns boolean language sql stable as $$select auth.uid() is not null$$");
    });
    await t.test("legacy reopened work blocks installation/rerun without relocking or discarding it", async () => {
      await db.exec("update scorecard_submissions set reopened_at=now()");
      await assert.rejects(db.exec(migration), /Legacy reopened\/approved corrections/);
      await db.exec("rollback");
      assert.equal((await db.query<{ open: boolean }>("select reopened_at is not null open from scorecard_submissions")).rows[0].open, true);
      await db.exec("update scorecard_submissions set reopened_at=null"); // fixture reset only
      await db.query("insert into scorecard_correction_requests(group_id,golfer_profile_id,golf_trip_id,revision,holes,reason,status,requested_by) values ($1,$2,$3,1,array[1],'Fixture request','approved',$2)", [group, member, trip]);
      await assert.rejects(db.exec(migration), /Legacy reopened\/approved corrections/);
      await db.exec("rollback");
      assert.equal((await db.query<{ status: string }>("select status from scorecard_correction_requests")).rows[0].status, "approved");
      await db.exec("delete from scorecard_correction_requests"); // fixture reset only
    });
    await t.test("existing trip deletion is not blocked and does not cascade the audit", async () => {
      await db.query("delete from golf_trips where id=$1", [trip]);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from golf_trip_override_events")).rows[0].n, 1);
      assert.equal((await db.query<{ n: number }>("select count(*)::int n from golf_trip_override_controls")).rows[0].n, 0);
    });
  } finally { await db.close(); }
});
