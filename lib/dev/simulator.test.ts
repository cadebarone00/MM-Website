import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SIMULATOR_STATE, parseGpsCommand, parseGpsState, parseSimulatorConfig, parseSimulatorLocation, sameSimulatorNavigation, simulatorPageForLocation, SIMULATOR_DEVICES, type SimulatorPage } from "./simulator";
import { simulatorRoundLive, simulatorTripData } from "./golfTripSimulatorData";
import { GOLF_MATCH_PREVIEW, GOLF_TRIP_MOCK_DRAFT } from "@/lib/platform/golfTripPreviewFixture";
import { palmSprings2026 } from "@/lib/data/2026-palm-springs";
import { adaptTournamentToDraft, adaptTournamentToPreviewMatch } from "@/lib/platform/tournamentToGolfTrip";

const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
const maroon = { preview: adaptTournamentToDraft(palmSprings2026).draft, previewMatch: adaptTournamentToPreviewMatch(palmSprings2026) ?? undefined };

test("one page mapping resolves route, tab and subview reports without replaying navigation", () => {
  const pages: SimulatorPage[] = [
    { id: "home", path: "/dev/tournament", label: "Home", fixtures: true, navigation: { tab: "Home" } },
    { id: "golf", path: "/dev/tournament", label: "Golf", fixtures: true, navigation: { tab: "Golf" } },
    { id: "games", path: "/dev/tournament", label: "Games", fixtures: true, navigation: { tab: "Golf", golfSection: "Games" } },
    { id: "settings", path: "/dev/tournament/settings", label: "Settings", fixtures: true },
  ];
  for (const page of pages) assert.equal(simulatorPageForLocation(pages, { path: page.path, navigation: page.navigation })?.id, page.id);
  assert.equal(simulatorPageForLocation(pages, { path: "/dev/tournament", navigation: { tab: "Golf", golfSection: "Overview" } })?.id, "golf");
  assert.equal(simulatorPageForLocation(pages, { path: "/dev/tournament" }, "games")?.id, "games");
  assert.equal(simulatorPageForLocation(pages, { path: "/unmapped" }), undefined);
  for (const value of [null, { path: "javascript:alert(1)" }, { path: "//other-host" }, { path: "/dev" }, { path: "/dev/tournament", navigation: { tab: "Admin" } }, { path: "/dev/tournament", navigation: { tab: "Golf", golfSection: "Invalid" } }]) assert.equal(parseSimulatorLocation(value), null);
  assert(sameSimulatorNavigation({ tab: "Venue", command: 1 }, { tab: "Venue", command: 1 }));
  assert(!sameSimulatorNavigation({ tab: "Venue", command: 1 }, { tab: "Venue", command: 2 }));
});

test("frame boundary rejects invalid dimensions of state and navigation", () => {
  const config = { source: "mock", state: DEFAULT_SIMULATOR_STATE, navigation: { tab: "Golf", golfSection: "Games", command: 1 } };
  assert.deepEqual(parseSimulatorConfig(config), config);
  for (const invalid of [null, {}, { ...config, source: "database" }, { ...config, state: { ...config.state, playerCount: -1 } }, { ...config, state: { ...config.state, playerCount: 10000 } }, { ...config, navigation: { tab: "Admin" } }, { ...config, state: { ...config.state, loading: "fetch-secrets" } }]) assert.equal(parseSimulatorConfig(invalid), null);
});

test("real and mock preserve their sources; fixture/state overrides cannot mutate tournament data", () => {
  const original = JSON.stringify({ tournament: palmSprings2026, mock, maroon });
  assert.deepEqual(simulatorTripData(mock, maroon, { source: "maroon", state: DEFAULT_SIMULATOR_STATE }), maroon);
  assert.deepEqual(simulatorTripData(mock, maroon, { source: "mock", state: DEFAULT_SIMULATOR_STATE }), mock);
  const empty = simulatorTripData(mock, maroon, { source: "empty", state: DEFAULT_SIMULATOR_STATE });
  assert.deepEqual(empty.preview, {});
  assert.equal(empty.previewMatch?.leaderboard.length, 0);
  assert.equal(empty.previewMatch?.matches.length, 0);
  const busy = simulatorTripData(mock, maroon, { source: "busy", state: DEFAULT_SIMULATOR_STATE });
  assert.equal(busy.previewMatch?.leaderboard.length, 32);
  assert.equal(busy.preview?.day4Rounds, "2");
  const overridden = simulatorTripData(mock, maroon, { source: "maroon", state: { ...DEFAULT_SIMULATOR_STATE, playerCount: 64, competition: "no", format: "stableford", roundStatus: "scheduled" } });
  assert.equal(overridden.preview?.playerCount, "64");
  assert.equal(overridden.preview?.includesTournament, "no");
  assert.equal(overridden.previewMatch?.format, "Stableford");
  assert(overridden.previewMatch?.leaderboard.every(row => row.holes.every(hole => hole === null)));
  assert.equal(JSON.stringify({ tournament: palmSprings2026, mock, maroon }), original);
});

test("requested device presets specify portrait CSS dimensions", () => {
  assert.equal(SIMULATOR_DEVICES.length, 9);
  assert.deepEqual(SIMULATOR_DEVICES.filter(device => device.id.startsWith("iphone17")).map(device => [device.width, device.height]), [[402, 874], [402, 874], [440, 956]]);
});

test("GPS test messages: only exact Real / Mock, single-step moves and reset get through", () => {
  assert.deepEqual(parseGpsCommand({ mode: "mock" }), { mode: "mock" });
  assert.deepEqual(parseGpsCommand({ move: { north: 1, east: 0 } }), { move: { north: 1, east: 0 } });
  assert.deepEqual(parseGpsCommand({ reset: true }), { reset: true });
  for (const bad of [null, {}, { mode: "satellite" }, { move: { north: 5, east: 0 } }, { move: { north: 0, east: 0 } }, { reset: "yes" }, "mock"]) assert.equal(parseGpsCommand(bad), null);
  assert.deepEqual(parseGpsState({ mode: "real", source: "real", accuracyMeters: 6 }), { mode: "real", source: "real", accuracyMeters: 6 });
  assert.deepEqual(parseGpsState({ mode: "mock", source: null, accuracyMeters: null }), { mode: "mock", source: null, accuracyMeters: null });
  for (const bad of [null, { mode: "x", source: null, accuracyMeters: null }, { mode: "real", source: "real", accuracyMeters: -1 }, { mode: "real", source: "real", accuracyMeters: "6" }]) assert.equal(parseGpsState(bad), null);
});

test("round-state conditions: pre-tournament, live, between rounds (3 done, 4 next) and trip complete", () => {
  for (const source of ["mock", "maroon"] as const) {
    const run = (roundStatus: typeof DEFAULT_SIMULATOR_STATE.roundStatus) => simulatorTripData(mock, maroon, { source, state: { ...DEFAULT_SIMULATOR_STATE, roundStatus } }).previewMatch!;
    const before = JSON.stringify(source === "mock" ? mock : maroon);

    const pre = run("scheduled");
    assert.equal(pre.round, 1);
    assert(pre.leaderboard.every(row => row.thru === "—" && row.holes.every(hole => hole === null)));

    const live = run("live");
    assert(live.leaderboard.length > 0 && live.leaderboard.every(row => row.thru === "9" && row.holes.slice(0, 9).every(hole => hole !== null) && row.holes.slice(9).every(hole => hole === null)), `${source} live`);

    const between = run("between");
    assert.equal(between.round, 3);
    assert(between.roundCount >= 4, "a round 4 is still to come");
    assert(between.leaderboard.every(row => row.thru === "F" && row.holes.every(hole => hole !== null)));

    const complete = run("complete");
    assert.equal(complete.round, complete.roundCount);
    assert(complete.leaderboard.every(row => row.thru === "F" && row.holes.every(hole => hole !== null)));

    // Scores add up: "today" is the to-par of the 18 holes against the round's par.
    const row = complete.leaderboard[0];
    const toPar = row.holes.reduce<number>((sum, strokes, hole) => sum + (strokes ?? 0) - complete.par[hole], 0);
    assert.equal(row.today, toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar));
    assert.equal(JSON.stringify(source === "mock" ? mock : maroon), before, "source data untouched");
  }
});

test("the Scoring sheet shows only while a round is being played", () => {
  const match = (roundStatus: typeof DEFAULT_SIMULATOR_STATE.roundStatus) => simulatorTripData(mock, maroon, { source: "mock", state: { ...DEFAULT_SIMULATOR_STATE, roundStatus } }).previewMatch;
  assert.equal(simulatorRoundLive("live", match("live")), true);
  assert.equal(simulatorRoundLive("roundEnd", match("roundEnd")), true);
  for (const off of ["scheduled", "between", "complete"] as const) assert.equal(simulatorRoundLive(off, match(off)), false, off);
  // From the data source: live when someone has started but not finished the round.
  assert.equal(simulatorRoundLive("source", match("live")), true);
  assert.equal(simulatorRoundLive("source", match("scheduled")), false);
  assert.equal(simulatorRoundLive("source", match("complete")), false);
  assert.equal(simulatorRoundLive("source", undefined), false);
});

test("viewAs: defaults to Cade, accepts a mock account, rejects anything else", () => {
  assert.equal(DEFAULT_SIMULATOR_STATE.viewAs, "dev-cade");
  const config = (viewAs: unknown) => parseSimulatorConfig({ source: "mock", state: { ...DEFAULT_SIMULATOR_STATE, viewAs } });
  assert.equal(config("dev-jake")?.state.viewAs, "dev-jake");
  assert.equal(config("someone-else"), null);
  assert.equal(config(undefined)?.state.viewAs, "dev-cade", "older panels without viewAs still work");
});
