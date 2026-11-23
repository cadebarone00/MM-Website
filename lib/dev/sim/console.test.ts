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
