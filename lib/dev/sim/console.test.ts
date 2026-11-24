import { test } from "node:test";
import assert from "node:assert/strict";
import { SIM_ORIGIN, consoleState, phoneHost, phoneUrl } from "./console";

test("phoneUrl logs the phone in as its person, then goes to the path", () => {
  assert.equal(SIM_ORIGIN, "http://localhost:3005");
  assert.equal(phoneUrl("cam", "/rounds/new?round=1"), "http://cam.localhost:3005/__sim/login?as=cam&next=%2Frounds%2Fnew%3Fround%3D1");
});

test("consoleState: a failed status means the simulator is not running", () => {
  assert.equal(consoleState("error"), "not-running");
  assert.equal(consoleState({ ok: false }), "not-running");
  assert.equal(consoleState({ ok: true }), "running");
});

test("phoneHost is the phone's own host on the simulator port", () => assert.equal(phoneHost("jake"), "http://jake.localhost:3005"));

import { guardedPoll } from "./console";

test("guardedPoll: a poll started after a generation bump is applied, one started before is dropped", async () => {
  const generation = { current: 0 };
  const seen: string[] = [];
  let release!: (v: string) => void;
  const slow = new Promise<string>((r) => { release = r; });
  const before = guardedPoll(generation, () => true, () => slow, (v) => seen.push(v));
  generation.current += 1; // a scenario was picked while the first poll was out
  release("old");
  assert.equal(await before, false);
  assert.equal(await guardedPoll(generation, () => true, async () => "new", (v) => seen.push(v)), true);
  assert.equal(await guardedPoll(generation, () => false, async () => "dead", (v) => seen.push(v)), false);
  assert.deepEqual(seen, ["new"]);
});

import { iframeTransport, consoleReducer, type FrameLike } from "./console";

function fakeFrame() {
  const sent: any[] = [];
  const loads = new Set<() => void>();
  const win = { postMessage: (m: unknown) => { sent.push(m); } };
  const frame: FrameLike = { contentWindow: win, addEventListener: (_t, fn) => { loads.add(fn); }, removeEventListener: (_t, fn) => { loads.delete(fn); } };
  return { frame, win, sent, load: () => [...loads].forEach((f) => f()) };
}
const ORIGIN = "http://cam.localhost:3005";
const tap = { kind: "tap", target: { text: "Next" } } as const;

test("iframeTransport resolves done for the matching id only", async () => {
  const f = fakeFrame();
  const t = iframeTransport(() => f.frame, SIM_ORIGIN);
  const first = t.act("cam", tap);
  const second = t.act("cam", tap);
  const [m1, m2] = f.sent;
  let got: unknown = "none";
  void second.then((r) => { got = r; });
  t.onMessage({ source: f.win, origin: ORIGIN, data: { sim: "done", id: "nope", result: { ok: true } } });
  await Promise.resolve();
  assert.equal(got, "none"); // unknown id ignored
  t.onMessage({ source: {}, origin: ORIGIN, data: { sim: "done", id: m2.id, result: { ok: true } } });
  await Promise.resolve();
  assert.equal(got, "none"); // wrong frame ignored
  t.onMessage({ source: f.win, origin: ORIGIN, data: { sim: "done", id: m2.id, result: { ok: true } } });
  assert.deepEqual(await second, { ok: true });
  t.onMessage({ source: f.win, origin: ORIGIN, data: { sim: "done", id: m1.id, result: { ok: false, reason: "not-found", message: "x", seen: "" } } });
  assert.equal(((await first) as { ok: boolean }).ok, false);
  t.onMessage({ source: f.win, origin: "http://evil.example", data: { sim: "done", id: m1.id, result: { ok: true } } }); // no throw
});

test("a ready during an action resolves reloaded; the ready is kept for ready(), earlier ones dropped", async () => {
  const f = fakeFrame();
  const t = iframeTransport(() => f.frame, SIM_ORIGIN);
  const ready = (path = "/") => t.onMessage({ source: f.win, origin: ORIGIN, data: { sim: "ready", path } });
  const p = t.act("cam", tap);
  ready(); // a client-side pushState announcement: same document, not a reload
  let settled = false; void p.then(() => { settled = true; });
  await Promise.resolve(); assert.equal(settled, false);
  f.load(); // a real page load
  assert.deepEqual(await p, { reloaded: true });
  ready("/next"); // arrives before ready() is called
  assert.equal(await t.ready("cam", 50), true);
  assert.equal(await t.ready("cam", 20), false); // taken; not kept twice
  ready(); // stray ready with nothing awaited
  assert.equal(await t.ready("cam", 20), false);
  // go: answers at once, then waits for the next ready
  assert.deepEqual(await t.act("cam", { kind: "go", path: "/x" }), { ok: true });
  const waiting = t.ready("cam", 500);
  ready("/old"); // the OLD document's pushState announcement, before the new document loads: must not count
  f.load();
  ready("/x");
  assert.equal(await waiting, true);
});

test("go: a stale ready from the old document before the load never satisfies ready()", async () => {
  const f = fakeFrame();
  const t = iframeTransport(() => f.frame, SIM_ORIGIN);
  const ready = () => t.onMessage({ source: f.win, origin: ORIGIN, data: { sim: "ready", path: "/" } });
  await t.act("cam", { kind: "go", path: "/x" });
  ready(); // old document, pushState
  assert.equal(await t.ready("cam", 30), false);
  f.load(); ready();
  assert.equal(await t.ready("cam", 50), true);
});

test("status error discards the runner and the steps", () => {
  type S = { ok: boolean };
  const created = consoleReducer<S, string>({ status: null, steps: [], runner: null }, { type: "created", status: { ok: true }, steps: [1, 2], runner: "r" });
  assert.equal(created.runner, "r");
  const same = consoleReducer(created, { type: "status", status: { ok: true } });
  assert.equal(same.runner, "r");
  const gone = consoleReducer(created, { type: "status", status: "error" });
  assert.deepEqual(gone, { status: "error", steps: [], runner: null });
  assert.equal(consoleReducer(created, { type: "status", status: { ok: false } }).runner, null);
});

import { replayWhenCurrent } from "./console";

test("replayWhenCurrent: a replay is dropped when a newer Create / Reset bumped the epoch while it waited", async () => {
  const epoch = { current: 5 };
  const ran: string[] = [];
  const stale = replayWhenCurrent(epoch, 5, async () => { epoch.current += 1; return true; }, async () => { ran.push("stale"); });
  assert.equal(await stale, false);
  assert.equal(await replayWhenCurrent(epoch, epoch.current, async () => false, async () => { ran.push("never"); }), false);
  assert.equal(await replayWhenCurrent(epoch, epoch.current, async () => true, async () => { ran.push("ok"); }), true);
  assert.deepEqual(ran, ["ok"]);
});

test("a reload of the same iframe element (src re-set) fires load on the tracked element and resolves reloaded", async () => {
  const f = fakeFrame();
  const t = iframeTransport(() => f.frame, SIM_ORIGIN);
  const p = t.act("cam", tap);
  f.load(); // what el.src = ... does on the same element
  assert.deepEqual(await p, { reloaded: true });
  t.onMessage({ source: f.win, origin: ORIGIN, data: { sim: "ready", path: "/" } });
  assert.equal(await t.ready("cam", 50), true);
  f.load(); // a later load with no action out must not matter
  assert.equal(await t.ready("cam", 20), false);
});

test("a restarted simulator that is already back still discards the runner", () => {
  const m = { status: { ok: true }, steps: [1], runner: "r" };
  assert.deepEqual(consoleReducer<{ ok: boolean }, string>(m, { type: "restarted", status: { ok: true } }), { status: { ok: true }, steps: [], runner: null });
});
