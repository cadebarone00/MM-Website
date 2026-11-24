import assert from "node:assert/strict";
import { test } from "node:test";
import { SAMPLE_COURSES } from "./courses";
import { PRESETS, keyFor, strokesFor, validateSetup, type StudioSetup } from "./setup";
import { seededRandom } from "./random";

const base = (): StudioSetup => structuredClone(PRESETS.find((p) => p.id === "play-friends")!.setup);
const course = (ref: string) => SAMPLE_COURSES.find((c) => c.ref === ref)!;

test("seededRandom is deterministic and in [0,1)", () => {
  const a = seededRandom(5), b = seededRandom(5);
  for (let i = 0; i < 50; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
});

test("sample courses include Stevens Park and an unrated one", () => {
  const sp = course("sim:stevens-park");
  assert.equal(sp.name, "Stevens Park Golf Course");
  assert.deepEqual(sp.par, [4,4,3,5,4,4,3,5,4,4,4,3,5,4,4,3,5,4]);
  assert.deepEqual(sp.tees.find((t) => t.name === "Blue"), { name: "Blue", rating: 70.4, slope: 124 });
  assert.ok(SAMPLE_COURSES.length >= 3);
  assert.ok(SAMPLE_COURSES.every((c) => c.par.length === 18));
  assert.ok(SAMPLE_COURSES.some((c) => c.tees.length === 1 && c.tees[0].rating === null && c.tees[0].slope === null));
});

test("presets are valid", () => {
  assert.deepEqual(PRESETS.map((p) => p.id), ["play-solo", "play-friends", "play-unrated", "play-fourball"]);
  for (const p of PRESETS) assert.equal(validateSetup(p.setup), null, p.id);
  const f = PRESETS[1].setup;
  assert.equal(f.host, "cam"); assert.equal(f.guest, "Uncle Rob"); assert.equal(f.game, "skins");
});

test("validate catches each problem", () => {
  const bad = (m: (s: StudioSetup) => void) => { const s = base(); m(s); return validateSetup(s); };
  assert.equal(typeof bad((s) => { s.players = []; }), "string");
  assert.equal(typeof bad((s) => { s.players = ["a", "b", "c", "d", "e"].map((k) => ({ key: k, name: k })); s.host = "a"; }), "string");
  assert.equal(typeof bad((s) => { s.players[1].name = s.players[0].name; }), "string");
  assert.equal(typeof bad((s) => { s.players[1].key = s.players[0].key; }), "string");
  assert.equal(typeof bad((s) => { s.host = "nobody"; }), "string");
  assert.equal(typeof bad((s) => { s.course = "sim:nope"; }), "string");
  assert.equal(typeof bad((s) => { s.tee = "Nope"; }), "string");
  assert.equal(typeof bad((s) => { s.players[1].key = "Bad Key"; s.players[1].name = "Cade"; }), "string");
  assert.equal(typeof bad((s) => { s.players[1].key = "a".repeat(25); }), "string");
  assert.equal(typeof bad((s) => { s.players[1].key = "www"; }), "string");
  assert.equal(typeof bad((s) => { s.players[1].name = "   "; }), "string");
  assert.equal(typeof bad((s) => { s.players[1].name = "x".repeat(41); }), "string");
  assert.equal(typeof bad((s) => { s.seed = 1.5; }), "string");
  assert.equal(typeof bad((s) => { s.seed = NaN; }), "string");
});

test("keyFor makes unique slugs", () => {
  assert.equal(keyFor("Uncle Rob", []), "unclerob");
  assert.equal(keyFor("Uncle Rob", ["unclerob"]), "unclerob2");
  assert.equal(keyFor("Uncle Rob", ["unclerob", "unclerob2"]), "unclerob3");
});

test("keyFor caps the slug at 20 chars", () => {
  assert.equal(keyFor("a".repeat(30), []).length, 20);
  assert.equal(keyFor("a".repeat(30), ["a".repeat(20)]), "a".repeat(20) + "2");
});

test("same seed same strokes, different seed different", () => {
  const s = base(), c = course(s.course);
  assert.deepEqual(strokesFor(s, c), strokesFor({ ...s }, c));
  assert.notDeepEqual(strokesFor(s, c), strokesFor({ ...s, seed: s.seed + 1 }, c));
});

test("strokes are par-based and >= 1", () => {
  const s = base(), c = course(s.course);
  const out = strokesFor(s, c);
  assert.deepEqual(Object.keys(out).sort(), [...s.players.map((p) => p.key), "guest"].sort());
  for (const arr of Object.values(out)) {
    assert.equal(arr.length, 18);
    arr.forEach((n, i) => { assert.ok(n >= 1); assert.ok(n - c.par[i] >= -1 && n - c.par[i] <= 2); });
  }
  assert.equal("guest" in strokesFor({ ...s, guest: null }, c), false);
});

test("rejects a player key that is not lowercase letters or numbers", () => {
  const s = base(); s.players[1].key = "bad-key";
  assert.notEqual(validateSetup(s), null);
});

test("rejects a reserved player key", () => {
  const s = base(); s.players[1].key = "localhost";
  assert.notEqual(validateSetup(s), null);
});

test("rejects an empty player name after trimming", () => {
  const s = base(); s.players[1].name = "   ";
  assert.notEqual(validateSetup(s), null);
});

test("rejects a player name longer than 40 characters", () => {
  const s = base(); s.players[1].name = "x".repeat(41);
  assert.notEqual(validateSetup(s), null);
});
