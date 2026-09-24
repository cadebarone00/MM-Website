import test from "node:test";
import assert from "node:assert/strict";
import { calculateSkins, type SkinsRound } from "./calculate";

const card = (player: string, score: number, overrides: Partial<SkinsRound> = {}): SkinsRound => ({
  player, round: 7, course: "Mission Hills Pete Dye", format: "Singles",
  holes: [{ hole: 3, score }], ...overrides,
});

test("Cam's sole birdie beats the whole field; ties earn nothing and do not carry over", () => {
  assert.deepEqual(calculateSkins([card("cam", 3), card("cade", 4), card("joe", 5)]), { cam: 1, cade: 0, joe: 0 });
  assert.deepEqual(calculateSkins([card("cam", 3), card("cade", 3), card("joe", 5)]), { cam: 0, cade: 0, joe: 0 });
  assert.deepEqual(calculateSkins([
    card("cam", 3, { holes: [{ hole: 3, score: 3 }, { hole: 4, score: 4 }] }),
    card("cade", 3, { holes: [{ hole: 3, score: 3 }, { hole: 4, score: 5 }] }),
  ]), { cam: 1, cade: 0 });
});

test("sessions and courses are separate; individual fourball scores count", () => {
  assert.deepEqual(calculateSkins([
    card("cam", 3), card("cade", 4),
    card("cam", 5, { round: 8, format: "Fourball" }), card("cade", 4, { round: 8, format: "Fourball" }),
    card("joe", 2, { course: "Other course" }),
  ]), { cam: 1, cade: 1, joe: 0 });
});

test("missing or invalid scores and duplicate cards cannot create a winner", () => {
  for (const holes of [[], [{ hole: 3, score: 0 }], [{ hole: 3, score: NaN }], [{ hole: 3, score: 4.5 }], [{ hole: 3, score: 4 }, { hole: 3, score: 5 }]]) {
    assert.equal(calculateSkins([card("cam", 3), card("cade", 4, { holes })]).cam, 0);
  }
  assert.equal(calculateSkins([card("cam", 3), card("cade", 4), card("cade", 5)]).cam, 0);
  assert.equal(calculateSkins([card("cam", 3)]).cam, 0);
});

test("shared-ball scores never earn individual skins", () => {
  assert.deepEqual(calculateSkins([card("cam", 3, { format: "Alternate Shot" }), card("cade", 4, { format: "Alternate Shot" })]), { cam: 0, cade: 0 });
});
