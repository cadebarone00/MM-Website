import { test } from "node:test";
import assert from "node:assert/strict";
import { areaBack, popArea, visitArea, type AreaHistory } from "./areaHistory.ts";

test("each area has its own back history", () => {
  let history: AreaHistory = {};
  for (const path of ["/", "/teams", "/portal", "/portal/career", "/portal/scoring", "/portal/scoring/play"]) history = visitArea(history, path);
  assert.equal(areaBack(history, "/portal/scoring/play"), "/portal/scoring");
  assert.equal(areaBack(history, "/portal/career"), "/portal");
  assert.equal(areaBack(history, "/teams"), "/");
});
test("back follows actual visits rather than URL parents", () => {
  let history: AreaHistory = {};
  for (const path of ["/portal", "/portal/profile", "/portal/handicap", "/portal/handicap/new"]) history = visitArea(history, path);
  assert.equal(areaBack(history, "/portal/handicap/new"), "/portal/handicap");
  history = visitArea(popArea(history, "/portal/handicap/new"), "/portal/handicap");
  assert.equal(areaBack(history, "/portal/handicap"), "/portal/profile");
});
test("direct links and invalid stored destinations fall back inside their area", () => {
  assert.equal(areaBack({}, "/portal/handicap/new"), "/portal");
  assert.equal(areaBack({}, "/portal/scoring/play"), "/portal/scoring");
  assert.equal(areaBack({}, "/teams/stats/players/cam"), "/");
  assert.equal(areaBack({ portal: ["/teams", "/portal/career"] }, "/portal/career"), "/portal");
  assert.equal(areaBack({ website: ["//example.com", "/teams"] }, "/teams"), "/");
});
test("revisiting a page through a link still remembers the last page", () => {
  let history: AreaHistory = {};
  for (const path of ["/portal", "/portal/profile", "/portal/handicap", "/portal/profile"]) history = visitArea(history, path);
  assert.equal(areaBack(history, "/portal/profile"), "/portal/handicap");
});
