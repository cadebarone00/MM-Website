import assert from "node:assert/strict";
import test from "node:test";
import { isSiteBottomNavHidden, siteBottomNavTabActive } from "./siteBottomNav";

test("isSiteBottomNavHidden hides immersive routes", () => {
  assert.equal(isSiteBottomNavHidden("/broadcast/live"), true);
  assert.equal(isSiteBottomNavHidden("/dev/play/leaderboard"), true);
  assert.equal(isSiteBottomNavHidden("/play/foo/2026/home"), true);
  assert.equal(isSiteBottomNavHidden("/tournaments/maroon-tournament/2026"), true);
  assert.equal(isSiteBottomNavHidden("/login"), true);
});

test("isSiteBottomNavHidden shows main site routes", () => {
  assert.equal(isSiteBottomNavHidden("/"), false);
  assert.equal(isSiteBottomNavHidden("/website"), false);
  assert.equal(isSiteBottomNavHidden("/tournaments/join"), false);
  assert.equal(isSiteBottomNavHidden("/portal/scoring"), false);
  assert.equal(isSiteBottomNavHidden("/the-maroon/courses"), false);
});

test("siteBottomNavTabActive", () => {
  assert.equal(siteBottomNavTabActive("/tournaments/join", "/tournaments/join"), true);
  assert.equal(siteBottomNavTabActive("/account/settings", "/account/choose"), true);
  assert.equal(siteBottomNavTabActive("/the-maroon/news", "/the-maroon"), true);
  assert.equal(siteBottomNavTabActive("/website", "/the-maroon"), false);
});
