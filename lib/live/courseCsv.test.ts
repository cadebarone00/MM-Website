import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCourseCsv } from "./courseCsv";

test("CSV preserves IDs and omitted values while unlocking affected tees", () => {
  const existing = mergeCourseCsv("tee_name,hole,par,yardage,rating,slope\nBlue,1,4,400,72,130", []);
  existing[0].locked = true;
  const next = mergeCourseCsv("tee_name,hole,yardage\nblue,1,420\nWhite,2,300", existing);
  assert.equal(next[0].id, existing[0].id);
  assert.equal(next[0].holes[0].yards, 420);
  assert.equal(next[0].holes[0].par, 4);
  assert.equal(next[0].rating, 72);
  assert.equal(next[0].locked, false);
  assert.equal(existing[0].holes[0].yards, 400);
  assert.equal(next[1].holes[0].yards, 0);
  assert.equal(next[1].rating, null);
});
test("CSV rejects duplicate holes and conflicting ratings", () => {
  assert.throws(() => mergeCourseCsv("tee_name,hole\nBlue,1\nBlue,1", []), /Duplicate/);
  assert.throws(() => mergeCourseCsv("tee_name,hole,rating\nBlue,1,72\nBlue,2,73", []), /Conflicting/);
  assert.throws(() => mergeCourseCsv("tee_name,hole,par\nBlue,19,4", []), /1 to 18/);
});
test("CSV handles quoted names and preserves omitted tees", () => {
  const existing = mergeCourseCsv('tee_name,hole\n"Blue, tournament",1\nWhite,1', []);
  const next = mergeCourseCsv('tee_name,hole,yardage\n"Blue, tournament",2,350', existing);
  assert.equal(next.length, 2);
  assert.deepEqual(next[1], existing[1]);
});
