import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCourseCsv } from "./courseCsv.ts";

const header = "course_name,tee_name,color,rating,slope,hole,par,yards";
const rows = (tee = "Blue") => Array.from({ length: 18 }, (_, i) => `Example,${tee},blue,72.4,130,${i + 1},4,400`);
test("imports multiple tees as drafts with sorted holes and complete metadata", () => {
  const result = parseCourseCsv([header, ...rows().reverse(), ...rows("Forward")].join("\r\n"));
  assert.equal(result.name, "Example");
  assert.equal(result.teeSets.length, 2);
  assert.equal(result.teeSets[0].holes[0].number, 1);
  assert.equal(result.teeSets[0].color, "#0000ff");
  assert.equal(result.teeSets[0].rating, 72.4);
  assert.equal(result.teeSets[0].holes.reduce((sum, hole) => sum + hole.yards, 0), 7200);
  assert.ok(result.teeSets.every((tee) => tee.locked === false));
});
test("supports BOM, quoted names, aliases, and missing optional data", () => {
  const csv = '\uFEFFCourse,Tee Set,Hole,Par,Yardage\n' + Array.from({ length: 18 }, (_, i) => `"Club, ""North""",White,${i + 1},4,300`).join("\n");
  const result = parseCourseCsv(csv);
  assert.equal(result.name, 'Club, "North"');
  assert.equal(result.teeSets[0].rating, null);
  assert.equal(result.teeSets[0].color, "#ffffff");
});
test("rejects duplicate, conflicting, and invalid supplied values", () => {
  assert.throws(() => parseCourseCsv([header, ...rows(), rows()[0]].join("\n")), /Duplicate hole/);
  assert.throws(() => parseCourseCsv([header, rows()[0].replace("72.4", "73"), ...rows().slice(1)].join("\n")), /Conflicting ratings/);
  assert.throws(() => parseCourseCsv([header, ...rows()].join("\n").replace(",130,", ",200,")), /Slope/);
  assert.throws(() => parseCourseCsv([header, ...rows()].join("\n").replace(",400", ",bad")), /Yardage/);
  assert.throws(() => parseCourseCsv([header, ...rows(), ...rows().map((row) => row.replace("Example", "Other"))].join("\n")), /one course/);
});

test("partial imports preserve supplied holes and leave missing fields for editing", () => {
  const result = parseCourseCsv("course,tee,hole,yards\nExample,Blue,2,350\n,,5,410");
  assert.equal(result.teeSets.length, 1);
  const tee = result.teeSets[0];
  assert.equal(tee.holes.length, 18);
  assert.deepEqual(tee.holes[0], { number: 1, par: 0, yards: 0 });
  assert.deepEqual(tee.holes[1], { number: 2, par: 0, yards: 350 });
  assert.equal(tee.holes[4].yards, 410);
  assert.equal(tee.locked, false);
});

test("missing names and hole numbers use filename, Standard tees, and row order", () => {
  const result = parseCourseCsv("par,yards\n4,350\n3,150", "North Course");
  assert.equal(result.name, "North Course");
  assert.equal(result.teeSets[0].name, "Standard");
  assert.equal(result.teeSets[0].holes[1].number, 2);
});

test("metadata-only files and blank trailing fields save drafts", () => {
  const result = parseCourseCsv("course,tee,rating,slope\nExample,Blue,72.4\n,White,,120");
  assert.equal(result.teeSets.length, 2);
  assert.equal(result.teeSets[0].rating, 72.4);
  assert.equal(result.teeSets[1].slope, 120);
  assert.equal(result.teeSets[0].holes[0].par, 0);
});
test("rejects broken quoting and duplicate headers", () => {
  assert.throws(() => parseCourseCsv('course_name,tee_name\n"unfinished'), /unclosed/);
  assert.throws(() => parseCourseCsv('course,course_name\na,b'), /duplicate column/);
});
