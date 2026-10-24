import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requestIdentityClient } from "./requestIdentity";
import { profileIdentityFromRow } from "../profile/profileIdentity";

const jwt = (expired = false, sub = "golfer-a", session_id: string | null = "00000000-0000-4000-8000-000000000001", role = "authenticated") => ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify({ sub, role, session_id, exp: expired ? 1 : Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"), Buffer.from("signature").toString("base64url")].join(".");
const user = (id: string) => ({ id, aud: "authenticated", role: "authenticated", email: `${id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: "2026-10-23T00:00:00Z" }) as User;

function fixture(options: { id?: string; cookieId?: string; revoked?: unknown; rpcStatus?: number; authStatus?: number; networkFailure?: boolean } = {}) {
  const calls: { path: string; authorization: string | null }[] = [];
  const cookie = { auth: { getUser: async () => ({ data: { user: options.cookieId ? user(options.cookieId) : null }, error: null }) } } as unknown as SupabaseClient;
  let cookieCalls = 0;
  const cookieClient = async () => { cookieCalls++; return cookie; };
  const plainClient = (token?: string) => createClient("https://identity.example.test", "public-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        calls.push({ path, authorization: new Headers(init?.headers).get("authorization") });
        if (options.networkFailure) throw new Error("unavailable");
        if (path.endsWith("/token")) return Response.json({ error: "invalid_grant", error_description: "No refresh token" }, { status: 400 });
        if (path.endsWith("/user")) return options.authStatus
          ? Response.json({ message: "Invalid JWT", code: "bad_jwt" }, { status: options.authStatus })
          : Response.json(user(options.id ?? "golfer-a"));
        if (path.endsWith("/rpc/session_is_revoked")) return options.rpcStatus
          ? Response.json({ code: options.rpcStatus === 404 ? "PGRST202" : "XX000", message: "Unavailable" }, { status: options.rpcStatus })
          : Response.json(options.revoked === undefined ? false : options.revoked);
        if (path.endsWith("/profiles")) return Response.json([{ id: options.id ?? "golfer-a", display_name: "Golfer", username: "golfer", email: "golfer@example.test" }]);
        throw new Error(`Unexpected endpoint: ${path}`);
      },
    },
  });
  return { calls, cookie, cookieClient, plainClient, cookieCalls: () => cookieCalls };
}

async function resolve(f: ReturnType<typeof fixture>, header: string | null = `Bearer ${jwt()}`) {
  return requestIdentityClient(header, f.cookieClient, f.plainClient);
}
async function signedOut(client: SupabaseClient) {
  assert.equal((await client.auth.getUser()).data.user, null);
}

test("browser requests preserve the original cookie client and never call bearer services", async () => {
  const f = fixture({ cookieId: "browser" });
  assert.equal(await resolve(f, null), f.cookie);
  assert.equal((await f.cookie.auth.getUser()).data.user?.id, "browser");
  assert.equal(f.cookieCalls(), 1);
  assert.deepEqual(f.calls, []);
});

test("anonymous browser requests also retain their existing cookie client", async () => {
  const f = fixture();
  assert.equal(await resolve(f, null), f.cookie);
  await signedOut(f.cookie);
  assert.deepEqual(f.calls, []);
});

test("valid bearer uses Auth's verified identity, and profile queries retain its token", async () => {
  const f = fixture();
  const token = jwt();
  const client = await resolve(f, `Bearer ${token}`);
  assert.equal((await client.auth.getUser()).data.user?.id, "golfer-a");
  const { data } = await client.from("profiles").select("*").eq("id", "golfer-a");
  assert.equal(profileIdentityFromRow(data?.[0])?.profileId, "golfer-a");
  assert.ok(f.calls.some(c => c.path.endsWith("/rpc/session_is_revoked")));
  assert.ok(f.calls.every(c => c.authorization === `Bearer ${token}`));
});

test("same-account cookie and bearer are allowed; conflicting accounts are rejected", async () => {
  assert.equal((await (await resolve(fixture({ cookieId: "golfer-a" }))).auth.getUser()).data.user?.id, "golfer-a");
  await signedOut(await resolve(fixture({ cookieId: "golfer-b" })));
});

test("malformed or unsupported authorization never falls back to a valid cookie", async () => {
  for (const header of ["", "Basic abc", "Bearer opaque", "Bearer a.b.c extra", "Bearer  a.b.c", "Bearer a.b.c, Bearer d.e.f"]) {
    const f = fixture({ cookieId: "browser" });
    await signedOut(await resolve(f, header));
    assert.equal(f.cookieCalls(), 0);
    assert.deepEqual(f.calls, []);
  }
});

test("invalid signature and expired token are refused without cookie fallback", async () => {
  const invalid = fixture({ authStatus: 401, cookieId: "browser" });
  await signedOut(await resolve(invalid));
  assert.equal(invalid.cookieCalls(), 0);
  assert.ok(!invalid.calls.some(c => c.path.includes("/rpc/")));
  const expired = fixture();
  await signedOut(await resolve(expired, `Bearer ${jwt(true)}`));
  assert.ok(!expired.calls.some(c => c.path.includes("/rpc/")));
});

test("revoked, missing, unavailable and unexpected revocation results fail closed", async () => {
  for (const options of [{ revoked: true }, { revoked: null }, { revoked: "false" }, { rpcStatus: 404 }, { rpcStatus: 500 }]) {
    await signedOut(await resolve(fixture(options)));
  }
});

test("cookie verification failure fails closed", async () => {
  const f = fixture();
  const client = await requestIdentityClient(`Bearer ${jwt()}`, async () => { throw new Error("cookie unavailable"); }, f.plainClient);
  await signedOut(client);
});

test("cookie service errors deny bearer access; a missing cookie session is allowed", async () => {
  for (const status of [500, 503]) {
    const f = fixture();
    const broken = { auth: { getUser: async () => ({ data: { user: null }, error: { name: "AuthApiError", status } }) } } as unknown as SupabaseClient;
    await signedOut(await requestIdentityClient(`Bearer ${jwt()}`, async () => broken, f.plainClient));
  }
  const f = fixture();
  const missing = { auth: { getUser: async () => ({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } }) } } as unknown as SupabaseClient;
  assert.equal((await (await requestIdentityClient(`Bearer ${jwt()}`, async () => missing, f.plainClient)).auth.getUser()).data.user?.id, "golfer-a");
});

test("verified tokens require a matching authenticated user and session id", async () => {
  for (const token of [jwt(false, "different-user"), jwt(false, "golfer-a", null), jwt(false, "golfer-a", "malformed"), jwt(false, "golfer-a", "00000000-0000-4000-8000-000000000001", "service_role")]) {
    await signedOut(await resolve(fixture(), `Bearer ${token}`));
  }
});

test("concurrent accounts keep separate verified clients and RLS authorization headers", async () => {
  const a = fixture({ id: "account-a" });
  const b = fixture({ id: "account-b" });
  const tokenA = jwt(false, "account-a");
  const tokenB = jwt(false, "account-b");
  const [clientA, clientB] = await Promise.all([resolve(a, `Bearer ${tokenA}`), resolve(b, `Bearer ${tokenB}`)]);
  assert.notEqual(clientA, clientB);
  assert.equal((await clientA.auth.getUser()).data.user?.id, "account-a");
  assert.equal((await clientB.auth.getUser()).data.user?.id, "account-b");
  assert.ok(a.calls.every(c => c.authorization === `Bearer ${tokenA}`));
  assert.ok(b.calls.every(c => c.authorization === `Bearer ${tokenB}`));
});
