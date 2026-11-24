import { test } from "node:test";
import assert from "node:assert/strict";
import type { ScoringCourse } from "./personalRound.ts";
import { buildRoundSetup, dollars, emptyRoundSetupForm, handicapValue, money, playersLabel, reviewLines, stakeText, startErrorMessage, type RoundSetupForm } from "./roundSetupForm.ts";

// 18 holes: par 3s on 3, 8, 12, 17; par 5s on 5, 14.
const PAR = [4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 4, 3, 4, 5, 4, 4, 3, 4];
const course: ScoringCourse = { ref: "c1", name: "Eagle Pointe", place: "Mont Belvieu, TX", par: PAR, tees: [{ name: "Blue", rating: 71.2, slope: 125 }, { name: "Red", rating: null, slope: null }] } as ScoringCourse;
const form = (part: Partial<RoundSetupForm> = {}): RoundSetupForm => ({ ...emptyRoundSetupForm("2026-11-24"), course, ...part });

test("no course yet: no setup, and Next stays off on the Round page", () => {
  const built = buildRoundSetup(emptyRoundSetupForm("2026-11-24"));
  assert.equal(built.setup, null);
  assert.equal(built.canNext("round"), false);
  assert.equal(built.canNext("players"), true);
});

test("just keeping score: the course, tee, holes and stats go through as typed", () => {
  const built = buildRoundSetup(form({ myHandicap: "8.4" }));
  assert.equal(built.setup?.course.name, "Eagle Pointe");
  assert.equal(built.setup?.tee?.name, "Blue");
  assert.equal(built.setup?.holes, "18");
  assert.equal(built.setup?.myHandicap, 8.4);
  assert.equal(built.setup?.playerStats, true);
  assert.equal(built.game, null);
  assert.equal(built.handicapNote, "Counts once you submit");
});

test("handicap notes follow the same order as the website", () => {
  assert.equal(buildRoundSetup(form({ countForHandicap: false })).handicapNote, "Practice round: saved, not counted");
  assert.equal(buildRoundSetup(form({ tee: 1 })).handicapNote, "This tee has no rating, so it won't count");
  assert.equal(buildRoundSetup(form({ holes: "front" })).handicapNote, "9-hole rounds are saved but don't count yet");
  assert.equal(buildRoundSetup(form({ gameId: "scramble", players: [{ name: "Cam", profileId: "p2", handicap: null }] })).handicapNote, "Team formats can't count toward a handicap");
});

test("Skins with $5 a skin, birdies double, no carryovers", () => {
  const built = buildRoundSetup(form({ gameId: "skins", stake: "5", birdiesDouble: true, carryovers: false, players: [{ name: "Cam", profileId: "p2", handicap: null }] }));
  assert.deepEqual(built.game, { id: "skins", net: false, birdiesDouble: true, carryovers: false, stake: 5, doubles: true });
  assert.equal(built.fits, true);
});

test("a game that needs more players blocks Next on the Game page", () => {
  const built = buildRoundSetup(form({ gameId: "wolf" }));
  assert.equal(built.fits, false);
  assert.equal(built.canNext("game"), false);
});

test("Nassau stakes and presses; net with a 90% allowance", () => {
  const built = buildRoundSetup(form({ gameId: "nassau", nassau: ["5", "5", "10"], autoPress: true, net: true, allowance: 90, players: [{ name: "Cam", profileId: "p2", handicap: 12 }] }));
  assert.deepEqual(built.game?.nassauStakes, [5, 5, 10]);
  assert.equal(built.game?.autoPress, true);
  assert.equal(built.game?.net, true);
  assert.equal(built.game?.allowance, 90);
  assert.deepEqual(built.game?.teams, [0, 1]);
});

test("side games: suggested holes are the par 5s (longest drive) and par 3s (closest to the pin) in the holes played", () => {
  const built = buildRoundSetup(form({ holes: "front", greenies: { on: true, value: "2" }, longest: { on: true, value: "", holes: null }, closest: { on: true, value: "3", holes: null } }));
  assert.deepEqual(built.setup?.sideGames, { greenies: { value: 2 }, longestDrive: { value: 0, holes: [5] }, closestPin: { value: 3, holes: [3, 8] } });
});

test("guests are added to the setup; up to 5 counted with the host", () => {
  const built = buildRoundSetup(form({ guests: [{ id: "g1", name: "Uncle Rob", handicap: null }] }));
  assert.equal(built.size, 2);
  assert.deepEqual(built.names, ["You", "Uncle Rob"]);
  assert.equal(built.setup?.guests?.length, 1);
});

test("a built scorecard counts only with a real rating and slope", () => {
  const custom = { ...course, custom: true, tees: [] } as ScoringCourse;
  assert.equal(buildRoundSetup(form({ course: custom })).chosenTee, null);
  assert.deepEqual(buildRoundSetup(form({ course: custom, rating: "71.2", slope: "125" })).chosenTee, { name: "From the scorecard", rating: 71.2, slope: 125 });
  assert.equal(buildRoundSetup(form({ course: custom, rating: "300", slope: "125" })).chosenTee, null);
});

test("review lines", () => {
  const f = form({ gameId: "skins", stake: "5", players: [{ name: "Cam", profileId: "p2", handicap: null }] });
  const lines = reviewLines(f, buildRoundSetup(f));
  assert.deepEqual(lines.map((l) => l.label), ["Course", "Round", "Players", "Game"]);
  assert.equal(lines[0].value, "Eagle Pointe · Blue");
  assert.equal(lines[2].value, "You, Cam");
  assert.equal(lines[3].value, "Skins · $5 per skin · doubles");
});

test("small helpers", () => {
  assert.equal(dollars("5"), 5);
  assert.equal(dollars("0"), 0);
  assert.equal(dollars("20000"), 0);
  assert.equal(dollars("2.555"), 2.56);
  assert.equal(stakeText("$5.5a"), "5.5");
  assert.equal(money(15), "+$15");
  assert.equal(money(-2.5), "−$2.50");
  assert.equal(handicapValue("60"), null);
  assert.equal(handicapValue("-2"), -2);
  assert.equal(playersLabel([2, 3, 4, 5]), "2–5 players");
  assert.equal(playersLabel([2, 4]), "2 or 4 players");
  assert.equal(startErrorMessage("signed_out", undefined), "signed_out");
  assert.equal(startErrorMessage("offline", undefined), "No connection. Check your internet and try again.");
  assert.equal(startErrorMessage(undefined, "Guests need the update."), "Guests need the update.");
});
