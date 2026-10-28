// Phase 1 (account activation): REAL concurrent Finish requests on real Postgres — the part the in-memory database
// tests (lib/account/accountActivationDatabase.test.ts) can't do with one connection.
//   AUTH_LOCAL_STACK=main node scripts/auth-local/setup.mjs
//   AUTH_LOCAL_STACK=main npx tsx --import ./scripts/auth-local/register.mjs scripts/auth-local/activation-concurrency.mts
// Installs supabase/account_activation.sql on the ISOLATED local stack only, switches activation on THERE (never on a
// hosted project), and races Finish calls over separate database connections.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { addr, admin, q, sql } from "./harness.mts";
import { authLocalStack } from "./stack.mjs";
import { golfTripPayloadFromBody, type CreateGolfTripPayload } from "../../lib/platform/golfTripCreate.ts";

const stack = authLocalStack();
let failed = 0, passed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
/** One psql process = one database connection. Resolves with its output and how long it took. */
function session(script: string): Promise<{ out: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const p = spawn("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-t", "-A", "-q", "-v", "ON_ERROR_STOP=1"]);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve({ out: out.trim(), ms: Date.now() - started }) : reject(new Error(err))));
    p.stdin.end(script);
  });
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

execFileSync("docker", ["exec", "-i", stack.dbContainer, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1"], { input: readFileSync("supabase/account_activation.sql") });
sql(`update public.account_activation_settings set activation_enabled = true;
  insert into public.legal_document_versions (document, current_version) values ('terms', 'local-test'), ('privacy', 'local-test')
  on conflict (document) do update set current_version = excluded.current_version;`);

async function golfer(name: string) {
  const email = addr(name);
  const id = (await admin.auth.admin.createUser({ email, password: "concurrency-pass-1", email_confirm: true })).data.user!.id;
  sql(`insert into public.profiles (id, email, display_name, username) values (${q(id)}, ${q(email)}, ${q(`${name} Golfer`)}, ${q(`${name.replace(/-/g, "")}${randomUUID().slice(0, 6)}`)})
    on conflict (id) do update set display_name = excluded.display_name, username = excluded.username;
    select public.set_my_birthdate(${q(id)}, '1992-04-04');
    select public.record_terms_acceptance(${q(id)}, 'terms', 'local-test', 'signup');
    select public.record_terms_acceptance(${q(id)}, 'privacy', 'local-test', 'signup');`);
  return id;
}
const finishSql = (id: string) => `select public.activate_my_profile(${q(id)});`;

console.log(`Stack "${stack.name}" — real Postgres, separate connections.`);
const organizer = await golfer("org");
JSON.parse(sql(finishSql(organizer)));
const draft = { tripName: "Race Trip", destination: "Pinehurst, NC", startDate: "2027-04-22", endDate: "2027-04-26", playerCount: "8", yourName: "Org",
  yourEmail: "org@example.com", golfDays: "1", day1Date: "2027-04-23", day1Rounds: "1", round1Course: "", includesTournament: "no",
  knowsLodging: "no", knowsFlights: "yes", knowsTransportation: "no", requestId: randomUUID() };
const payload = (golfTripPayloadFromBody(draft) as { ok: true; payload: CreateGolfTripPayload }).payload;
const tripId = JSON.parse(sql(`select public.create_golf_trip(${q(organizer)}, ${q(JSON.stringify(payload))}::jsonb)`)).tripId as string;
const token = `race-invite-secret-${randomUUID()}`;
sql(`select public.invite_golf_trip_member(${q(organizer)}, ${q(tripId)}, '{"displayName":"Racer"}'::jsonb, ${q(token)})`);

console.log("\nTwo Finish taps at the same moment (A holds the row lock for 2 s)");
{
  const racer = await golfer("racer");
  sql(`select public.hold_golf_trip_invitation(${q(racer)}, ${q(token)})`);
  const a = session(`begin; ${finishSql(racer)} select pg_sleep(2); commit;`);
  await wait(400);
  const b = session(finishSql(racer));
  const [ra, rb] = await Promise.all([a, b]);
  const ja = JSON.parse(ra.out.split("\n")[0]), jb = JSON.parse(rb.out);
  check("first connection activates", ja.activated === true && ja.already === false, ra.out);
  check("second connection waited for the first (row lock)", rb.ms >= 1200, `${rb.ms} ms`);
  check("second connection answers already-active", jb.activated === true && jb.already === true, rb.out);
  check("one activation timestamp", sql(`select count(*) from public.profiles where id = ${q(racer)} and activated_at is not null`) === "1");
  check("invitation accepted exactly once", sql(`select count(*) from public.golf_trip_members where golf_trip_id = ${q(tripId)} and profile_id = ${q(racer)}`) === "1");
  check("held invitation processed once", sql(`select count(*) || '|' || string_agg(outcome, ',') from public.pending_invitations where account_id = ${q(racer)}`) === "1|accepted");
  check("still exactly one profile", sql(`select count(*) from public.profiles where id = ${q(racer)}`) === "1");
}

console.log("\nEight simultaneous Finish requests");
{
  const burst = await golfer("burst");
  const results = await Promise.all(Array.from({ length: 8 }, () => session(finishSql(burst))));
  const parsed = results.map((r) => JSON.parse(r.out));
  check("all eight succeed", parsed.every((r) => r.activated === true), JSON.stringify(parsed));
  check("exactly one did the activation", parsed.filter((r) => r.already === false).length === 1, JSON.stringify(parsed.map((r) => r.already)));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
