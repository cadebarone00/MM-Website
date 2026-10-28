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
const boundary = globalThis as typeof globalThis & { __scoringWriteBoundary?: Boundary };
boundary.__scoringWriteBoundary = {
  client: request => contexts.getStore()!.client(request), service: () => contexts.getStore()!.service(),
};
const stub = `export const createSupabaseServerClient = request => globalThis.__scoringWriteBoundary.client(request);
export const createSupabaseServiceRoleClient = () => globalThis.__scoringWriteBoundary.service();`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", format: "module", shortCircuit: true };
  if (specifier === "@/lib/supabase/server") return { url: `data:text/javascript,${encodeURIComponent(stub)}`, format: "module", shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url.startsWith("data:text/javascript,")) return { format: "module", source: decodeURIComponent(url.slice("data:text/javascript,".length)), shortCircuit: true };
  return next(url, context);
} });
const { POST } = await import("../../app/api/golf-trips/[tripId]/scoring/route.ts");
const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const T = "20000000-0000-4000-8000-000000000001";
const G = "30000000-0000-4000-8000-000000000001";
const O = "40000000-0000-4000-8000-000000000001";
const U = "20000000-0000-4000-8000-000000000002";
const at = "2026-10-27T12:00:00.000Z";
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
// Only the intercepted Auth service accepts these synthetic credentials.
const token = (id: string, expired = false) => [Buffer.from('{"alg":"HS256"}').toString("base64url"),
  Buffer.from(JSON.stringify({ sub: id, role: "authenticated", session_id: id, exp: expired ? 1 : expiresAt })).toString("base64url"), "c2ln"].join(".");
const user = (id: string) => ({ id, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: at });
const entry = { hole: 1, strokes: 4, putts: 2, fairway: "center", green: "center", penaltyFairway: false, penaltyGreen: false };
const scoring = { roundId: T, roundNumber: 1, groups: [], entries: [] };
const payload = (ops: boolean) => ops
  ? { groupId: G, scoredProfileId: A, expectedProfileId: A, ops: [{ opId: O, baseVersion: 0, supersedes: [], clientUpdatedAt: at, entry }] }
  : { groupId: G, scoredProfileId: A, clientUpdatedAt: at, entries: [entry] };
type Options = {
  cookie?: string; revoked?: boolean; revocationFailure?: boolean; incomplete?: boolean; missingProfile?: boolean;
  profileFailure?: boolean; throws?: boolean; malformed?: boolean; error?: { code: string; message: string };
  resultStatus?: "applied" | "duplicate" | "conflict" | "locked";
  bothTrips?: boolean; missingGroup?: boolean; missingRound?: boolean; roundTripMismatch?: boolean;
  lookupFailure?: "scoring_groups" | "golf_trip_rounds"; lookupThrows?: boolean; deleteAfterLookup?: boolean; malformedLookup?: boolean;
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
      if (table === "scoring_groups" || table === "golf_trip_rounds") {
        lookups.push({ table, profile: id });
        if (options.lookupFailure === table) return Response.json({ message: "PRIVATE lookup failure" }, { status: 500 });
        if (options.malformedLookup) return Response.json({ id: G });
        // Existing user-token RLS is modeled here: B is an outsider, A may belong to both trips.
        const allowed = id === A && (url.searchParams.get("golf_trip_id") === `eq.${T}`
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
  const service = { async rpc(name: string, args: Record<string, unknown>) {
    if (name === "account_deletion_state") return { data: { state: null }, error: null };
    assert.ok(["save_hole_scores", "save_hole_score_ops"].includes(name));
    calls.push({ name, args });
    if (options.throws) throw new Error("PRIVATE backend detail");
    if (options.error) return { data: null, error: options.error };
    if (options.deleteAfterLookup) return { data: null, error: { code: "P0002", message: "Group not found." } };
    // Model existing RPC authorization; no custom authorization is added to production code.
    if (args.p_profile !== A || args.p_group !== G) return { data: null, error: { code: "P0002", message: "Group not found." } };
    if (args.p_scored !== A) return { data: null, error: { code: "42501", message: "You can only score yourself and the golfer you attest." } };
    const status = options.resultStatus ?? "applied";
    const data = name === "save_hole_scores" ? scoring : { scoring, results: [{ opId: O, status, version: 1, ...(status === "conflict" ? { server: entry } : {}) }] };
    return { data: options.malformed ? {} : data, error: null };
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
const post = (body: unknown, jwt?: string, tripId = T, raw = false) => POST(new Request(`https://main.example.test/api/golf-trips/${tripId}/scoring`, {
  method: "POST", headers: { "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) }, body: raw ? String(body) : JSON.stringify(body),
}), { params: Promise.resolve({ tripId }) });

for (const mode of ["cookie", "bearer"]) for (const ops of [true, false]) test(`${mode} success preserves ${ops ? "ops" : "entries"} contract and server identity`, async () => {
  const f = await fixture({ cookie: mode === "cookie" ? A : undefined });
  await f.run(async () => {
    const response = await post(payload(ops), mode === "bearer" ? token(A) : undefined);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), ops ? { ok: true, scoring, results: [{ opId: O, status: "applied", version: 1 }] } : { ok: true, scoring });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].name, ops ? "save_hole_score_ops" : "save_hole_scores");
    assert.deepEqual(f.calls[0].args, ops
      ? { p_profile: A, p_group: G, p_scored: A, p_ops: payload(true).ops }
      : { p_profile: A, p_group: G, p_scored: A, p_client_updated_at: at, p_entries: [entry] });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(f.lookups, [{ table: "scoring_groups", profile: A }, { table: "golf_trip_rounds", profile: A }]);
  });
});
for (const [name, options, jwt, status] of [
  ["missing session", {}, undefined, 401],
  ["revoked bearer", { revoked: true }, token(A), 401],
  ["invalid bearer with valid cookie", { cookie: A }, "invalid", 401],
  ["unknown signed token", {}, token(O), 401],
  ["expired token", {}, token(A, true), 401],
  ["conflicting identities", { cookie: B }, token(A), 401],
  ["revocation unavailable", { revocationFailure: true }, token(A), 401],
  ["incomplete profile", { incomplete: true }, token(A), 409],
  ["missing profile", { missingProfile: true }, token(A), 409],
] as [string, Options, string | undefined, number][]) test(`${name} rejects both payloads without mutation RPC`, async () => {
  const f = await fixture(options);
  await f.run(async () => {
    for (const ops of [true, false]) {
      const response = await post(payload(ops), jwt);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { ok: false, error: status === 401 ? "Log in to keep score." : "Finish setting up your profile first." });
    }
    assert.deepEqual(f.calls, []);
  });
});
test("wrong-account ops are rejected before mutation", async () => {
  const f = await fixture();
  await f.run(async () => {
    const response = await post({ ...payload(true), expectedProfileId: B }, token(A));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { ok: false, reason: "wrong-account", error: "These scores were entered under a different account." });
    assert.deepEqual(f.calls, []);
  });
});
test("outsider and wrong player retain RPC authorization errors for both payloads", async () => {
  for (const ops of [true, false]) {
    const f = await fixture();
    await f.run(async () => {
      const outsider = await post({ ...payload(ops), expectedProfileId: B }, token(B));
      assert.equal(outsider.status, 404);
      assert.deepEqual(await outsider.json(), { ok: false, error: "Round not found." });
      assert.deepEqual(f.calls, []);
      const other = await post({ ...payload(ops), scoredProfileId: B }, token(A));
      assert.equal(other.status, 403);
      assert.deepEqual(await other.json(), { ok: false, error: "You can only score yourself and the golfer you attest." });
    });
  }
});
test("cross-trip group is hidden even when the caller belongs to both trips", async () => {
  for (const ops of [true, false]) for (const mode of ["cookie", "bearer"]) {
    const f = await fixture({ bothTrips: true, cookie: mode === "cookie" ? A : undefined });
    await f.run(async () => {
      const response = await post(payload(ops), mode === "bearer" ? token(A) : undefined, U);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: "Round not found." });
      assert.deepEqual(f.calls, []);
    });
  }
});
test("unknown/deleted group and stale or cross-trip round reject both formats without mutation", async () => {
  for (const options of [{ missingGroup: true }, { missingRound: true }, { roundTripMismatch: true }]) for (const ops of [true, false]) {
    const f = await fixture(options);
    await f.run(async () => {
      const response = await post(payload(ops), token(A));
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: "Round not found." });
      assert.deepEqual(f.calls, []);
    });
  }
  const f = await fixture();
  await f.run(async () => {
    for (const ops of [true, false]) {
      assert.equal((await post({ ...payload(ops), groupId: O }, token(A))).status, 404);
    }
    assert.deepEqual(f.calls, []);
  });
});
test("binding backend failures fail closed without mutation or private details", async () => {
  for (const options of [{ lookupFailure: "scoring_groups" }, { lookupFailure: "golf_trip_rounds" }, { lookupThrows: true }, { malformedLookup: true }] as Options[]) {
    for (const ops of [true, false]) {
      const f = await fixture(options);
      await f.run(async () => {
        const response = await post(payload(ops), token(A));
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { ok: false, error: "Couldn't save the score. Try again." });
        assert.deepEqual(f.calls, []);
      });
    }
  }
});
test("deletion after preflight still returns the unchanged RPC missing-group denial", async () => {
  for (const ops of [true, false]) {
    const f = await fixture({ deleteAfterLookup: true });
    await f.run(async () => {
      const response = await post(payload(ops), token(A));
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: "Round not found." });
    });
  }
});
test("malformed JSON, schemas and trip IDs do not reach mutation RPCs", async () => {
  const f = await fixture();
  await f.run(async () => {
    assert.equal((await post("{", token(A), T, true)).status, 400);
    for (const body of [null, {}, { ...payload(false), entries: [] }, { ...payload(false), entries: [{ hole: 19, strokes: 4 }] },
      { ...payload(true), ops: [] }, { ...payload(true), ops: [{ opId: "bad" }] }, { ...payload(false), groupId: "bad" }]) {
      assert.equal((await post(body, token(A))).status, 400);
    }
    assert.equal((await post(payload(true), token(A), "bad")).status, 404);
    assert.deepEqual(f.calls, []);
  });
});
for (const status of ["applied", "duplicate", "conflict", "locked"] as const) test(`per-op ${status} remains a 200 domain result`, async () => {
  const f = await fixture({ resultStatus: status });
  await f.run(async () => {
    const response = await post(payload(true), token(A));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, scoring, results: [{ opId: O, status, version: 1, ...(status === "conflict" ? { server: entry } : {}) }] });
  });
});
test("submitted-card and validation errors retain existing status/reason shapes", async () => {
  for (const ops of [true, false]) for (const [error, status] of [
    [{ code: "42501", message: "That card is already submitted." }, 403],
    [{ code: "22023", message: "An attester enters strokes only." }, 400],
  ] as [NonNullable<Options["error"]>, number][]) {
    const f = await fixture({ error });
    await f.run(async () => {
      const response = await post(payload(ops), token(A));
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { ok: false, error: error.message, ...(ops && status === 403 ? { reason: "locked" } : {}) });
    });
  }
});
for (const options of [{ profileFailure: true }, { throws: true }, { malformed: true }, { error: { code: "XX000", message: "PRIVATE failure" } }]) test(`backend failure is sanitized: ${JSON.stringify(options)}`, async () => {
  const f = await fixture(options);
  await f.run(async () => {
    for (const ops of [true, false]) {
      const response = await post(payload(ops), token(A));
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { ok: false, error: "Couldn't save the score. Try again." });
    }
    if (options.profileFailure) assert.deepEqual(f.calls, []);
  });
});
