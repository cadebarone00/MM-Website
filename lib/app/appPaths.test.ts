import { test } from "node:test";
import assert from "node:assert/strict";
import { appPath } from "./appPaths.ts";
import { appCorsHeaders, isAppOrigin } from "./appCors.ts";
import { golfTripUrl } from "../platform/golfTripCreate.ts";

const ID = "2f0c1a3e-9b7d-4c21-8e55-0a1b2c3d4e5f";

test("website-style trip links become the app's one trip page; everything else is left alone", () => {
  assert.equal(appPath(`/golf-trips/${ID}`), `/golf-trips/trip/?id=${ID}`);
  assert.equal(appPath(`/golf-trips/${ID}/`), `/golf-trips/trip/?id=${ID}`);
  assert.equal(appPath(`/golf-trips/${ID}/settings`), `/golf-trips/trip/settings/?id=${ID}`);
  assert.equal(appPath(`/golf-trips/${ID}/settings/delete`), `/golf-trips/trip/settings/delete/?id=${ID}`);
  assert.equal(appPath(`/golf-trips/${ID}?round=2`), `/golf-trips/trip/?round=2&id=${ID}`);
  for (const path of ["/", "/golf-trips", "/golf-trips/import", `/golf-trips/trip/?id=${ID}`, "/golf-trips/not-an-id", "/profile"]) assert.equal(appPath(path), path);
});

test("join, invite, tournament, watch and profile links become the app's one page for each, with the value in the query", () => {
  const CODE = "a".repeat(24), TOKEN = "b".repeat(40);
  assert.equal(appPath(`/golf-trips/join/${CODE}`), `/golf-trips/join/?code=${CODE}`);
  assert.equal(appPath("/golf-trips/join/K7Q4MZ"), "/golf-trips/join/?code=K7Q4MZ");
  assert.equal(appPath(`/golf-trips/invite/${TOKEN}`), `/golf-trips/invite/?token=${TOKEN}`);
  assert.equal(appPath(`/tournaments/code/invite/${TOKEN}`), `/tournaments/code/invite/?token=${TOKEN}`);
  assert.equal(appPath(`/tournaments/invite/${TOKEN}`), `/tournaments/invite/?token=${TOKEN}`);
  assert.equal(appPath("/tournaments/code/abc"), "/tournaments/code/?id=abc");
  assert.equal(appPath("/tournaments/live/abc"), "/tournaments/live/?id=abc");
  assert.equal(appPath("/watch/XYZ"), "/watch/?code=XYZ");
  assert.equal(appPath(`/leagues/${ID}`), `/leagues/league/?id=${ID}`);
  assert.equal(appPath("/profile/cam%20l"), "/profile/user/?username=cam+l");
  assert.equal(appPath("/t/texas-cup"), "/t/site/?tournament=texas-cup");
  assert.equal(appPath("/t/texas-cup/2027/players"), "/t/site/?tournament=texas-cup&year=2027&section=players");
  assert.equal(appPath("/play/texas-cup/2027"), "/play/tournament/?tournament=texas-cup&year=2027");
  assert.equal(appPath("/play/texas-cup/2027/leaderboard"), "/play/tournament/?tournament=texas-cup&year=2027&section=leaderboard");
  assert.equal(appPath("/tournaments/texas-cup/2027"), "/tournaments/studio/?tournament=texas-cup&year=2027");
  assert.equal(appPath("/tournaments/texas-cup/2027/next"), "/tournaments/studio/next/?tournament=texas-cup&year=2027");
  assert.equal(appPath("/tournaments/texas-cup/2027/preview/players"), "/tournaments/studio/preview/?tournament=texas-cup&year=2027&section=players");
  // The app's own pages, and codes too short to be real, are left alone.
  for (const path of ["/tournaments/code/new", "/tournaments/code/join", "/tournaments/mine", "/tournaments/new", "/tournaments/create/match-play", "/profile/edit", "/profile/search", "/golf-trips/join/short", "/leagues", "/leagues/new", "/leagues/join?code=ABC123"]) assert.equal(appPath(path), path);
});

test("trip links: the website keeps /golf-trips/<id>/…; the app build uses /golf-trips/trip/…?id=", () => {
  const before = process.env.NEXT_PUBLIC_MAROON_APP;
  try {
    delete process.env.NEXT_PUBLIC_MAROON_APP;
    assert.equal(golfTripUrl(ID), `/golf-trips/${ID}`);
    assert.equal(golfTripUrl(ID, "settings"), `/golf-trips/${ID}/settings`);
    assert.equal(golfTripUrl(ID, undefined, { round: 3 }), `/golf-trips/${ID}?round=3`);
    process.env.NEXT_PUBLIC_MAROON_APP = "1";
    assert.equal(golfTripUrl(ID), `/golf-trips/trip/?id=${ID}`);
    assert.equal(golfTripUrl(ID, "settings/delete"), `/golf-trips/trip/settings/delete/?id=${ID}`);
    assert.equal(golfTripUrl(ID, undefined, { round: 3 }), `/golf-trips/trip/?round=3&id=${ID}`);
    // Every app link is one the app's own pages can open (appPath leaves it unchanged).
    for (const page of [undefined, "settings", "settings/delete", "flights"] as const) assert.equal(appPath(golfTripUrl(ID, page)), golfTripUrl(ID, page));
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_MAROON_APP; else process.env.NEXT_PUBLIC_MAROON_APP = before;
  }
});

test("only the app's own origins may call the API from another origin; the dev app only in development", () => {
  assert.ok(isAppOrigin("capacitor://localhost", false));
  assert.ok(isAppOrigin("https://localhost", false));
  assert.ok(!isAppOrigin("http://localhost:3002", false));
  assert.ok(isAppOrigin("http://localhost:3002", true));
  for (const other of [null, "", "https://themaroon.site.evil.com", "https://example.com", "capacitor://evil"]) assert.ok(!isAppOrigin(other, true));
  const headers = appCorsHeaders("capacitor://localhost");
  assert.equal(headers["Access-Control-Allow-Origin"], "capacitor://localhost");
  assert.ok(!("Access-Control-Allow-Credentials" in headers)); // the app sends a token, never cookies
});
