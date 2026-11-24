import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startFakeSupabase } from "../fake-supabase.mjs";
import { SIM_MIGRATIONS } from "../../lib/dev/sim/migrations";
import { startFrontDoor } from "./frontDoor";

const DOC = { "sec-fetch-dest": "document" };

async function setup() {
  const upstream = http.createServer((req, res) => {
    if (req.url?.startsWith("/redir")) {
      res.writeHead(307, { Location: `http://localhost:${(upstream.address() as AddressInfo).port}/landed` });
      res.end();
      return;
    }
    if (req.url === "/page") { res.setHeader("content-type", "text/html"); res.end("<html><head><title>t</title></head><body>hello</body></html>"); return; }
    if (req.url?.startsWith("/_next/")) { res.setHeader("content-type", "text/html"); res.end("<html><head></head></html>"); return; }
    if (req.url === "/data") { res.setHeader("content-type", "application/json"); res.end("{\"a\":1}"); return; }
    res.setHeader("x-seen-cookie", req.headers.cookie ?? "");
    res.statusCode = req.url?.startsWith("/api/y") ? 500 : 200;
    res.end("hi");
  });
  await new Promise<void>((r) => upstream.listen(0, r));
  const fake = { current: await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS }) };
  const door = await startFrontDoor({ port: 0, appPort: (upstream.address() as AddressInfo).port, fake });
  const base = `http://localhost:${door.port}`;
  // Host header decides the person; fetch can't set Host, so use http.request.
  const call = (host: string, path: string, method = "GET", body?: string, extra: Record<string, string> = {}) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: door.port, path, method, headers: { host, ...extra, ...(body ? { "content-type": "application/json" } : {}) } }, (res) => {
        let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: b }));
      });
      req.on("error", reject);
      req.end(body);
    });
  const close = async () => { await door.close(); await fake.current.close(); await new Promise((r) => upstream.close(r)); };
  return { door, fake, base, call, close };
}

test("login as the host's own person sets the cookie; as someone else is refused", async () => {
  const s = await setup();
  try {
    await s.call("localhost:3005", "/__sim/scenario", "POST", JSON.stringify({ id: "play-solo" }));
    const ok = await s.call("cam.localhost:3005", "/__sim/login?as=cam&next=/play");
    assert.equal(ok.status, 200);
    assert.match(String(ok.headers["set-cookie"]), /^sb-localhost-auth-token=base64-.*; Path=\/; SameSite=Lax/);
    assert.ok(ok.body.includes("localStorage.clear()"));
    const bad = await s.call("cade.localhost:3005", "/__sim/login?as=cam");
    assert.equal(bad.status, 400);
    assert.equal(bad.headers["set-cookie"], undefined);
    const unknown = await s.call("zed.localhost:3005", "/__sim/login?as=zed");
    assert.equal(unknown.status, 400);
  } finally { await s.close(); }
});

test("proxied api calls are logged with person and status", async () => {
  const s = await setup();
  try {
    assert.equal((await s.call("cam.localhost:3005", "/api/x")).status, 200);
    assert.equal((await s.call("cam.localhost:3005", "/api/y")).status, 500);
    const entries = JSON.parse((await s.call("localhost:3005", "/__sim/log?since=0")).body);
    const x = entries.find((e: any) => e.text === "GET /api/x → 200");
    const y = entries.find((e: any) => e.text === "GET /api/y → 500");
    assert.ok(x && y);
    assert.equal(x.person, "cam");
    assert.equal(x.ok, true);
    assert.equal(y.ok, false);
    assert.equal(x.kind, "api");
  } finally { await s.close(); }
});

test("scenario then reset returns to the seeded start", async () => {
  const s = await setup();
  try {
    const status = JSON.parse((await s.call("localhost:3005", "/__sim/scenario", "POST", JSON.stringify({ id: "play-solo" }))).body);
    assert.equal(status.scenario, "play-solo");
    assert.ok(status.phones.length >= 1);
    const roundId = status.phones[0].startPath.match(/[0-9a-f-]{36}/)?.[0];
    assert.ok(roundId);
    const holes = async () => (await s.fake.current.db.query("select count(*)::int as n from shared_round_holes")).rows[0] as { n: number };
    assert.equal((await holes()).n, 0);
    await s.fake.current.db.query("insert into shared_round_holes (round_id, profile_id, hole, strokes) select $1, host, 1, 4 from shared_rounds where id = $1", [roundId]);
    assert.equal((await holes()).n, 1);
    const t0 = Date.now();
    const after = JSON.parse((await s.call("localhost:3005", "/__sim/reset", "POST")).body);
    const ms = Date.now() - t0;
    console.log(`reset took ${ms} ms`);
    assert.ok(ms < 10000, `reset took ${ms} ms`);
    assert.equal(after.scenario, "play-solo");
    assert.equal((await holes()).n, 0);
    // tokens still work after the restore
    const login = await s.call("cam.localhost:3005", "/__sim/login?as=cam");
    assert.equal(login.status, 200);
    const checks = JSON.parse((await s.call("localhost:3005", "/__sim/checks")).body);
    assert.ok(Array.isArray(checks) && checks.length > 0);
  } finally { await s.close(); }
});

test("/__sim responses allow the control page origin", async () => {
  const s = await setup();
  try {
    const r = await s.call("localhost:3005", "/__sim/status");
    assert.equal(r.headers["access-control-allow-origin"], "http://localhost:3001");
    const pre = await s.call("localhost:3005", "/__sim/reset", "OPTIONS");
    assert.equal(pre.status, 204);
    assert.equal(pre.headers["access-control-allow-origin"], "http://localhost:3001");
  } finally { await s.close(); }
});

test("absolute redirects from the app stay on the phone's own host", async () => {
  const s = await setup();
  try {
    const r = await s.call(`cam.localhost:${s.door.port}`, "/redir");
    assert.equal(r.status, 307);
    assert.equal(r.headers.location, `http://cam.localhost:${s.door.port}/landed`);
  } finally { await s.close(); }
});

test("scenario and reset refuse a foreign Origin", async () => {
  const s = await setup();
  try {
    const bad = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: s.door.port, path: "/__sim/reset", method: "POST", headers: { origin: "http://evil.example" } }, (res) => { res.resume(); resolve(res.statusCode!); });
      req.on("error", reject); req.end();
    });
    assert.equal(bad, 403);
  } finally { await s.close(); }
});

test("a phone is signed in by the front door; a host outside the scenario is not", async () => {
  const s = await setup();
  try {
    await s.call("localhost:3005", "/__sim/scenario", "POST", JSON.stringify({ id: "play-solo" }));
    const cam = await s.call("cam.localhost:3005", "/api/x");
    assert.match(String(cam.headers["x-seen-cookie"]), /^sb-localhost-auth-token=base64-/);
    // An old cookie for the same name is replaced, other cookies are kept.
    const old = await new Promise<http.IncomingHttpHeaders>((resolve) => {
      http.get({ host: "127.0.0.1", port: s.door.port, path: "/api/x", headers: { host: "cam.localhost:3005", cookie: "a=1; sb-localhost-auth-token=stale" } }, (res) => { res.resume(); resolve(res.headers); });
    });
    const seen = String(old["x-seen-cookie"]);
    assert.ok(seen.startsWith("a=1; sb-localhost-auth-token=base64-") && !seen.includes("stale"));
    assert.equal((await s.call("zed.localhost:3005", "/api/x")).headers["x-seen-cookie"], "");
  } finally { await s.close(); }
});

test("each phone's page history is recorded, capped, and Back pops it", async () => {
  const s = await setup();
  try {
    await s.call("localhost:3005", "/__sim/scenario", "POST", JSON.stringify({ id: "play-solo" }));
    const nav = (path: string, dest = "document") => new Promise<void>((resolve) => {
      http.get({ host: "127.0.0.1", port: s.door.port, path, headers: { host: "cam.localhost:3005", "sec-fetch-dest": dest } }, (res) => { res.resume(); res.on("end", () => resolve()); });
    });
    await nav("/a"); await nav("/b?x=1"); await nav("/b?x=1"); await nav("/_next/x.js", "script"); await nav("/c", "script");
    const pages = async () => JSON.parse((await s.call("localhost:3005", "/__sim/status")).body).pages;
    assert.deepEqual((await pages()).cam, { path: "/b?x=1", history: ["/a", "/b?x=1"] });
    const back = JSON.parse((await s.call("localhost:3005", "/__sim/back", "POST", JSON.stringify({ person: "cam" }))).body);
    assert.equal(back.path, "/a");
    assert.deepEqual((await pages()).cam, { path: "/a", history: ["/a"] });
    assert.equal(JSON.parse((await s.call("localhost:3005", "/__sim/back", "POST", JSON.stringify({ person: "cam" }))).body).path, null);
    await s.call("localhost:3005", "/__sim/reset", "POST");
    assert.deepEqual((await pages()), {});
  } finally { await s.close(); }
});

test("app-router navigations (rsc: 1, no prefetch) are recorded without _rsc; prefetches and plain fetches are not", async () => {
  const s = await setup();
  try {
    await s.call("localhost:3005", "/__sim/scenario", "POST", JSON.stringify({ id: "play-solo" }));
    const get = (path: string, extra: Record<string, string>) => new Promise<void>((resolve) => {
      http.get({ host: "127.0.0.1", port: s.door.port, path, headers: { host: "cam.localhost:3005", "sec-fetch-dest": "empty", ...extra } }, (res) => { res.resume(); res.on("end", () => resolve()); });
    });
    await get("/play?x=1&_rsc=abc", { rsc: "1" });
    await get("/play?x=1&_rsc=def", { rsc: "1" }); // same page again: deduped
    await get("/prefetched?_rsc=g", { rsc: "1", "next-router-prefetch": "1" });
    await get("/data", {});
    await get("/rounds?_rsc=h", { rsc: "1" });
    const pages = JSON.parse((await s.call("localhost:3005", "/__sim/status")).body).pages;
    assert.deepEqual(pages.cam, { path: "/rounds", history: ["/play?x=1", "/rounds"] });
  } finally { await s.close(); }
});

test("HTML pages for a person host get the driver script tag; JSON and /_next files don't", async () => {
  const s = await setup();
  try {
    const page = await s.call("cam.localhost:3005", "/page", "GET", undefined, DOC);
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('<script src="/__sim/driver.js" defer></script></head>'), page.body);
    assert.ok(page.body.includes("hello") && page.body.includes("</html>"));
    assert.equal(page.headers["content-length"], String(Buffer.byteLength(page.body)));
    const fetched = await s.call("cam.localhost:3005", "/page");
    assert.ok(!fetched.body.includes("driver.js"), "a plain fetch (not a document load) is not injected");
    const json = await s.call("cam.localhost:3005", "/data", "GET", undefined, DOC);
    assert.equal(json.body, '{"a":1}');
    const next = await s.call("cam.localhost:3005", "/_next/static/x");
    assert.ok(!next.body.includes("driver.js"));
    const plain = await s.call("localhost:3005", "/page", "GET", undefined, DOC);
    assert.ok(!plain.body.includes("driver.js"));
  } finally { await s.close(); }
});

test("/__sim/driver.js is served as JavaScript", async () => {
  const s = await setup();
  try {
    const r = await s.call("cam.localhost:3005", "/__sim/driver.js");
    assert.equal(r.status, 200);
    assert.match(String(r.headers["content-type"]), /javascript/);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.ok(r.body.includes("ready") && r.body.length > 500);
  } finally { await s.close(); }
});

const FOURBALL = { kind: "play", players: [{ key: "cam", name: "Cam" }, { key: "cade", name: "Cade" }], host: "cam", course: "sim:stevens-park", tee: "Blue", game: "none", guest: null, seed: 1 };

test("POST /__sim/custom rejects an invalid setup with its message", async () => {
  const s = await setup();
  try {
    const bad = await s.call("localhost:3005", "/__sim/custom", "POST", JSON.stringify({ setup: { ...FOURBALL, host: "nobody" } }));
    assert.equal(bad.status, 400);
    assert.equal(JSON.parse(bad.body).error, "The host must be one of the players.");
    const none = await s.call("localhost:3005", "/__sim/custom", "POST", "{}");
    assert.equal(none.status, 400);
    assert.ok(JSON.parse(none.body).error);
    const foreign = await s.call("localhost:3005", "/__sim/custom", "POST", JSON.stringify({ setup: FOURBALL }), { origin: "http://evil.example" });
    assert.equal(foreign.status, 403);
    assert.equal(JSON.parse((await s.call("localhost:3005", "/__sim/status")).body).setup, null);
  } finally { await s.close(); }
});

test("custom then reset returns to no round", async () => {
  const s = await setup();
  try {
    const res = await s.call("localhost:3005", "/__sim/custom", "POST", JSON.stringify({ setup: FOURBALL }), { origin: "http://localhost:3001" });
    assert.equal(res.status, 200);
    const status = JSON.parse(res.body);
    assert.equal(status.scenario, "custom");
    assert.deepEqual(status.setup, FOURBALL);
    assert.deepEqual(status.roles, { cam: "Host", cade: "Player" });
    assert.deepEqual(status.phones.map((p: any) => [p.person, p.startPath]), [["cam", "/"], ["cade", "/"]]);
    const rows = async () => Number(((await s.fake.current.db.query("select count(*) n from shared_rounds")).rows[0] as { n: string }).n);
    const checks = async () => JSON.parse((await s.call("localhost:3005", "/__sim/checks")).body) as { id: string; status: string; detail: string }[];
    assert.equal(await rows(), 0);
    assert.ok((await checks()).every((c) => c.status === "waiting" && c.detail === "No round yet"));
    // The host's phone starts a round through the real app; here the same database call stands in for it.
    const cam = (await s.fake.current.db.query("select id from profiles where username = 'cam'")).rows[0] as { id: string };
    await s.fake.current.db.query("select create_shared_round($1, $2::jsonb, '{}'::uuid[])", [cam.id, JSON.stringify({ course: { ref: "sim:stevens-park", name: "S", place: "D", par: [], strokeIndex: null, tees: [] }, tee: { name: "Blue", rating: 70.4, slope: 124 }, holes: "18", stats: false, countForHandicap: true, datePlayed: "2026-11-24", players: [], guests: [], game: null })]);
    assert.equal(await rows(), 1);
    assert.equal((await checks()).find((c) => c.id === "linked")!.status, "pass");
    await s.call("localhost:3005", "/__sim/reset", "POST");
    assert.equal(await rows(), 0);
    assert.ok((await checks()).every((c) => c.detail === "No round yet"));
    // The accounts are still there after the reset.
    assert.equal(JSON.parse((await s.call("localhost:3005", "/__sim/status")).body).people.length, 2);
  } finally { await s.close(); }
});
