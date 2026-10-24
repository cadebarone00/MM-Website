import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import * as nodeModule from "node:module";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requestIdentityClient } from "../supabase/requestIdentity.ts";
import type { SavedGolfTrip } from "./golfTripCreate.ts";

// Intercept only the server SDK factories and server-only marker. Routes,
// profile resolution, bearer verification, read loaders and DTOs are real.
type Boundary = { client(request?: Request): Promise<SupabaseClient>; service(): SupabaseClient };
const contexts = new AsyncLocalStorage<Boundary>();
// Runtime is Node 24; the repository intentionally retains @types/node 20.
const { registerHooks } = nodeModule as unknown as { registerHooks(hooks: {
  resolve(specifier: string, context: unknown, next: (specifier: string, context: unknown) => unknown): unknown;
  load(url: string, context: unknown, next: (url: string, context: unknown) => unknown): unknown;
}): void };
const boundary = globalThis as typeof globalThis & { __tripReadBoundary?: Boundary };
boundary.__tripReadBoundary = {
  client: request => contexts.getStore()!.client(request), service: () => contexts.getStore()!.service(),
};
const stub = `export const createSupabaseServerClient = request => globalThis.__tripReadBoundary.client(request);
export const createSupabaseServiceRoleClient = () => globalThis.__tripReadBoundary.service();`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", format: "module", shortCircuit: true };
  if (specifier === "@/lib/supabase/server") return { url: `data:text/javascript,${encodeURIComponent(stub)}`, format: "module", shortCircuit: true };
  return next(specifier, context);
}, load(url, context, next) {
  if (url.startsWith("data:text/javascript,")) return { format: "module", source: decodeURIComponent(url.slice("data:text/javascript,".length)), shortCircuit: true };
  return next(url, context);
} });
const { GET: list } = await import("../../app/api/golf-trips/route.ts");
const { GET: detail } = await import("../../app/api/golf-trips/[tripId]/route.ts");
const { getGolfTrip, getUserGolfTrips } = await import("./golfTripsServer.ts");

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const T = "20000000-0000-4000-8000-000000000001";
const U = "20000000-0000-4000-8000-000000000002";
const token = (id: string, expired = false) => [Buffer.from('{"alg":"HS256"}').toString("base64url"),
  Buffer.from(JSON.stringify({ sub: id, role: "authenticated", session_id: id, exp: expired ? 1 : Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), "c2ln"].join(".");
const user = (id: string) => ({ id, aud: "authenticated", role: "authenticated", email: "synthetic@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-10-23T00:00:00Z" });
const saved = (id: string, owner: string): SavedGolfTrip => ({
  trip: { id, name: "Test Trip", destination: "Pinehurst", start_date: "2027-04-22", end_date: "2027-04-26",
    expected_traveler_count: 4, golf_days: 1, planned_rounds: 1, includes_tournament: "no", lodging_plan: "no",
    flight_plan: "no", transportation_plan: "no", tournament_id: null, status: "active", created_by: owner, watch_code: "PRIVATE-WATCH" },
  members: [
    { id: "owner-row", profileId: owner, displayName: "Golfer", email: "private@example.test", role: "organizer", invitationStatus: "accepted" },
    { id: "invitation-row", profileId: null, displayName: "Pending Person", email: "invite@example.test", role: "member", invitationStatus: "pending" },
  ],
  rounds: [{ roundNumber: 1, dayNumber: 1, playDate: "2027-04-23", courseName: "Pinehurst No. 2" }],
});

async function fixture(options: { cookie?: string; missingProfile?: boolean; incomplete?: boolean; revoked?: boolean; rpcFailure?: boolean; profileFailure?: boolean; setupInstalled?: boolean; member?: boolean; empty?: boolean } = {}) {
  const calls: { name: string; profile?: string }[] = [];
  const knownTokens = new Map([[token(A), A], [token(B), B]]);
  const plain = (jwt?: string) => createClient("https://trip-api.example.test", "anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { ...(jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : {}), fetch: async (input, init) => {
      const url = new URL(String(input));
      const jwt = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "");
      const id = jwt ? knownTokens.get(jwt) : undefined;
      if (url.pathname.endsWith("/token")) return Response.json({ error: "invalid_grant" }, { status: 400 });
      if (url.pathname.endsWith("/user")) return id ? Response.json(user(id)) : Response.json({ message: "Invalid JWT" }, { status: 401 });
      if (url.pathname.endsWith("/rpc/session_is_revoked")) return Response.json(options.revoked === true);
      if (url.pathname.endsWith("/profiles")) {
        if (options.profileFailure) return Response.json({ message: "PRIVATE DATABASE FAILURE" }, { status: 500 });
        const rows = id && url.searchParams.get("id") === `eq.${id}` && !options.missingProfile
          ? [{ id, display_name: "Golfer", username: options.incomplete ? null : "golfer", email: "private@example.test", player_slug: null }] : [];
        return Response.json(rows);
      }
      throw new Error("Unexpected Auth/REST call");
    } },
  });
  const cookie = plain();
  if (options.cookie) await cookie.auth.setSession({ access_token: token(options.cookie), refresh_token: "test-only" });
  const service = {
    async rpc(name: string, args: Record<string, string>) {
      calls.push({ name, profile: args.p_profile });
      if (name === "account_deletion_state") return { data: { state: null }, error: null };
      if (options.rpcFailure) return { data: null, error: { message: "PRIVATE DATABASE FAILURE" } };
      const mine = args.p_profile === A || options.member ? saved(T, A) : saved(U, B);
      if (options.member) mine.members.push({ id: "member-row", profileId: B, displayName: "Member", email: "member-private@example.test", role: "member", invitationStatus: "accepted" });
      if (name === "get_golf_trip") return { data: args.p_trip === mine.trip.id ? { ...mine, inviteToken: "PRIVATE-INVITE" } : null, error: null };
      if (name === "list_my_golf_trips") return { data: options.empty ? [] : [{ id: mine.trip.id, name: mine.trip.name, destination: mine.trip.destination,
        startDate: mine.trip.start_date, endDate: mine.trip.end_date, status: "active", expectedTravelerCount: 4,
        memberCount: 1, role: "organizer", internalSecret: "PRIVATE-INTERNAL" }], error: null };
      throw new Error("Unexpected business RPC");
    },
    from(table: string) {
      calls.push({ name: table });
      if (table === "profiles") return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      if (table === "golf_trip_setup") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null,
        error: options.setupInstalled ? null : { code: "42P01" } }) }) }) };
      throw new Error("Unexpected business table");
    },
  } as unknown as SupabaseClient;
  const context: Boundary = {
    client: request => request ? requestIdentityClient(request.headers.get("authorization"), async () => cookie, plain) : Promise.resolve(cookie),
    service: () => service,
  };
  return { calls, run: <R,>(fn: () => R) => contexts.run(context, fn) };
}
const request = (jwt?: string, query = "") => new Request(`https://main.example.test/api/golf-trips${query}`, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
const open = (req: Request, id = T) => detail(req, { params: Promise.resolve({ tripId: id }) });

test("actual GET routes support cookie and bearer auth with allowlisted DTOs and no shared cache", async () => {
  for (const mode of ["cookie", "bearer"]) {
    const f = await fixture({ cookie: mode === "cookie" ? A : undefined });
    await f.run(async () => {
      const req = request(mode === "bearer" ? token(A) : undefined);
      const response = await list(req);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("vary"), "Authorization, Cookie");
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      const body = await response.json();
      assert.equal(body.trips[0].id, T);
      assert.deepEqual(Object.keys(body.trips[0]).sort(), ["id", "name", "destination", "startDate", "endDate", "status", "expectedTravelerCount", "memberCount", "role"].sort());
      const opened = await open(req);
      assert.equal(opened.status, 200);
      const detailBody = await opened.json();
      assert.deepEqual(detailBody.viewer, { role: "organizer" });
      assert.deepEqual(detailBody.members, [{ displayName: "Golfer", role: "organizer" }]);
      assert.deepEqual(detailBody.setup, { available: false });
      assert.equal(detailBody.rounds[0].courseName, "Pinehurst No. 2");
      assert.ok(!JSON.stringify(detailBody).includes("PRIVATE"));
      assert.ok(!JSON.stringify(detailBody).includes("email"));
    });
  }
});

test("missing, invalid, expired, revoked and conflicting identities are denied before trip RPCs", async () => {
  for (const options of [{}, { jwt: "bad" }, { jwt: token(A, true) }, { jwt: token(A), revoked: true }, { jwt: token(A), cookie: B }, { jwt: "bad", cookie: A }]) {
    const f = await fixture(options);
    await f.run(async () => {
      for (const handler of [list, open]) {
        const response = await handler(request("jwt" in options ? options.jwt : undefined));
        assert.equal(response.status, 401);
        assert.equal((await response.json()).code, "unauthorized");
      }
      assert.equal(f.calls.length, 0);
    });
  }
});

test("missing profile gets 403; incomplete existing profile retains browser read permission", async () => {
  const missing = await fixture({ missingProfile: true });
  await missing.run(async () => {
    for (const handler of [list, open]) {
      const response = await handler(request(token(A)));
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "profile_required");
    }
    assert.ok(missing.calls.every(call => call.name === "account_deletion_state"));
  });
  const incomplete = await fixture({ incomplete: true });
  await incomplete.run(async () => assert.equal((await open(request(token(A)))).status, 200));
});

test("nonmember, nonexistent and malformed trips have the identical 404 response", async () => {
  const f = await fixture();
  await f.run(async () => {
    const results = [];
    for (const id of [T, "30000000-0000-4000-8000-000000000001", "invalid"]) {
      const response = await open(request(token(B)), id);
      assert.equal(response.status, 404);
      results.push(await response.json());
    }
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[1], results[2]);
    assert.ok(!f.calls.some(call => call.name === "golf_trip_setup"));
  });
});

test("account switching and simultaneous requests never reuse another account's profile", async () => {
  const f = await fixture();
  await f.run(async () => {
    const [a, b] = await Promise.all([list(request(token(A), `?profileId=${B}`)), list(request(token(B), `?profileId=${A}`))]);
    assert.equal((await a.json()).trips[0].id, T);
    assert.equal((await b.json()).trips[0].id, U);
    assert.equal((await open(request(token(B)))).status, 404);
    assert.equal((await open(request(token(A)))).status, 200);
    assert.deepEqual(f.calls.filter(call => call.name === "list_my_golf_trips").map(call => call.profile).sort(), [A, B]);
  });
});

test("setup availability uses the existing optional-table fallback without leaking settings", async () => {
  const f = await fixture({ setupInstalled: true });
  await f.run(async () => {
    const response = await open(request(token(A)));
    assert.deepEqual((await response.json()).setup, { available: true });
  });
});

test("accepted members can open their trip without receiving organizer contacts or pending invitations", async () => {
  const f = await fixture({ member: true });
  await f.run(async () => {
    const response = await open(request(token(B)));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.viewer, { role: "member" });
    assert.equal(body.members.length, 2);
    assert.ok(!JSON.stringify(body).includes("@example.test"));
    assert.ok(!JSON.stringify(body).includes("Pending Person"));
  });
});

test("a profile with no memberships receives an empty successful list", async () => {
  const f = await fixture({ empty: true });
  await f.run(async () => assert.deepEqual(await (await list(request(token(A)))).json(), { ok: true, trips: [] }));
});

test("database failures return sanitized 503 responses", async () => {
  for (const options of [{ rpcFailure: true }, { profileFailure: true }]) {
    const f = await fixture(options);
    await f.run(async () => {
      for (const handler of [list, open]) {
        const response = await handler(request(token(A)));
        assert.equal(response.status, 503);
        assert.equal((await response.json()).code, "unavailable");
      }
    });
  }
});

test("existing browser loader signatures remain cookie-based", async () => {
  const f = await fixture({ cookie: A });
  await f.run(async () => {
    assert.equal((await getUserGolfTrips()).status, "ok");
    assert.equal((await getGolfTrip(T)).status, "ok");
  });
});
