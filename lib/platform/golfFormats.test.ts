import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATS, isFormatKey, isGolfFormatKey, matchesPerRound, resolveGolfFormat } from "./formats.ts";
import {
  normalizeCompetitor,
  GOLF_MATCH_PREVIEWS,
  type GolfMatchGolfer,
  type GolfMatchCompetitor,
} from "./golfTripPreviewFixture.ts";

test("format registry defines all essential formats with metadata", () => {
  assert.ok(isFormatKey("Singles"));
  assert.ok(isFormatKey("Fourball"));
  assert.ok(isFormatKey("Foursome"));
  assert.equal(isFormatKey("Scramble"), false);

  assert.ok(isGolfFormatKey("Singles"));
  assert.ok(isGolfFormatKey("Fourball"));
  assert.ok(isGolfFormatKey("Foursome"));
  assert.ok(isGolfFormatKey("SinglesStroke"));
  assert.ok(isGolfFormatKey("Scramble"));
  assert.ok(isGolfFormatKey("Shamble"));
  assert.ok(isGolfFormatKey("BestBall"));
  assert.ok(isGolfFormatKey("Stableford"));
  assert.ok(isGolfFormatKey("Custom"));

  assert.equal(FORMATS.Singles.scoringMethod, "match_play");
  assert.equal(FORMATS.Fourball.scoringMethod, "match_play");
  assert.equal(FORMATS.Foursome.scoringMethod, "match_play");
  assert.equal(FORMATS.Scramble.scoringMethod, "stroke_play");
  assert.equal(FORMATS.Stableford.scoringMethod, "stableford");

  assert.equal(FORMATS.Singles.playersPerSide, 1);
  assert.equal(FORMATS.Fourball.playersPerSide, 2);
  assert.equal(FORMATS.Scramble.playersPerSide, 4);
});

test("resolveGolfFormat resolves keys and colloquial format strings", () => {
  assert.equal(resolveGolfFormat("Singles").key, "Singles");
  assert.equal(resolveGolfFormat("Singles Match Play").key, "Singles");
  assert.equal(resolveGolfFormat("Fourball").key, "Fourball");
  assert.equal(resolveGolfFormat("Alternate Shot").key, "Foursome");
  assert.equal(resolveGolfFormat("Foursomes").key, "Foursome");
  assert.equal(resolveGolfFormat("Scramble").key, "Scramble");
  assert.equal(resolveGolfFormat("Shamble").key, "Shamble");
  assert.equal(resolveGolfFormat("Best Ball").key, "BestBall");
  assert.equal(resolveGolfFormat("Stableford").key, "Stableford");
  assert.equal(resolveGolfFormat("Singles Stroke Play").key, "SinglesStroke");
  assert.equal(resolveGolfFormat(null).key, "Singles");
  assert.equal(resolveGolfFormat(undefined).key, "Singles");
});

test("matchesPerRound scales properly across formats", () => {
  assert.equal(matchesPerRound("Singles", 6), 6);
  assert.equal(matchesPerRound("Fourball", 6), 3);
  assert.equal(matchesPerRound("Foursome", 6), 3);
  assert.equal(matchesPerRound("Scramble", 8), 2);
});

test("normalizeCompetitor handles single golfer and multi-golfer team", () => {
  const golfer: GolfMatchGolfer = {
    name: "Alex Organizer",
    hcp: 6,
    thru: "Thru 12",
    score: "-1",
    teeTime: "8:30 AM",
    course: "Canyon Ridge",
  };

  const normalizedSingle = normalizeCompetitor(golfer);
  assert.equal(normalizedSingle.name, "Alex Organizer");
  assert.equal(normalizedSingle.golfers.length, 1);
  assert.equal(normalizedSingle.golfers[0].name, "Alex Organizer");

  const team: GolfMatchCompetitor = {
    name: "Team Alex",
    golfers: [
      golfer,
      { name: "S. Patel", hcp: 4, thru: "Thru 12", score: "E", teeTime: "8:30 AM", course: "Canyon Ridge" },
    ],
  };

  const normalizedTeam = normalizeCompetitor(team);
  assert.equal(normalizedTeam.name, "Team Alex");
  assert.equal(normalizedTeam.golfers.length, 2);
});

test("GOLF_MATCH_PREVIEWS contains fixtures for all requested preview formats", () => {
  assert.ok(GOLF_MATCH_PREVIEWS.singles);
  assert.ok(GOLF_MATCH_PREVIEWS.fourball);
  assert.ok(GOLF_MATCH_PREVIEWS.foursome);
  assert.ok(GOLF_MATCH_PREVIEWS.scramble);
  assert.ok(GOLF_MATCH_PREVIEWS.stableford);

  assert.equal(GOLF_MATCH_PREVIEWS.singles.format, "Singles Match Play");
  assert.equal(GOLF_MATCH_PREVIEWS.fourball.format, "Fourball");
  assert.equal(GOLF_MATCH_PREVIEWS.foursome.format, "Alternate Shot");
  assert.equal(GOLF_MATCH_PREVIEWS.scramble.format, "Scramble");
  assert.equal(GOLF_MATCH_PREVIEWS.stableford.format, "Stableford");
});
