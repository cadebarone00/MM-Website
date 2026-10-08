import { test } from "node:test";
import assert from "node:assert/strict";
import { assignAttesters, groupTripPlayers, stableAttesters, swapAttester, validateAttesters } from "./roundGroups.ts";

const ids = (...names: string[]) => names.map((profileId) => ({ profileId }));
const attesterOf = (players: ReturnType<typeof assignAttesters>) => Object.fromEntries(players.map((p) => [p.profileId, p.attesterProfileId]));

test("2 players attest each other", () => assert.deepEqual(attesterOf(assignAttesters(ids("a", "b"))), { a: "b", b: "a" }));
test("3 players go in a circle: a attests b, b attests c, c attests a", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c"))), { b: "a", c: "b", a: "c" }));
test("4 players are two pairs: 1 ↔ 2, 3 ↔ 4", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d"))), { a: "b", b: "a", c: "d", d: "c" }));
test("5 players go in a circle", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d", "e"))), { a: "e", b: "a", c: "b", d: "c", e: "d" }));
test("a solo player has no attester", () => assert.deepEqual(assignAttesters(ids("a")), [{ profileId: "a", attesterProfileId: null }]));
test("a competitive group pairs each player with someone on the other side, never a teammate", () => {
  const players = [{ profileId: "l1", side: "left" as const }, { profileId: "l2", side: "left" as const }, { profileId: "r1", side: "right" as const }, { profileId: "r2", side: "right" as const }];
  assert.deepEqual(attesterOf(assignAttesters(players)), { l1: "r1", r1: "l1", l2: "r2", r2: "l2" });
});
test("players keep their order in the result", () => assert.deepEqual(assignAttesters(ids("c", "a")).map((p) => p.profileId), ["c", "a"]));
test("the same player twice is refused", () => assert.throws(() => assignAttesters(ids("a", "a")), /only be in a group once/));

test("trip players are grouped in fours, in order; a lone leftover joins the group before it", () => {
  const n = (count: number) => Array.from({ length: count }, (_, i) => `p${i + 1}`);
  assert.deepEqual(groupTripPlayers(n(4)).map((g) => g.length), [4]);
  assert.deepEqual(groupTripPlayers(n(5)).map((g) => g.length), [5]);
  assert.deepEqual(groupTripPlayers(n(6)).map((g) => g.length), [4, 2]);
  assert.deepEqual(groupTripPlayers(n(9)).map((g) => g.length), [4, 5]);
  assert.deepEqual(groupTripPlayers(n(2))[0], ["p1", "p2"]);
  assert.deepEqual(groupTripPlayers([]), []);
});

test("swapping an attester: allowed to another group member, never yourself or an outsider", () => {
  const players = assignAttesters(ids("a", "b", "c"));
  assert.equal(attesterOf(swapAttester(players, "a", "b")).a, "b");
  assert.throws(() => swapAttester(players, "a", "a"), /can't attest themselves/);
  assert.throws(() => swapAttester(players, "a", "z"), /isn't in this group/);
  assert.throws(() => swapAttester(players, "z", "a"), /isn't in this group/);
});

test("larger even groups are reciprocal pairs in playing order", () => {
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d", "e", "f"))), { a: "b", b: "a", c: "d", d: "c", e: "f", f: "e" });
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d", "e", "f", "g", "h"))), { a: "b", b: "a", c: "d", d: "c", e: "f", f: "e", g: "h", h: "g" });
});

test("larger odd groups are a circle in playing order", () =>
  assert.deepEqual(attesterOf(assignAttesters(ids("a", "b", "c", "d", "e", "f", "g"))), { a: "g", b: "a", c: "b", d: "c", e: "d", f: "e", g: "f" }));

test("every size from 2 to 12: each player attests exactly one other and is attested by exactly one, never themselves", () => {
  for (let n = 2; n <= 12; n++) {
    const players = assignAttesters(Array.from({ length: n }, (_, i) => ({ profileId: `p${i}` })));
    assert.equal(validateAttesters(players), null, `size ${n}`);
  }
});

test("the same group in the same order always gets the same assignments", () =>
  assert.deepEqual(assignAttesters(ids("a", "b", "c", "d", "e")), assignAttesters(ids("a", "b", "c", "d", "e"))));

test("invalid groups are refused: no players, or a blank profile id", () => {
  assert.throws(() => assignAttesters([]), /at least one player/);
  assert.throws(() => assignAttesters(ids("a", " ")), /profile id/);
});

test("validateAttesters names what's wrong with a broken assignment", () => {
  assert.match(validateAttesters([{ profileId: "a", attesterProfileId: "a" }, { profileId: "b", attesterProfileId: "a" }]) ?? "", /themselves/);
  assert.match(validateAttesters([{ profileId: "a", attesterProfileId: "b" }, { profileId: "b", attesterProfileId: "z" }]) ?? "", /isn't in this group/);
  assert.match(validateAttesters([{ profileId: "a", attesterProfileId: "c" }, { profileId: "b", attesterProfileId: "c" }, { profileId: "c", attesterProfileId: "a" }]) ?? "", /attests 2 players/);
  assert.equal(validateAttesters([{ profileId: "a", attesterProfileId: null }]), null);
});

test("once scoring has begun the saved assignment is kept, even if the group comes back in a new order", () => {
  const saved = assignAttesters(ids("a", "b", "c", "d"));
  const reordered = assignAttesters(ids("a", "c", "b", "d"));
  assert.deepEqual(stableAttesters(saved, reordered, true), saved);
  assert.deepEqual(stableAttesters(saved, reordered, false), reordered);
  assert.deepEqual(stableAttesters(undefined, reordered, true), reordered);
});

test("a different set of players is a new group: the saved assignment no longer applies", () => {
  const saved = assignAttesters(ids("a", "b", "c", "d"));
  const newRoster = assignAttesters(ids("a", "b", "c", "e"));
  assert.deepEqual(stableAttesters(saved, newRoster, true), newRoster);
});
