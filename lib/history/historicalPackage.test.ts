import { test } from "node:test";
import assert from "node:assert/strict";
import { validateHistoricalPackage, type HistoricalPackage } from "./historicalPackage";
import { samplePackage } from "./historicalPackageFixture";
import { planHistoricalImport } from "./historicalImportPlan";
import { exportMaroonHistory } from "./maroonHistoryExport";

const edit = (change: (p: HistoricalPackage) => void) => { const p = samplePackage(); change(p); return validateHistoricalPackage(p); };
const paths = (check: ReturnType<typeof validateHistoricalPackage>) => check.errors.map((e) => e.path);

test("a well-formed package passes and is summarized", () => {
  const check = validateHistoricalPackage(samplePackage());
  assert.deepEqual([check.ok, check.errors, check.warnings], [true, [], []]);
  assert.deepEqual(check.summary, { editions: 1, participants: 2, courses: 1, rounds: 1, scores: 2, holeScores: 18, matches: 1, flags: 0 });
});

test("broken references, duplicates and bad scores are errors", () => {
  assert.ok(paths(edit((p) => { p.participants.push({ key: "p:al", name: "Al Again" }); })).includes("participants[2].key"));
  assert.ok(paths(edit((p) => { p.editions[0].roster.push({ participant: "p:zed", team: null, captain: null }); })).includes("editions[0].roster[2].participant"));
  assert.ok(paths(edit((p) => { p.editions[0].rounds[0].course = "c:nowhere"; })).includes("editions[0].rounds[0].course"));
  assert.ok(paths(edit((p) => { p.editions[0].rounds[0].scores[0].total = 81; })).includes("editions[0].rounds[0].scores[0].total"), "total ≠ holes");
  assert.ok(paths(edit((p) => { p.editions[0].rounds[0].scores[0].holes[0].strokes = 0; })).includes("editions[0].rounds[0].scores[0].holes[0].strokes"));
  assert.ok(paths(edit((p) => { p.editions[0].matches[0].sides[0].participants = ["p:bo"]; })).includes("editions[0].matches[0].sides[0].participants[0]"), "on the other team that year");
  assert.ok(paths(edit((p) => { p.editions[0].rounds[0].scoring = "team"; })).includes("editions[0].rounds[0].scores"), "a shared card has no personal scores");
  assert.ok(paths(edit((p) => { p.editions[0].results.individualChampion = "p:zed"; })).includes("editions[0].results.individualChampion"));
  assert.ok(paths(edit((p) => { (p as { version: number }).version = 2; })).includes("format"));
  assert.ok(paths(edit((p) => { p.dataset.key = "Has Spaces"; })).includes("dataset.key"));
});

test("packages never carry emails or account ids — anywhere", () => {
  const check = edit((p) => { (p.participants[0] as unknown as Record<string, unknown>).email = "al@example.com"; (p.editions[0].roster[1] as unknown as Record<string, unknown>).profileId = "x"; });
  assert.deepEqual(paths(check).filter((path) => /email|profileId/.test(path)), ["package.participants[0].email", "package.editions[0].roster[1].profileId"]);
});

test("recorded results that don't match the matches are a warning, not a guess", () => {
  const check = edit((p) => { p.editions[0].results.teams[0].points = 2; });
  assert.equal(check.ok, true);
  assert.deepEqual(check.warnings.map((w) => w.message), ["Recorded 2 points, but the matches add up to 1."]);
});

test("the dry-run plan writes nothing and starts everyone unlinked", () => {
  const plan = planHistoricalImport(samplePackage());
  assert.deepEqual(plan.participants, [{ key: "p:al", name: "Al Moss", years: [2023], scoredRounds: 1, linked: false }, { key: "p:bo", name: "Bo Lane", years: [2023], scoredRounds: 0, linked: false }]);
  assert.equal(planHistoricalImport({ format: "nope" }).participants.length, 0, "an invalid package plans nothing");
});

test("The Maroon 2024–2026 export: valid, deterministic, everything trustworthy in it, uncertain data flagged", () => {
  const pkg = exportMaroonHistory();
  assert.deepEqual(exportMaroonHistory(), pkg, "the same archive always gives the same package");
  const check = validateHistoricalPackage(pkg);
  assert.deepEqual([check.ok, check.errors], [true, []]);
  assert.deepEqual(check.warnings, [], "every edition's recorded team points equal its matches");
  assert.deepEqual(pkg.editions.map((e) => [e.year, e.results.winnerTeam, e.matches.length]), [[2024, "white", 16], [2025, "maroon", 16], [2026, "maroon", 33]]);
  assert.deepEqual(pkg.editions.map((e) => e.results.individualChampion), ["p:cade-barone", "p:cade-barone", "p:nate-wojciechowski"]);
  assert.equal(pkg.participants.length, 13);
  assert.ok(check.summary.holeScores > 2500 && check.summary.scores > 150);
  // Teams are per year (Nate is Maroon in 2026), shared-card rounds have no personal scores, and their unknown course is flagged.
  const roster2026 = pkg.editions[2].roster.find((r) => r.participant === "p:nate-wojciechowski");
  assert.equal(roster2026?.team, "maroon");
  const altShot = pkg.editions[2].rounds.filter((r) => r.scoring === "team");
  assert.ok(altShot.length > 0 && altShot.every((r) => r.scores.length === 0 && r.course === null));
  assert.ok(pkg.flags.some((f) => /No course recorded for round 2 \(Alt Shot\)/.test(f.message)));
  assert.ok(pkg.flags.some((f) => f.level === "excluded" && /never played/.test(f.message)), "2024's unplayed match is left out, and says so");
  // None of the old account system travels with it.
  const text = JSON.stringify(pkg);
  for (const old of ["@", "MMCAD", "player_slug", "avatar", "bio"]) assert.equal(text.includes(old), false, `export contains ${old}`);
});
