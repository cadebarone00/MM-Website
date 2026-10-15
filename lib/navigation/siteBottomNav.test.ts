import assert from "node:assert/strict";
import test from "node:test";
import { chromePathname, isSiteBottomNavHidden, siteBottomNavTabActive, siteBottomNavTabHref } from "./siteBottomNav";

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
  assert.equal(isSiteBottomNavHidden("/tournaments/create"), false);
  assert.equal(isSiteBottomNavHidden("/tournaments/mine"), false);
  assert.equal(isSiteBottomNavHidden("/portal/scoring"), false);
  assert.equal(isSiteBottomNavHidden("/the-maroon/courses"), false);
  assert.equal(isSiteBottomNavHidden("/profile"), false);
  assert.equal(isSiteBottomNavHidden("/golf-trips"), false);
});

test("dev profile preview pages wear the real screens' chrome", () => {
  assert.equal(chromePathname("/dev/profile"), "/profile");
  assert.equal(chromePathname("/dev/profile/settings"), "/settings");
  assert.equal(chromePathname("/dev/profile/edit"), "/profile/edit");
  assert.equal(chromePathname("/dev/profile/requests"), "/dev/profile/requests");
  assert.equal(chromePathname("/profile"), "/profile");
  assert.equal(siteBottomNavTabHref("/dev/profile/settings", "/profile"), "/dev/profile");
  assert.equal(siteBottomNavTabHref("/dev/profile/settings", "/golf-trips"), "/golf-trips");
  assert.equal(siteBottomNavTabHref("/settings", "/profile"), "/profile");
});

test("siteBottomNavTabActive", () => {
  assert.equal(siteBottomNavTabActive("/tournaments/join", "/tournaments/join"), true);
  assert.equal(siteBottomNavTabActive("/tournaments/mine", "/tournaments/join"), true);
  assert.equal(siteBottomNavTabActive("/tournaments/create", "/tournaments/join"), true);
  assert.equal(siteBottomNavTabActive("/tournaments", "/tournaments/join"), false);
  assert.equal(siteBottomNavTabActive("/profile", "/profile"), true);
  assert.equal(siteBottomNavTabActive("/account/choose", "/profile"), true);
  assert.equal(siteBottomNavTabActive("/profiles", "/profile"), false);
  for (const path of ["/profile/jakeparker", "/profile/edit", "/settings", "/dev/profile", "/dev/profile/settings", "/dev/profile/edit", "/dev/profile/requests"]) {
    assert.equal(siteBottomNavTabActive(path, "/profile"), true, path);
    assert.equal(siteBottomNavTabActive(path, "/"), false, path);
    assert.equal(siteBottomNavTabActive(path, "/golf-trips"), false, path);
  }
  assert.equal(siteBottomNavTabActive("/dev/profiles", "/profile"), false);
  assert.equal(siteBottomNavTabActive("/profile", "/"), false);
  assert.equal(siteBottomNavTabActive("/", "/"), true);
  assert.equal(siteBottomNavTabActive("/the-maroon/news", "/"), true);
  assert.equal(siteBottomNavTabActive("/website", "/"), false);
  assert.equal(siteBottomNavTabActive("/tournaments/join", "/"), false);
  assert.equal(siteBottomNavTabActive("/golf-trips", "/golf-trips"), true);
  assert.equal(siteBottomNavTabActive("/golf-trips/trip", "/golf-trips"), true);
  assert.equal(siteBottomNavTabActive("/dev/tournament", "/golf-trips"), true);
  assert.equal(siteBottomNavTabActive("/dev/tournament/settings", "/golf-trips"), true);
  assert.equal(siteBottomNavTabActive("/golf-trips", "/"), false);
});
