import { test } from "node:test";
import assert from "node:assert/strict";
import { customRef, isCustomRef, libraryIdFromRef, libraryRef, mergeCourseHits } from "./courseRefs.ts";

const ID = "0da2e8cb-0ccf-43d8-96eb-5eae698e1234";
const hit = (ref: string, name = ref) => ({ ref, name, city: null, state: null, par: null });

test("library refs round-trip; anything else isn't a library id", () => {
  assert.equal(libraryIdFromRef(libraryRef(ID)), ID);
  assert.equal(libraryIdFromRef(ID), null, "a bare OpenGolf id");
  assert.equal(libraryIdFromRef("maroon:not-a-uuid"), null);
  assert.equal(libraryIdFromRef("custom:eagle-pointe"), null);
});

test("hand-added courses: the same name always gets the same ref", () => {
  assert.equal(customRef("  Eagle Pointe Golf Club "), "custom:eagle-pointe-golf-club");
  assert.equal(customRef("Eagle Pointe GOLF club!"), customRef("eagle pointe golf club"));
  assert.equal(customRef("!!!"), "custom:course");
  assert.ok(isCustomRef(customRef("x")) && !isCustomRef(libraryRef(ID)));
});

test("library results come first and an OpenGolf result the library has isn't repeated", () => {
  const merged = mergeCourseHits([hit("og-1", "Pinehurst No. 2 (library)"), hit(libraryRef(ID))], [hit("og-1"), hit("og-2"), hit("og-3")], 4);
  assert.deepEqual(merged.map((h) => h.ref), ["og-1", libraryRef(ID), "og-2", "og-3"]);
  assert.equal(merged[0].name, "Pinehurst No. 2 (library)");
  assert.equal(mergeCourseHits([], [hit("a"), hit("b")], 1).length, 1);
});
