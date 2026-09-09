import { test } from "node:test";
import assert from "node:assert/strict";
import { availableTeeSets, validTeeSets } from "./teeSets.ts";
import type { LiveTeeSet } from "./types";

const tee: LiveTeeSet = { id: "blue", name: "Blue", color: "#0000ff", locked: true, rating: 72, slope: 113, holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, yards: 400 })) };
test("only explicitly locked, complete tees can be selected", () => {
  assert.deepEqual(availableTeeSets([tee, { ...tee, id: "draft", locked: false }, { ...tee, id: "legacy", locked: undefined }]), [tee]);
  assert.deepEqual(availableTeeSets([{ ...tee, rating: null }]), []);
});
test("drafts can save missing ratings; locking requires complete data", () => {
  assert.ok(validTeeSets([{ ...tee, locked: false, rating: null, slope: null }]));
  assert.equal(validTeeSets([{ ...tee, rating: null }]), false);
  assert.equal(validTeeSets([{ ...tee, holes: tee.holes.map((hole) => ({ ...hole, yards: 0 })) }]), false);
});
test("reject duplicate IDs, holes, invalid colors and slope", () => {
  assert.equal(validTeeSets([tee, tee]), false);
  assert.equal(validTeeSets([{ ...tee, holes: tee.holes.map((hole) => ({ ...hole, number: 1 })) }]), false);
  assert.equal(validTeeSets([{ ...tee, color: "red" }]), false);
  assert.equal(validTeeSets([{ ...tee, slope: 200 }]), false);
});
