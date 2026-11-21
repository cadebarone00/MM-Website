import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clearAppData, loadAppData, preloadAppData, savedAppData } from "./appDataCache";

const calls: string[] = [];
function answer(reply: (path: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => { calls.push(String(input)); return reply(String(input)); }) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => { clearAppData(); calls.length = 0; });

test("a screen's data is saved after it loads, and fresh data replaces it", async () => {
  answer(() => json({ ok: true, data: { name: "Cam" } }));
  assert.deepEqual(await loadAppData("/api/app/profile"), { status: "ok", data: { name: "Cam" } });
  assert.deepEqual(savedAppData("/api/app/profile"), { name: "Cam" });
  answer(() => json({ ok: true, data: { name: "Cam L" } }));
  await loadAppData("/api/app/profile");
  assert.deepEqual(savedAppData("/api/app/profile"), { name: "Cam L" });
});

test("a failed load keeps the saved data and saves nothing new", async () => {
  answer(() => json({ ok: true, data: { trips: [1] } }));
  await loadAppData("/api/golf-trips");
  answer(() => json({ ok: false, error: "Nope" }, 500));
  assert.deepEqual(await loadAppData("/api/golf-trips"), { status: "error", error: "Nope", code: 500 });
  answer(() => { throw new Error("offline"); });
  assert.equal((await loadAppData("/api/golf-trips")).status, "error");
  assert.deepEqual(savedAppData("/api/golf-trips"), { trips: [1] });
  assert.equal(savedAppData("/api/never-loaded"), undefined);
});

test("signing out wipes everything, even a load that was still on its way", async () => {
  answer(() => json({ ok: true, data: 1 }));
  await loadAppData("/api/app/play");
  let finish: (r: Response) => void = () => {};
  answer(() => new Promise<Response>((resolve) => { finish = resolve; }));
  const late = loadAppData("/api/app/profile");
  clearAppData();
  finish(json({ ok: true, data: { name: "Last person" } }));
  await late;
  assert.equal(savedAppData("/api/app/play"), undefined);
  assert.equal(savedAppData("/api/app/profile"), undefined);
});

test("pre-loading loads only the screens not saved yet, and ignores failures", async () => {
  answer(() => json({ ok: true, data: "play" }));
  await loadAppData("/api/app/play");
  calls.length = 0;
  answer((path) => (path === "/api/app/profile" ? json({ ok: false }, 503) : json({ ok: true, data: path })));
  await preloadAppData(["/api/app/play", "/api/golf-trips", "/api/app/profile"]);
  assert.deepEqual(calls, ["/api/golf-trips", "/api/app/profile"]);
  assert.equal(savedAppData("/api/golf-trips"), "/api/golf-trips");
  assert.equal(savedAppData("/api/app/profile"), undefined);
});
