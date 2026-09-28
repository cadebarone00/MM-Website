import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyWebsiteSettings, parseYearChange, resolveDisplayYear, sectionForPath } from "./settings.ts";

test("display years override calendar independently, including historical and future years", () => {
  const settings = emptyWebsiteSettings();
  settings.leaderboard = 2026;
  settings.portal = 2028;
  const calendar = { scheduled: true, activeYear: 2027 };
  assert.equal(resolveDisplayYear(settings.leaderboard, calendar, 2026), 2026);
  assert.equal(resolveDisplayYear(settings.portal, calendar, 2026), 2028);
  assert.equal(resolveDisplayYear(settings.schedule, calendar, 2026), 2027);
  assert.equal(calendar.activeYear, 2027);
});

test("Automatic preserves legacy fallback and resumes calendar handoffs", () => {
  assert.equal(resolveDisplayYear(null, { scheduled: false, activeYear: 2027 }, 2026), 2026);
  assert.equal(resolveDisplayYear(null, { scheduled: true, activeYear: 2028 }, 2026), 2028);
});

test("write validation rejects unknown sections, coerced years and the private test season", () => {
  for (const input of [null, {}, [], { section: "__proto__", year: 2027 }, { section: "home", year: "2027" }, { section: "home", year: 2027.5 }, { section: "home", year: 2034 }, { section: "home", year: 2023 }, { section: "home" }]) {
    assert.equal(parseYearChange(input), null);
  }
  assert.deepEqual(parseYearChange({ section: "home_results", year: 2033 }), { section: "home_results", year: 2033 });
  assert.deepEqual(parseYearChange({ section: "portal", year: null }), { section: "portal", year: null });
});

test("section routing keeps player and team paths independent of leaderboard", () => {
  assert.equal(sectionForPath("/portal"), "portal");
  assert.equal(sectionForPath("/portal/player-lookup"), "portal");
  assert.equal(sectionForPath("/teams/2028-maroon-masters/cam"), "teams");
  assert.equal(sectionForPath("/leaderboard/2026-maroon-masters"), "leaderboard");
  assert.equal(sectionForPath("/schedule/2029-maroon-masters"), "schedule");
  assert.equal(sectionForPath("/api/live/standings"), "leaderboard");
  assert.equal(sectionForPath("/teamstuff"), "home");
});
