import assert from "node:assert/strict";
import { test } from "node:test";
import { createRunner, type RunnerState, type Transport } from "./runner";
import type { SimAction, SimStep } from "./script";
import type { DriverAction, DriverResult } from "../driver/types";

type Reply = DriverResult | { reloaded: true };
const OK: DriverResult = { ok: true };

/** A fake transport: records every action; `script` answers specific calls (by order), everything else is ok. */
function fakeTransport(script: (call: { phone: string; action: DriverAction; n: number }) => Reply | undefined = () => undefined) {
  const calls: { phone: string; action: DriverAction }[] = [];
  const readies: string[] = [];
  let n = 0;
  const transport: Transport = {
    async act(phone, action) { calls.push({ phone, action }); return script({ phone, action, n: n++ }) ?? OK; },
    async ready(phone) { readies.push(phone); return true; },
  };
  return { transport, calls, readies };
}

const tap = (text: string): DriverAction => ({ kind: "tap", target: { text } });
const step = (id: string, phone: string, actions: SimAction[], extra: Partial<SimStep> = {}): SimStep => ({ id, phone, say: `${phone} does ${id}`, actions, ...extra });
const three = () => [step("a", "cam", [tap("A")]), step("b", "cade", [tap("B")]), step("c", "cam", [tap("C")])];

test("next runs one step", async () => {
  const { transport, calls } = fakeTransport();
  const runner = createRunner(three(), transport, { delayMs: 0 });
  assert.equal(runner.state().status, "idle");
  await runner.next();
  assert.deepEqual(calls, [{ phone: "cam", action: tap("A") }]);
  assert.deepEqual(runner.state(), { index: 1, status: "idle", message: null, done: ["a"] });
});

test("playAll runs to done", async () => {
  const { transport, calls } = fakeTransport();
  const runner = createRunner(three(), transport, { delayMs: 0 });
  const seen: RunnerState["status"][] = [];
  const stop = runner.subscribe((s) => seen.push(s.status));
  await runner.playAll();
  stop();
  assert.equal(calls.length, 3);
  assert.deepEqual(runner.state(), { index: 3, status: "done", message: null, done: ["a", "b", "c"] });
  assert.ok(seen.includes("running"));
  assert.equal(seen.at(-1), "done");
});

test("pause stops between steps", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const calls: string[] = [];
  const transport: Transport = {
    async act(_phone, action) { calls.push(action.kind === "tap" ? action.target.text! : action.kind); if (calls.length === 1) await gate; return OK; },
    async ready() { return true; },
  };
  const runner = createRunner(three(), transport, { delayMs: 0 });
  const playing = runner.playAll();
  await new Promise((r) => setTimeout(r, 5));
  runner.pause(); // mid step "a": "a" finishes, "b" never starts
  release();
  await playing;
  assert.deepEqual(calls, ["A"]);
  assert.deepEqual(runner.state(), { index: 1, status: "paused", message: null, done: ["a"] });
  await runner.playAll(); // carries on from where it paused
  assert.deepEqual(calls, ["A", "B", "C"]);
  assert.equal(runner.state().status, "done");
});

test("unmet expect stops with the take-over message", async () => {
  // Review Focus 1: the owner tapped Jake's phone by hand, so it isn't on the screen this step starts from.
  const expectTarget = { label: "Round invites" };
  const { transport, calls } = fakeTransport(({ action }) => action.kind === "waitFor"
    ? { ok: false, reason: "timeout", message: 'Timed out waiting for label "Round invites"', seen: "Profile" } : undefined);
  const steps = [step("accept-jake", "jake", [tap("Join")], { name: "Jake", expect: expectTarget, screen: "the Play home screen" })];
  const runner = createRunner(steps, transport, { delayMs: 0 });
  await runner.playAll();
  assert.deepEqual(runner.state(), { index: 0, status: "stopped", message: "Jake's phone isn't on the Play home screen. Tap it there or press Skip", done: [] });
  // The precondition is a 2 s waitFor, and nothing was tapped blindly.
  assert.deepEqual(calls, [{ phone: "jake", action: { kind: "waitFor", target: expectTarget, timeoutMs: 2000 } }]);
  // Without a screen description the target is described instead.
  const bare = createRunner([step("x", "rob", [tap("Join")], { name: "Rob", expect: { text: "Start round" } })], transport, { delayMs: 0 });
  await bare.next();
  assert.equal(bare.state().message, `Rob's phone isn't on "Start round". Tap it there or press Skip`);
});

test("reload retries once then fails", async () => {
  // Review Focus 2: the phone fully reloads mid-step. The runner waits for ready and retries the remaining actions once.
  const once = fakeTransport(({ n }) => n === 1 ? { reloaded: true } : undefined);
  const steps = () => [step("s", "cam", [tap("A"), tap("B"), tap("C")], { name: "Cam" })];
  const r1 = createRunner(steps(), once.transport, { delayMs: 0 });
  await r1.next();
  assert.equal(r1.state().status, "done");
  // A, B (reloaded) → ready → B again, C. A is not repeated.
  assert.deepEqual(once.calls.map((c) => c.action.kind === "tap" && c.action.target.text), ["A", "B", "B", "C"]);
  assert.deepEqual(once.readies, ["cam"]);

  const twice = fakeTransport(({ n }) => n === 1 || n === 3 ? { reloaded: true } : undefined);
  const r2 = createRunner(steps(), twice.transport, { delayMs: 0 });
  await r2.next();
  assert.equal(r2.state().status, "failed");
  assert.match(r2.state().message!, /Cam's phone reloaded again/);
  assert.equal(r2.state().index, 0);
  assert.deepEqual(twice.calls.map((c) => c.action.kind === "tap" && c.action.target.text), ["A", "B", "B", "C"]);
});

test("a driver failure stops in failed with the driver's message", async () => {
  const { transport, calls } = fakeTransport(({ n }) => n === 1
    ? { ok: false, reason: "ambiguous", message: '2 matches for "Next"', seen: "Who's playing? Next Next" } : undefined);
  const runner = createRunner(three(), transport, { delayMs: 0 });
  await runner.playAll();
  const s = runner.state();
  assert.equal(s.status, "failed");
  assert.equal(s.index, 1);
  assert.deepEqual(s.done, ["a"]);
  assert.match(s.message!, /cade's phone/);
  assert.ok(s.message!.includes('2 matches for "Next"'));
  assert.ok(s.message!.includes("Who's playing? Next Next"));
  assert.equal(calls.length, 2); // nothing after the failure
});

test("skip moves past a stopped step", async () => {
  const { transport, calls } = fakeTransport(({ action }) => action.kind === "waitFor" ? { ok: false, reason: "timeout", message: "x", seen: "" } : undefined);
  const steps = [step("a", "cam", [tap("A")], { name: "Cam", expect: { text: "Hole 1" } }), step("b", "cam", [tap("B")]), step("c", "cam", [tap("C")])];
  const runner = createRunner(steps, transport, { delayMs: 0 });
  await runner.playAll();
  assert.equal(runner.state().status, "stopped");
  runner.skip();
  assert.deepEqual(runner.state(), { index: 1, status: "idle", message: null, done: [] });
  await runner.playAll();
  assert.deepEqual(runner.state(), { index: 3, status: "done", message: null, done: ["b", "c"] });
  assert.deepEqual(calls.filter((c) => c.action.kind === "tap").map((c) => c.action.kind === "tap" && c.action.target.text), ["B", "C"]);
});

test("go resolves on the next ready; a phone that never comes back fails", async () => {
  const { transport, calls, readies } = fakeTransport();
  const steps = [step("g", "jake", [{ kind: "go", path: "/" }, tap("Join")], { name: "Jake" })];
  const runner = createRunner(steps, transport, { delayMs: 0 });
  await runner.next();
  assert.equal(runner.state().status, "done");
  assert.deepEqual(readies, ["jake"]);
  assert.equal(calls.length, 2);

  const dead: Transport = { act: async () => OK, ready: async () => false };
  const r2 = createRunner(steps, dead, { delayMs: 0 });
  await r2.next();
  assert.equal(r2.state().status, "failed");
  assert.match(r2.state().message!, /Jake's phone didn't finish loading \//);
});

test("jumpTo plays up to the index at zero delay, then waits", async () => {
  const { transport, calls } = fakeTransport();
  const runner = createRunner(three(), transport, { delayMs: 10_000 });
  const started = Date.now();
  await runner.jumpTo(2);
  assert.ok(Date.now() - started < 2000, "no delay between jumped steps");
  assert.deepEqual(runner.state(), { index: 2, status: "idle", message: null, done: ["a", "b"] });
  assert.equal(calls.length, 2);
});

test("a phone that never answers fails the step instead of wedging the runner", async () => {
  const transport: Transport = { act: () => new Promise(() => undefined), ready: async () => true };
  const steps = [step("w", "cam", [{ kind: "waitFor", target: { text: "Hole 1" }, timeoutMs: 10 }], { name: "Cam" }), step("b", "cam", [tap("B")])];
  const runner = createRunner(steps, transport, { delayMs: 0, replyMarginMs: 20 });
  await runner.playAll();
  assert.equal(runner.state().status, "failed");
  assert.equal(runner.state().message, `Cam's phone didn't answer (waitFor "Hole 1").`);
  runner.skip(); // not busy any more, so Skip works
  assert.deepEqual(runner.state(), { index: 1, status: "idle", message: null, done: [] });
});

test("after a reload the step's starting screen is checked again", async () => {
  // A (reloads) → ready → the expected screen is gone (the reload landed somewhere else) → stopped, nothing else tapped.
  let looks = 0;
  const { transport, calls } = fakeTransport(({ action, n }) => {
    if (action.kind === "waitFor") return ++looks === 1 ? OK : { ok: false, reason: "timeout", message: "x", seen: "Home" };
    return n === 1 ? { reloaded: true } : undefined;
  });
  const runner = createRunner([step("s", "cam", [tap("A"), tap("B")], { name: "Cam", expect: { text: "Start round" }, screen: "the Ready to tee off page" })], transport, { delayMs: 0 });
  await runner.next();
  assert.deepEqual(runner.state(), { index: 0, status: "stopped", message: "Cam's phone isn't on the Ready to tee off page. Tap it there or press Skip", done: [] });
  assert.deepEqual(calls.map((c) => c.action.kind === "tap" ? c.action.target.text : c.action.kind), ["waitFor", "A", "waitFor"]);
});

test("an atomic step interrupted after a tap is never resumed or re-run on its own", async () => {
  const holeStep = () => step("hole-7", "cam", [tap("+"), tap("+"), tap("Next hole")], { name: "Cam", say: "Hole 7: Cam 6", atomic: true, expect: { sim: "hole-number", text: "Hole 7" } });
  // Reload on the second tap (call 0 is the expect check).
  const reload = fakeTransport(({ n }) => n === 2 ? { reloaded: true } : undefined);
  const r1 = createRunner([holeStep(), step("after", "cam", [tap("X")])], reload.transport, { delayMs: 0 });
  await r1.playAll();
  assert.deepEqual(r1.state(), { index: 0, status: "stopped", done: [],
    message: `Cam's phone reloaded during "Hole 7: Cam 6". Check the hole on the phone, fix it by hand, then press Skip` });
  const sent = reload.calls.length;
  await r1.playAll(); await r1.next();
  assert.equal(reload.calls.length, sent, "no taps sent again");
  assert.equal(r1.state().status, "stopped");
  r1.skip();
  await r1.playAll();
  assert.deepEqual(r1.state().done, ["after"]);

  // A driver failure after a tap went in: failed, and blocked the same way.
  const fail = fakeTransport(({ n }) => n === 2 ? { ok: false, reason: "not-found", message: 'Nothing matches "+"', seen: "Card" } : undefined);
  const r2 = createRunner([holeStep()], fail.transport, { delayMs: 0 });
  await r2.next();
  assert.equal(r2.state().status, "failed");
  assert.match(r2.state().message!, /Nothing matches "\+".*fix it by hand, then press Skip/);
  const sent2 = fail.calls.length;
  await r2.next();
  assert.equal(fail.calls.length, sent2);

  // Nothing went in yet (the first tap was refused): a re-run is allowed.
  let refused = false;
  const early = fakeTransport(({ n }) => n === 1 && !refused ? (refused = true, { ok: false, reason: "not-found", message: "covered", seen: "" }) : undefined);
  const r3 = createRunner([holeStep()], early.transport, { delayMs: 0 });
  await r3.next();
  assert.equal(r3.state().status, "failed");
  await r3.next();
  assert.equal(r3.state().status, "done");
});

test("ready after go: an early or extra ready is ignored, one between act and ready() counts", async () => {
  // A transport that follows the contract: readies are numbered; ready() takes the first one after the go was sent.
  let seq = 0, mark = Infinity;
  const arrived: number[] = [];
  let wake: (() => void) | null = null;
  const announce = () => { arrived.push(++seq); wake?.(); };
  const order: string[] = [];
  const transport: Transport = {
    async act(_p, action) {
      order.push(action.kind === "go" ? `go ${action.path}` : action.kind === "tap" ? `tap ${action.target.text}` : action.kind);
      if (action.kind === "go") {
        mark = seq;
        if (action.path === "/fast") announce(); // arrives before the runner calls ready()
        else setTimeout(() => { order.push("ready"); announce(); }, 20);
      }
      return OK;
    },
    ready: (_p, ms) => new Promise((resolve) => {
      const check = () => { if (arrived.some((n) => n > mark)) { mark = Infinity; wake = null; resolve(true); } };
      wake = check;
      check();
      setTimeout(() => resolve(false), ms);
    }),
  };
  announce(); announce(); // stale readies from the page's first load
  const steps = [step("g", "jake", [{ kind: "go", path: "/" }, tap("Join")]), step("f", "jake", [{ kind: "go", path: "/fast" }, tap("Join")])];
  const runner = createRunner(steps, transport, { delayMs: 0 });
  await runner.next();
  assert.deepEqual(order, ["go /", "ready", "tap Join"], "waited for the ready after the go, not a stale one");
  announce(); // an extra ready between steps changes nothing
  await runner.next();
  assert.equal(runner.state().status, "done");
  assert.deepEqual(order.slice(3), ["go /fast", "tap Join"]);
});

test("an ambiguous starting screen passes the driver's words through", async () => {
  const { transport } = fakeTransport(({ action }) => action.kind === "waitFor" ? { ok: false, reason: "ambiguous", message: '2 matches for "Join"', seen: "Join Join" } : undefined);
  const runner = createRunner([step("a", "jake", [tap("Join")], { name: "Jake", expect: { text: "Join" } })], transport, { delayMs: 0 });
  await runner.next();
  assert.equal(runner.state().status, "failed");
  assert.equal(runner.state().message, `Jake's phone: 2 matches for "Join". The screen showed: "Join Join"`);
});

test("a throwing listener can't leave the runner running", async () => {
  const { transport } = fakeTransport();
  const runner = createRunner(three(), transport, { delayMs: 0 });
  runner.subscribe(() => { throw new Error("boom"); });
  await runner.playAll();
  assert.equal(runner.state().status, "done");
});

test("tapIf taps only what's on screen", async () => {
  let on = false;
  const { transport, calls } = fakeTransport(({ action }) => action.kind === "waitFor" && action.target.sim === "track-stats-on" && !on
    ? { ok: false, reason: "timeout", message: "x", seen: "" } : undefined);
  const s1 = [step("off", "cam", [{ kind: "tapIf", target: { sim: "track-stats-on" } }, tap("Next")])];
  await createRunner(s1, transport, { delayMs: 0 }).next();
  assert.deepEqual(calls.map((c) => c.action.kind), ["waitFor", "tap"]); // only Next
  calls.length = 0; on = true;
  await createRunner(s1, transport, { delayMs: 0 }).next();
  assert.deepEqual(calls.map((c) => c.action.kind === "tap" ? c.action.target.sim ?? c.action.target.text : c.action.kind), ["waitFor", "track-stats-on", "Next"]);
});
