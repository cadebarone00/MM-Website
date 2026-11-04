import { test } from "node:test";
import assert from "node:assert/strict";
import { QUICK_SWIPES, TIPS_SEEN_KEY, TOUR_SEEN_KEY, TOUR_SLIDES, clearSeen, hasSeen, markSeen } from "./tripTour.ts";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}
const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };

test("seen is per account on this device", () => {
  const storage = memoryStorage();
  assert.equal(hasSeen(TOUR_SEEN_KEY, "cade", storage), false);
  markSeen(TOUR_SEEN_KEY, "cade", storage);
  assert.equal(hasSeen(TOUR_SEEN_KEY, "cade", storage), true);
  assert.equal(hasSeen(TOUR_SEEN_KEY, "john", storage), false);
  assert.equal(hasSeen(TIPS_SEEN_KEY, "cade", storage), false, "tour and tips are separate");
  clearSeen(TOUR_SEEN_KEY, "cade", storage);
  assert.equal(hasSeen(TOUR_SEEN_KEY, "cade", storage), false);
});

test("blocked storage never throws and doesn't loop the tour in this session", () => {
  assert.equal(hasSeen(TIPS_SEEN_KEY, "blocked-user", broken), false);
  markSeen(TIPS_SEEN_KEY, "blocked-user", broken);
  assert.equal(hasSeen(TIPS_SEEN_KEY, "blocked-user", broken), true);
  clearSeen(TIPS_SEEN_KEY, "blocked-user", broken);
  assert.equal(hasSeen(TIPS_SEEN_KEY, "blocked-user", broken), false);
});

test("garbage in storage reads as not seen", () => {
  const storage = memoryStorage();
  storage.setItem(TOUR_SEEN_KEY, "{not json");
  assert.equal(hasSeen(TOUR_SEEN_KEY, "cade", storage), false);
  markSeen(TOUR_SEEN_KEY, "cade", storage);
  assert.equal(hasSeen(TOUR_SEEN_KEY, "cade", storage), true);
});

test("3 quick swipes and a 5–7 slide tour that explains side games", () => {
  assert.equal(QUICK_SWIPES.length, 3);
  assert.ok(TOUR_SLIDES.length >= 5 && TOUR_SLIDES.length <= 7);
  assert.ok(TOUR_SLIDES.some(slide => /skins/i.test(slide.body)), "side games are explained in the tour");
  for (const slide of [...QUICK_SWIPES, ...TOUR_SLIDES]) assert.ok(slide.title && slide.body);
});
