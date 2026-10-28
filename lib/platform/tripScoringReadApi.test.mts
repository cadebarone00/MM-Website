import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import * as nodeModule from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requestIdentityClient } from "../supabase/requestIdentity.ts";

// Intercept only the server SDK factories and server-only marker. Routes,
// profile resolution, bearer verification, read loaders and DTOs are real.
type Boundary = { client(request?: Request): Promise<SupabaseClient>; service(): SupabaseClient };
const contexts = new AsyncLocalStorage<Boundary>();
// Runtime is Node 24; the repository intentionally retains @types/node 20.
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: {
  resolve(specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown): unknown;
  load(url: string, context: unknown, next: (url: string, context: unknown) => unknown): unknown;
}): void };
const boundary = globalThis as typeof globalThis & { __scoringReadBoundary?: Boundary };
boundary.__scoringReadBoundary = {
  client: request => contexts.getStore()!.client(request), service: () => contexts.getStore()!.service(),
};
const stub = `export const createSupabaseServerClient = request => globalThis.__scoringReadBoundary.client(request);
export const createSupabaseServiceRoleClient = () => globalThis.__scoringReadBoundary.service();`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", format: "module", shortCircuit: true };
  if (specifier === "@/lib/supabase/server") return { url: `data:text/javascript,${encodeURIComponent(stub)}`, format: "module", shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url.startsWith("data:text/javascript,")) return { format: "module", source: decodeURIComponent(url.slice("data:text/javascript,".length)), shortCircuit: true };
  return next(url, context);
} });
const { GET } = await import("../../app/api/golf-trips/[tripId]/scoring/route.ts");
const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const T = "20000000-0000-4000-8000-000000000001";
const scoring = { roundId: T, roundNumber: 1, groups: [], entries: [] };
const expiresAt = Math.floor(Date.now() / 1000) + 3600;
// Synthetic credentials are accepted only by the intercepted Auth service.
const token = (id: string) => [Buffer.from('{"alg":"HS256"}').toString("base64url"),
  Buffer.from(JSON.stringify({ sub: id, role: "authenticated", session_id: id, exp: expiresAt })).toString("base64url"), "c2ln"].join(".");
const user = (id: string) => ({ id, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-10-27T00:00:00Z" });
type Options = { cookie?: string; revoked?: boolean; revocationFailure?: boolean; incomplete?: boolean; missingProfile?: boolean; profileFailure?: boolean; rpcFailure?: boolean; throws?: boolean; malformed?: boolean };
async function fixture(options: Options = {}) {
  const calls: Record<string, unknown>[] = [];
  const known = new Map([[token(A), A], [token(B), B]]);
  const plain = (jwt?: string) => createClient("https://scoring.example.test", "anon-key", {
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
      throw new Error("Unexpected SDK request");
    } },
  });
  const cookie = plain();
  if (options.cookie) await cookie.auth.setSession({ access_token: token(options.cookie), refresh_token: "synthetic" });
  const service = { async rpc(name: string, args: Record<string, unknown>) {
    if (name === "account_deletion_state") return { data: { state: null }, error: null };
    assert.equal(name, "get_trip_round_scoring");
    calls.push(args);
    if (options.throws) throw new Error("PRIVATE failure");
    if (options.rpcFailure) return { data: null, error: { message: "Synthetic scoring failure" } };
    // Model the existing RPC's membership gate; the route and scoring loader remain real.
    return { data: args.p_profile === A && args.p_trip === T && args.p_round_number === 1
      ? options.malformed ? {} : scoring : null, error: null };
  } } as unknown as SupabaseClient;
  const context: Boundary = {
    client: request => request ? requestIdentityClient(request.headers.get("authorization"), async () => cookie, plain) : Promise.resolve(cookie),
    service: () => service,
  };
  return { calls, run: <R,>(fn: () => R) => contexts.run(context, fn) };
}
const open = (jwt?: string, tripId = T, round = "1") => GET(new Request(`https://main.example.test/api/golf-trips/${tripId}/scoring?round=${round}`, {
  headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
}), { params: Promise.resolve({ tripId }) });

for (const mode of ["cookie", "bearer"]) test(`${mode} member keeps scoring response and no-store header`, async () => {
  const f = await fixture({ cookie: mode === "cookie" ? A : undefined });
  await f.run(async () => {
    const response = await open(mode === "bearer" ? token(A) : undefined);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, scoring });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(f.calls, [{ p_profile: A, p_trip: T, p_round_number: 1 }]);
  });
});
for (const [name, options, jwt] of [
  ["missing session", {}, undefined],
  ["revoked bearer", { revoked: true }, token(A)],
  ["invalid bearer cannot fall back to valid cookie", { cookie: A }, "invalid"],
  ["Auth rejects well-formed unknown bearer", {}, token("10000000-0000-4000-8000-000000000003")],
  ["conflicting cookie and bearer", { cookie: B }, token(A)],
  ["unavailable revocation check", { revocationFailure: true }, token(A)],
  ["incomplete profile", { incomplete: true }, token(A)],
  ["missing profile", { missingProfile: true }, token(A)],
] as [string, Options, string | undefined][]) test(`${name} returns existing 401 before scoring lookup`, async () => {
  const f = await fixture(options);
  await f.run(async () => {
    const response = await open(jwt);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "Log in to keep score." });
    assert.deepEqual(f.calls, []);
  });
});
test("outsider and missing round retain identical 404s with server-resolved identity", async () => {
  const f = await fixture();
  await f.run(async () => {
    for (const [jwt, round] of [[token(B), "1"], [token(A), "2"]]) {
      const response = await open(jwt, T, round);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { ok: false, error: "Round not found." });
    }
    assert.equal(f.calls[0].p_profile, B);
  });
});
test("malformed trip and invalid round never call the scoring RPC", async () => {
  const f = await fixture();
  await f.run(async () => {
    for (const [trip, round] of [["bad", "1"], [T, "0"], [T, "63"], [T, "1.5"], [T, "bad"]]) {
      assert.equal((await open(token(A), trip, round)).status, 404);
    }
    assert.deepEqual(f.calls, []);
  });
});
for (const options of [{ profileFailure: true }, { rpcFailure: true }, { throws: true }, { malformed: true }]) test(`backend failure is sanitized: ${JSON.stringify(options)}`, async () => {
  const f = await fixture(options);
  await f.run(async () => {
    const response = await open(token(A));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { ok: false, error: "Couldn't load scores." });
    if (options.profileFailure) assert.deepEqual(f.calls, []);
  });
});
