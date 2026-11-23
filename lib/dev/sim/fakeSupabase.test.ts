import { test } from "node:test";
import assert from "node:assert/strict";
import { startFakeSupabase } from "../../../scripts/fake-supabase.mjs";
import { SIM_MIGRATIONS } from "./migrations";

test("sim database installs every file and has the Play functions", async () => {
  const fake = await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS });
  try {
    const rows = (await fake.db.query<{ proname: string }>(
      "select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = any($1::text[])",
      [["create_shared_round", "delete_shared_round", "leave_shared_round", "save_player_round"]],
    )).rows.map((r) => r.proname).sort();
    assert.deepEqual(rows, ["create_shared_round", "delete_shared_round", "leave_shared_round", "save_player_round"]);
  } finally { await fake.close(); }
});

test("dump then restore keeps users and their tokens", async () => {
  const first = await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS });
  const user = await first.addUser({ name: "cam" });
  const blob = await first.dump();
  await first.close();
  const second = await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS, loadDataDir: blob });
  try {
    await second.restoreTokens();
    const res = await fetch(`${second.url}/auth/v1/user`, { headers: { Authorization: `Bearer ${user.token}` } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).id, user.id);
  } finally { await second.close(); }
});

test("every call is reported, unsupported ones as not ok", async () => {
  const calls: Array<{ at: string; kind: string; name: string; ok: boolean; error?: string }> = [];
  const fake = await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS, onCall: (c: any) => calls.push(c) });
  try {
    const host = await fake.addUser({ name: "cam" });
    const rpc = await fetch(`${fake.url}/rest/v1/rpc/create_shared_round`, { method: "POST", body: JSON.stringify({ p_host: host.id, p_setup: {}, p_invites: null }) });
    await rpc.text();
    const bad = await fetch(`${fake.url}/storage/v1/x`);
    await bad.text();
    const rpcCall = calls.find((c) => c.kind === "rpc");
    assert.ok(rpcCall && rpcCall.name === "create_shared_round" && rpcCall.ok === true, JSON.stringify(calls));
    const un = calls.find((c) => c.kind === "unsupported");
    assert.ok(un && un.ok === false && un.error, JSON.stringify(calls));
  } finally { await fake.close(); }
});

test("array arguments become Postgres arrays for uuid[] and stay JSON for jsonb", async () => {
  const fake = await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS });
  try {
    const host = await fake.addUser({ name: "cam" });
    const friend = await fake.addUser({ name: "sam" });
    const post = (body: object) => fetch(`${fake.url}/rest/v1/rpc/create_shared_round`, { method: "POST", body: JSON.stringify(body) });
    const withInvite = await post({ p_host: host.id, p_setup: {}, p_invites: [friend.id] });
    assert.equal(withInvite.status, 200, await withInvite.text());
    const none = await post({ p_host: host.id, p_setup: {}, p_invites: [] });
    assert.equal(none.status, 200, await none.text());
    // jsonb given an array: reaches Postgres as JSON (the function's own check then rejects it, 22023, not 22P02).
    const jsonbArray = await post({ p_host: host.id, p_setup: [1, 2], p_invites: null });
    const err = await jsonbArray.json();
    assert.equal(err.code, "22023", JSON.stringify(err));
  } finally { await fake.close(); }
});

test("rpc with PostgREST query params, or a set-returning function, is reported unsupported; calls carry the user", async () => {
  const calls: any[] = [];
  const fake = await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS, onCall: (c: any) => calls.push(c) });
  try {
    const host = await fake.addUser({ name: "cam" });
    const headers = { authorization: `Bearer ${host.token}` };
    const filtered = await fetch(`${fake.url}/rest/v1/rpc/create_shared_round?select=id&order=id`, { method: "POST", headers, body: JSON.stringify({ p_host: host.id, p_setup: {}, p_invites: null }) });
    assert.equal(filtered.status, 400);
    assert.match((await filtered.json()).message, /query params/);
    await (await fetch(`${fake.url}/rest/v1/rpc/legacy_round_candidates`, { method: "POST", headers, body: "{}" })).text();
    const un = calls.filter((c) => c.kind === "unsupported");
    assert.equal(un.length, 2, JSON.stringify(calls));
    assert.ok(un.every((c) => c.ok === false && c.user === host.id));
    // A plain rpc still works and reports its user.
    const ok = await fetch(`${fake.url}/rest/v1/rpc/create_shared_round`, { method: "POST", headers, body: JSON.stringify({ p_host: host.id, p_setup: {}, p_invites: null }) });
    assert.equal(ok.status, 200, await ok.text());
    assert.equal(calls.find((c) => c.kind === "rpc")?.user, host.id);
  } finally { await fake.close(); }
});
