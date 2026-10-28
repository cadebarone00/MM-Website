import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import * as nodeModule from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requestIdentityClient } from "../supabase/requestIdentity.ts";

// Intercept only the server SDK factories and server-only marker. Routes,
// profile resolution, bearer verification, write loaders and response parsers are real.
type Boundary = { client(request?: Request): Promise<SupabaseClient>; service(): SupabaseClient };
const contexts = new AsyncLocalStorage<Boundary>();
// Runtime is Node 24; the repository intentionally retains @types/node 20.
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: {
  resolve(specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown): unknown;
  load(url: string, context: unknown, next: (url: string, context: unknown) => unknown): unknown;
}): void };
const boundary = globalThis as typeof globalThis & { __scoringSubmitBoundary?: Boundary };
boundary.__scoringSubmitBoundary = {
  client: request => contexts.getStore()!.client(request), service: () => contexts.getStore()!.service(),
};
const stub = `export const createSupabaseServerClient = request => globalThis.__scoringSubmitBoundary.client(request);
export const createSupabaseServiceRoleClient = () => globalThis.__scoringSubmitBoundary.service();`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", format: "module", shortCircuit: true };
  if (specifier === "@/lib/supabase/server") return { url: `data:text/javascript,${encodeURIComponent(stub)}`, format: "module", shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url.startsWith("data:text/javascript,")) return { format: "module", source: decodeURIComponent(url.slice("data:text/javascript,".length)), shortCircuit: true };
  return next(url, context);
} });
const { POST } = await import("../../app/api/golf-trips/[tripId]/scoring/submit/route.ts");
const { POST: write } = await import("../../app/api/golf-trips/[tripId]/scoring/route.ts");
const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const T = "20000000-0000-4000-8000-000000000001";
const G = "30000000-0000-4000-8000-000000000001";
const U = "20000000-0000-4000-8000-000000000002";
const at = "2026-10-27T12:00:00.000Z";
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
// Only the intercepted Auth service accepts these synthetic credentials.
const token = (id: string, expired = false) => [Buffer.from('{"alg":"HS256"}').toString("base64url"),
  Buffer.from(JSON.stringify({ sub: id, role: "authenticated", session_id: id, exp: expired ? 1 : expiresAt })).toString("base64url"), "c2ln"].join(".");
const user = (id: string) => ({ id, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: at });
const scoring = { roundId: T, roundNumber: 1, groups: [], entries: [] };
const payload = () => ({ groupId: G, golferProfileId: A, expectedProfileId: A, cardVersion: 36 });
type Options = {
  cookie?: string; revoked?: boolean; revocationFailure?: boolean; incomplete?: boolean; missingProfile?: boolean;
  profileFailure?: boolean; throws?: boolean; malformed?: boolean; error?: { code: string; message: string };
  reason?: "incomplete" | "unattested" | "stale" | "mismatch" | "no-attester"; already?: boolean;
  bothTrips?: boolean; missingGroup?: boolean; missingRound?: boolean; roundTripMismatch?: boolean;
  lookupFailure?: "scoring_groups" | "golf_trip_rounds" | "scoring_group_players"; lookupThrows?: boolean; deleteAfterLookup?: boolean; malformedLookup?: boolean; notPlayer?: boolean;
};
async function fixture(options: Options = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const lookups: { table: string; profile: string | undefined }[] = [];
  const known = new Map([[token(A), A], [token(B), B]]);
  const plain = (jwt?: string) => createClient("https://scoring-write.example.test", "anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}), fetch: async (input, init) => {
      const url = new URL(String(input));
      const id = known.get(new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "");
      if (url.pathname.endsWith("/token")) return Response.json({ error: "invalid_grant" }, { status: 400 });
      if (url.pathname.endsWith("/user")) return id ? Response.json(user(id)) : Response.json({ message: "Invalid JWT" }, { status: 401 });
      if (url.pathname.endsWith("/rpc/session_is_revoked")) return options.revocationFailure
        ? Response.json({ message: "PRIVATE failure" }, { status: 500 }) : Response.json(options.revoked === true);
      if (url.pathname.endsWith("/profiles")) {
        if (options.profileFailure) return Response.json({ message: "PRIVATE failure" }, { status: 500 });
        return Response.json(id && url.searchParams.get("id") === `eq.${id}` && !options.missingProfile
          ? [{ id, display_name: "Golfer", username: options.incomplete ? null : "golfer", email: "synthetic@example.test", player_slug: null }] : []);
      }
      const table = url.pathname.split("/").at(-1)!;
      if (table === "scoring_groups" || table === "golf_trip_rounds" || table === "scoring_group_players") {
        lookups.push({ table, profile: id });
        if (options.lookupFailure === table) return Response.json({ message: "PRIVATE lookup failure" }, { status: 500 });
        if (options.malformedLookup) return Response.json({ id: G });
        if (table === "scoring_group_players") return Response.json(id === A && !options.notPlayer
          && url.searchParams.get("group_id") === `eq.${G}` && url.searchParams.get("profile_id") === `eq.${A}` ? { profile_id: A } : null);
        // Existing user-token RLS is modeled here: B is an outsider, A may belong to both trips.
        const allowed = (id === A || options.bothTrips && id === B) && (url.searchParams.get("golf_trip_id") === `eq.${T}`
          || options.bothTrips && url.searchParams.get("golf_trip_id") === `eq.${U}`);
        if (table === "scoring_groups") return Response.json(allowed && !options.missingGroup
          && url.searchParams.get("id") === `eq.${G}` && url.searchParams.get("source") === "eq.trip"
          && url.searchParams.get("golf_trip_id") === `eq.${T}`
          ? { id: G, golf_trip_id: T, golf_trip_round_id: T } : null);
        return Response.json(allowed && !options.missingRound && !options.roundTripMismatch
          && url.searchParams.get("id") === `eq.${T}` && url.searchParams.get("golf_trip_id") === `eq.${T}`
          ? { id: T, golf_trip_id: T } : null);
      }
      throw new Error("Unexpected SDK request");
    } },
  });
  const cookie = plain();
  if (options.cookie) await cookie.auth.setSession({ access_token: token(options.cookie), refresh_token: "synthetic" });
  let submitted = options.already === true;
  const service = { async rpc(name: string, args: Record<string, unknown>) {
    if (name === "account_deletion_state") return { data: { state: null }, error: null };
    if (name === "save_hole_score_ops") {
      assert.equal(submitted, true);
      calls.push({ name, args });
      return { data: null, error: { code: "42501", message: "That card is already submitted." } };
    }
    assert.equal(name, "submit_trip_scorecard");
    calls.push({ name, args });
    if (options.throws) throw new Error("PRIVATE backend detail");
    if (options.error) return { data: null, error: options.error };
    if (options.deleteAfterLookup || args.p_profile !== A || args.p_group !== G) return { data: null, error: { code: "P0002", message: "Group not found." } };
    if (args.p_golfer !== A) return { data: null, error: { code: "42501", message: "You can only submit your own card." } };
    // Model domain responses, not the SQL transaction: route/identity/preflight/loader are real.
    const result = submitted ? { status: "already-submitted", submittedAt: at, scoring }
      : options.reason ? { status: "rejected", reason: options.reason, holes: [1], scoring }
      : { status: "submitted", submittedAt: at, scoring };
    if (!options.reason) submitted = true;
    return { data: options.malformed ? {} : result, error: null };
  } } as unknown as SupabaseClient;
  let clientCalls = 0;
  const context: Boundary = {
    client: request => {
      if (options.lookupThrows && ++clientCalls > 1) throw new Error("PRIVATE lookup failure");
      return request ? requestIdentityClient(request.headers.get("authorization"), async () => cookie, plain) : Promise.resolve(cookie);
    },
    service: () => service,
  };
  return { calls, lookups, run: <R,>(fn: () => R) => contexts.run(context, fn) };
}
const post = (body: unknown = payload(), jwt?: string, tripId = T, raw = false) => POST(new Request(`https://main.example.test/api/golf-trips/${tripId}/scoring/submit`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, body: raw ? String(body) : JSON.stringify(body),
}), { params: Promise.resolve({ tripId }) });

for (const mode of ["cookie", "bearer"]) test(`${mode} member submits through verified identity and user-scoped trip binding`, async () => {
  const f = await fixture({ cookie: mode === "cookie" ? A : undefined });
  await f.run(async () => {
    const response = await post(payload(), mode === "bearer" ? token(A) : undefined);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: "submitted", submittedAt: at, scoring });
    assert.deepEqual(f.calls, [{ name: "submit_trip_scorecard", args: { p_profile: A, p_group: G, p_golfer: A, p_card_version: 36 } }]);
    assert.deepEqual(f.lookups, [{ table: "scoring_groups", profile: A }, { table: "golf_trip_rounds", profile: A }, { table: "scoring_group_players", profile: A }]);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
for (const [name, options, jwt, status] of [
  ["missing session", {}, undefined, 401],
  ["invalid bearer cannot use valid cookie", { cookie: A }, "bad", 401],
  ["unknown token", {}, token(G), 401],
  ["expired token", {}, token(A, true), 401],
  ["revoked token", { revoked: true }, token(A), 401],
  ["cookie-bearer conflict", { cookie: B }, token(A), 401],
  ["revocation backend unavailable", { revocationFailure: true }, token(A), 401],
  ["incomplete profile", { incomplete: true }, token(A), 409],
  ["missing profile", { missingProfile: true }, token(A), 409],
] as [string, Options, string | undefined, number][]) test(`${name}: no submission or scope lookup`, async () => {
  const f = await fixture(options);
  await f.run(async () => {
    const response = await post(payload(), jwt);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { ok: false, error: status === 401 ? "Log in to submit your card." : "Finish setting up your profile first." });
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.lookups, []);
  });
});
test("wrong expected account preserves 409 before lookup or submit", async () => {
  const f = await fixture();
  await f.run(async () => {
    const response = await post({ ...payload(), expectedProfileId: B }, token(A));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { ok: false, reason: "wrong-account", error: "This card was opened under a different account." });
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.lookups, []);
  });
});
test("another golfer's card is forbidden even with the same trip membership", async () => {
  const f = await fixture({ bothTrips: true });
  await f.run(async () => {
    const response = await post({ ...payload(), golferProfileId: B }, token(A));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "You can only submit your own card." });
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.lookups, []);
  });
});
test("outsider, cross-trip group, missing group and stale/mismatched round never submit", async () => {
  const cases: { options: Options; jwt: string; trip: string; body: ReturnType<typeof payload> }[] = [
    { options: {}, jwt: token(B), trip: T, body: { ...payload(), golferProfileId: B, expectedProfileId: B } },
    { options: { bothTrips: true }, jwt: token(A), trip: U, body: payload() },
    ...[{ missingGroup: true }, { missingRound: true }, { roundTripMismatch: true }, { notPlayer: true }].map(options => ({ options, jwt: token(A), trip: T, body: payload() })),
    { options: {}, jwt: token(A), trip: T, body: { ...payload(), groupId: U } },
  ];
  for (const c of cases) {
    const f = await fixture(c.options);
    await f.run(async () => {
      const response = await post(c.body, c.jwt, c.trip);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: "Round not found." });
      assert.deepEqual(f.calls, []);
    });
  }
});
test("malformed JSON, UUIDs, version and missing fields preserve 400; invalid trip preserves 404", async () => {
  const f = await fixture();
  await f.run(async () => {
    assert.equal((await post("{", token(A), T, true)).status, 400);
    for (const body of [null, [], {}, { ...payload(), groupId: "bad" }, { ...payload(), golferProfileId: "bad" },
      { ...payload(), cardVersion: -1 }, { ...payload(), cardVersion: 1.5 }, { ...payload(), cardVersion: "36" }, { ...payload(), cardVersion: null }]) {
      const response = await post(body, token(A));
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { ok: false, error: "Invalid request." });
    }
    const response = await post(payload(), token(A), "bad");
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, error: "Trip not found." });
    assert.deepEqual(f.calls, []);
    assert.deepEqual(f.lookups, []);
  });
});
for (const reason of ["incomplete", "unattested", "stale", "mismatch", "no-attester"] as const) test(`${reason} remains a 200 rejected domain result`, async () => {
  const f = await fixture({ reason });
  await f.run(async () => {
    const response = await post(payload(), token(A));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: "rejected", reason, holes: [1], scoring });
  });
});
test("already submitted and repeated attempts preserve RPC idempotent contract", async () => {
  const f = await fixture();
  await f.run(async () => {
    for (const status of ["submitted", "already-submitted", "already-submitted"]) {
      const response = await post(payload(), token(A));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, status, submittedAt: at, scoring });
    }
    assert.equal(f.calls.length, 3);
    assert.ok(f.calls.every(call => call.args.p_card_version === 36 && call.args.p_profile === A));
  });
});
test("submitted-card lock is preserved for late hole writes and repeat submission stays safe", async () => {
  const f = await fixture();
  await f.run(async () => {
    assert.equal((await (await post(payload(), token(A))).json()).status, "submitted");
    const response = await write(new Request(`https://main.example.test/api/golf-trips/${T}/scoring`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token(A)}` },
      body: JSON.stringify({ groupId: G, scoredProfileId: A, expectedProfileId: A,
        ops: [{ opId: G, baseVersion: 0, supersedes: [], clientUpdatedAt: at, entry: { hole: 1, strokes: 5 } }] }),
    }), { params: Promise.resolve({ tripId: T }) });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: "That card is already submitted.", reason: "locked" });
    assert.equal((await (await post(payload(), token(A))).json()).status, "already-submitted");
  });
});
test("existing RPC authorization, locking and validation errors keep their HTTP mapping", async () => {
  for (const [error, status, message] of [
    [{ code: "P0002", message: "Group not found." }, 404, "Round not found."],
    [{ code: "42501", message: "That card is already submitted." }, 403, "That card is already submitted."],
    [{ code: "22023", message: "This card has no approved correction." }, 400, "This card has no approved correction."],
    [{ code: "XX000", message: "PRIVATE database failure" }, 500, "Couldn't save the score. Try again."],
  ] as [NonNullable<Options["error"]>, number, string][]) {
    const f = await fixture({ error });
    await f.run(async () => {
      const response = await post(payload(), token(A));
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { ok: false, error: message });
    });
  }
});
for (const options of [{ profileFailure: true }, { lookupFailure: "scoring_groups" }, { lookupFailure: "golf_trip_rounds" }, { lookupFailure: "scoring_group_players" },
  { lookupThrows: true }, { malformedLookup: true }, { throws: true }, { malformed: true }] as Options[]) test(`backend failure is sanitized: ${JSON.stringify(options)}`, async () => {
  const f = await fixture(options);
  await f.run(async () => {
    const response = await post(payload(), token(A));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, error: "Couldn't submit the card. Try again." });
    if (!options.throws && !options.malformed) assert.deepEqual(f.calls, []);
  });
});
