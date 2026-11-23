import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { startFakeSupabase } from "../fake-supabase.mjs";
import { SIM_MIGRATIONS } from "../../lib/dev/sim/migrations";
import { startFrontDoor } from "./frontDoor";

async function setup() {
  const upstream = http.createServer((req, res) => {
    if (req.url?.startsWith("/redir")) {
      res.writeHead(307, { Location: `http://localhost:${(upstream.address() as AddressInfo).port}/landed` });
      res.end();
      return;
    }
    res.setHeader("x-seen-cookie", req.headers.cookie ?? "");
    res.statusCode = req.url?.startsWith("/api/y") ? 500 : 200;
    res.end("hi");
  });
  await new Promise<void>((r) => upstream.listen(0, r));
  const fake = { current: await startFakeSupabase({ port: 0, migrations: SIM_MIGRATIONS }) };
  const door = await startFrontDoor({ port: 0, appPort: (upstream.address() as AddressInfo).port, fake });
  const base = `http://localhost:${door.port}`;
  // Host header decides the person; fetch can't set Host, so use http.request.
  const call = (host: string, path: string, method = "GET", body?: string) =>
    new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: door.port, path, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}) } }, (res) => {
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
