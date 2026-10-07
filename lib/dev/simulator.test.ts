import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SIMULATOR_STATE, parseGpsCommand, parseGpsState, parseSimulatorConfig, parseSimulatorLocation, sameSimulatorNavigation, simulatorPageForLocation, SIMULATOR_DEVICES, type SimulatorPage } from "./simulator";
import { randomMockTrip, simulatorNow, simulatorRoundLive, simulatorTripData } from "./golfTripSimulatorData";
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
  // Just created: every onboarding answer, nothing else (no scores, only the organizer on the trip, no travel items).
  const justCreated = simulatorTripData(mock, maroon, { source: "empty", state: DEFAULT_SIMULATOR_STATE });
  assert.equal(justCreated.preview?.tripName, "Myrtle Beach Golf Trip");
  assert.equal(justCreated.preview?.round4Course, "The Dunes Golf & Beach Club");
  assert.equal(justCreated.previewMatch?.leaderboard.length, 0);
  assert.equal(justCreated.previewMatch?.matches.length, 0);
  assert.deepEqual(justCreated.travel?.items, []);
  assert.deepEqual(justCreated.travel?.members.map(member => member.name), ["Jordan Lee"]);
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

test("trip clock matches the round state, so a live round is on the trip's day (busy data)", () => {
  const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
  const at = (roundStatus: typeof DEFAULT_SIMULATOR_STATE.roundStatus) => {
    const config = { source: "busy" as const, state: { ...DEFAULT_SIMULATOR_STATE, roundStatus } };
    const data = simulatorTripData(mock, mock, config);
    return simulatorNow(config, data, simulatorRoundLive(roundStatus, data.previewMatch));
  };
  // Busy: Apr 22–25, two rounds a day. Before round 1 = the night before arrival; complete = the day after the trip.
  assert.equal(at("scheduled"), "2027-04-21T18:00:00");
  assert.equal(at("complete"), "2027-04-27T12:00:00");
  // The busy field is on round 2 = day 1's afternoon round: mid-round, then just after it ends; between rounds 3 and 4 = day 2, lunch.
  assert.equal(at("live"), "2027-04-22T15:30:00");
  assert.equal(at("roundEnd"), "2027-04-22T17:35:00");
  assert.equal(at("between"), "2027-04-23T12:45:00");
});

test("trip clock: real Maroon data and non-live sources use the device clock", () => {
  const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
  const config = { source: "maroon" as const, state: DEFAULT_SIMULATOR_STATE };
  assert.equal(simulatorNow(config, simulatorTripData(mock, mock, config), false), undefined);
});

test("Randomize data: a seed builds a realistic made-up mock trip, the same every time for that seed", () => {
  const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
  const first = randomMockTrip(mock, 12345, null);
  assert.deepEqual(randomMockTrip(mock, 12345, null), first);
  assert.notDeepEqual(randomMockTrip(mock, 999, null).preview, first.preview);
  // Players: 4–32, mostly in fours.
  const counts = Array.from({ length: 200 }, (_, index) => Number(randomMockTrip(mock, index + 1, null).preview?.playerCount));
  assert.ok(counts.every(count => count >= 4 && count <= 32));
  assert.ok(counts.filter(count => count % 4 === 0).length / counts.length > 0.75);
  for (let seed = 1; seed <= 60; seed++) {
    const trip = randomMockTrip(mock, seed, null);
    const items = trip.travel?.items ?? [];
    const time = (stamp: string) => stamp.slice(11, 16);
    // Tee times never before 7 AM (and done by mid-afternoon); dinners at dinner time.
    for (const tee of items.filter(item => item.kind === "teeTime")) assert.ok(time(tee.startsAt) >= "07:00" && time(tee.startsAt) <= "13:30", tee.startsAt);
    for (const dinner of items.filter(item => item.kind === "dining")) assert.ok(time(dinner.startsAt) >= "18:30" && time(dinner.startsAt) <= "20:00", dinner.startsAt);
    // Fly in, pick up the car after landing, check in, golf, then check out and fly home after the last round.
    const outbound = items.find(item => item.id === "rnd-flight-out")!, car = items.find(item => item.id === "rnd-car")!, home = items.find(item => item.id === "rnd-flight-home")!;
    assert.ok(car.startsAt > outbound.endsAt!);
    assert.ok(car.endsAt! < home.startsAt);
    const lastTee = items.filter(item => item.kind === "teeTime").map(item => item.startsAt).sort().at(-1)!;
    assert.ok(home.startsAt > lastTee);
    assert.equal(trip.previewMatch?.leaderboard.length, Number(trip.preview?.playerCount));
    assert.ok(trip.preview?.round1Format);
  }
  // Simulator state with a seed uses it for mock; without one, the default mock trip.
  const config = { source: "mock" as const, state: { ...DEFAULT_SIMULATOR_STATE, seed: 12345 } };
  assert.equal(simulatorTripData(mock, mock, config).preview?.tripName, first.preview?.tripName);
  assert.equal(simulatorTripData(mock, mock, { source: "mock", state: DEFAULT_SIMULATOR_STATE }).preview?.tripName, GOLF_TRIP_MOCK_DRAFT.tripName);
  assert.ok(parseSimulatorConfig({ source: "mock", state: { ...DEFAULT_SIMULATOR_STATE, seed: 12345 } }));
  assert.equal(parseSimulatorConfig({ source: "mock", state: { ...DEFAULT_SIMULATOR_STATE, seed: "x" } }), null);
});

test("live / between round states give every round its matches: past ones final, the current one live, later ones not started", () => {
  const mock = { preview: GOLF_TRIP_MOCK_DRAFT, previewMatch: GOLF_MATCH_PREVIEW };
  const at = (roundStatus: typeof DEFAULT_SIMULATOR_STATE.roundStatus) => simulatorTripData(mock, mock, { source: "busy", state: { ...DEFAULT_SIMULATOR_STATE, roundStatus } }).previewMatch!;
  const between = at("between");
  const byRound = (match: typeof between, round: number) => match.matches.filter(pairing => pairing.round === round);
  assert.equal(between.round, 3);
  assert.ok(byRound(between, 1).length > 0 && byRound(between, 1).every(pairing => pairing.result));
  assert.ok(byRound(between, 3).every(pairing => pairing.result));
  assert.ok(byRound(between, 4).every(pairing => !pairing.result && pairing.gross === null));
  const live = at("live");
  const current = byRound(live, live.round);
  assert.ok(current.length > 0 && current.every(pairing => !pairing.result && /^Thru \d+$/.test(("thru" in pairing.left && pairing.left.thru) || "")));
  // Live standings are never already decided (up by more than the holes left).
  for (const pairing of current) {
    const holes = Number(/\d+/.exec(("thru" in pairing.left && pairing.left.thru) || "")?.[0]);
    assert.ok(!pairing.gross || pairing.gross.up <= 18 - holes);
  }
  assert.deepEqual(at("live"), live);
});
