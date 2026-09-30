import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReadiness, type Readiness } from "./readiness.ts";
import { DEFAULT_SITE, type TournamentSetup } from "./setup.ts";

/** A tournament straight out of quick create: name, address and year only. */
export function createdSetup(): TournamentSetup {
  return {
    tournament: { id: "t1", slug: "texas-cup", name: "Texas Cup", shortName: "Texas Cup", description: null, visibility: "private", status: "draft", branding: null, isLegacy: false },
    edition: { id: "e1", seasonYear: 2027, destination: null, startDate: null, endDate: null, timezone: "America/Chicago", status: "draft", publishedAt: null },
    competitionType: "individual", expectedPlayerCount: 12, teams: [], players: [], courses: [],
    rounds: [1, 2, 3].map((number) => ({ id: `r${number}`, number, day: null, label: null, format: null, courseId: null, playDate: null, startType: null, startTime: null })),
    scoring: null, site: { ...DEFAULT_SITE }, media: { mode: "none", links: [] }, entitlements: { hosted_media: false },
  };
}

const RULES = { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "gross", allowancePercent: 100, allowEarlyFinish: true, allowConcessions: false, individualLeaderboard: true } as const;

/** Everything a public site needs (publish gate), nothing more. */
function publishableSetup(): TournamentSetup {
  const s = createdSetup();
  s.edition.startDate = "2027-04-15";
  s.edition.endDate = "2027-04-17";
  s.competitionType = "teams";
  s.teams = [{ id: "a", key: "blue", name: "Blue", color: "#1f4e9c", captainPlayerId: null }, { id: "b", key: "gold", name: "Gold", color: "#b8860b", captainPlayerId: null }];
  s.scoring = { ...RULES };
  s.rounds = s.rounds.map((round, index) => ({ ...round, format: (["Fourball", "Foursome", "Singles"] as const)[index] }));
  return s;
}

/** Everything live scoring needs. */
function playableSetup(): TournamentSetup {
  const s = publishableSetup();
  s.players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `Golfer ${i + 1}`, email: null, handicap: i, teamKey: i < 4 ? "blue" : "gold" }));
  s.courses = [{ id: "c1", name: "Horseshoe Bay", city: null, state: "TX", teeName: "Blue", par: 72, yards: 6800, rating: 72.1, slope: 131 }];
  s.rounds = s.rounds.map((round, index) => ({ ...round, courseId: "c1", playDate: `2027-04-1${5 + index}`, startType: "tee_times", startTime: "08:30" }));
  s.edition.publishedAt = "2027-03-01T00:00:00Z";
  return s;
}

const section = (r: Readiness, name: string) => r.sections.find((s) => s.name === name)!;

test("a quick-created tournament is 'Created', publish locked, with an accurate to-do list", () => {
  const r = assessReadiness(createdSetup(), { liveScoringAvailable: false });
  assert.equal(r.stage, "Created");
  assert.equal(r.publishReady, false);
  assert.equal(section(r, "Publish").status, "Locked");
  assert.deepEqual(r.publishMissing, [
    "Add the tournament's start and end dates",
    "Choose a two-team competition (V1 plays two-team match play)",
    "Choose the scoring rules",
    "Choose a format for every round",
  ]);
  assert.equal(section(r, "Basics").status, "Needs Attention");
  assert.equal(section(r, "Players").status, "Not Started");
  assert.ok(r.percent > 0 && r.percent < 25, `percent ${r.percent}`);
});

test("the percentage rises as each requirement is met", () => {
  const steps: ((s: TournamentSetup) => void)[] = [
    (s) => { s.edition.startDate = "2027-04-15"; s.edition.endDate = "2027-04-17"; },
    (s) => { s.competitionType = "teams"; s.teams = publishableSetup().teams; },
    (s) => { s.scoring = { ...RULES }; },
    (s) => { s.rounds = publishableSetup().rounds; },
    (s) => { s.players = playableSetup().players; },
    (s) => { s.courses = playableSetup().courses; s.rounds = s.rounds.map((round) => ({ ...round, courseId: "c1" })); },
    (s) => { s.rounds = playableSetup().rounds; },
    (s) => { s.edition.publishedAt = "2027-03-01T00:00:00Z"; },
  ];
  const s = createdSetup();
  let last = assessReadiness(s, { liveScoringAvailable: true }).percent;
  for (const [i, step] of steps.entries()) {
    step(s);
    const now = assessReadiness(s, { liveScoringAvailable: true }).percent;
    assert.ok(now > last, `step ${i + 1}: ${last}% -> ${now}%`);
    last = now;
  }
  assert.equal(last, 100);
});

test("publish unlocks exactly when the publish requirements are met — players, courses and schedule aren't needed yet", () => {
  const s = publishableSetup();
  const r = assessReadiness(s, { liveScoringAvailable: false });
  assert.equal(r.publishReady, true);
  assert.equal(r.stage, "Ready to Publish");
  assert.equal(section(r, "Publish").status, "Ready");
  assert.deepEqual(r.publishMissing, []);
  assert.equal(section(r, "Players").status, "Not Started");

  s.rounds[1].format = null;
  const locked = assessReadiness(s, { liveScoringAvailable: false });
  assert.equal(locked.publishReady, false);
  assert.deepEqual(locked.publishMissing, ["Choose a format for every round"]);
  assert.equal(locked.stage, "Setup Incomplete");
});

test("optional sections and media never block publishing or play", () => {
  for (const change of [
    (s: TournamentSetup) => { s.tournament.branding = null; },
    (s: TournamentSetup) => { s.media = { mode: "none", links: [] }; },
    (s: TournamentSetup) => { s.media = { mode: "device_external", links: [{ label: "Highlights", url: "https://youtube.com/x" }] }; },
    (s: TournamentSetup) => { s.site = Object.fromEntries(Object.keys(s.site).map((k) => [k, false])) as TournamentSetup["site"]; },
  ]) {
    const pub = publishableSetup(); change(pub);
    assert.equal(assessReadiness(pub, { liveScoringAvailable: true }).publishReady, true);
    const play = playableSetup(); change(play);
    assert.equal(assessReadiness(play, { liveScoringAvailable: true }).playReady, true);
  }
  const r = assessReadiness(publishableSetup(), { liveScoringAvailable: true });
  for (const name of ["Branding", "Website", "Media"]) assert.equal(section(r, name).requiredFor, "optional");
});

test("after publishing: 'Published' until play-ready; commercial play is 'Blocked' until live scoring is switched on", () => {
  const published = publishableSetup();
  published.edition.publishedAt = "2027-03-01T00:00:00Z";
  const r = assessReadiness(published, { liveScoringAvailable: false });
  assert.equal(r.stage, "Published");
  assert.equal(r.playReady, false);
  assert.ok(r.playMissing.includes("Add at least 2 players"));
  assert.ok(r.playMissing.includes("Give every round a date"));

  const complete = assessReadiness(playableSetup(), { liveScoringAvailable: false });
  assert.equal(complete.stage, "Blocked");
  assert.equal(complete.playReady, false, "never playable while live scoring isn't available");
  assert.deepEqual(complete.playMissing, []);
  assert.match(complete.blockedReason ?? "", /live scoring for new tournaments isn't switched on yet/);

  const live = assessReadiness(playableSetup(), { liveScoringAvailable: true });
  assert.equal(live.stage, "Ready to Play");
  assert.equal(live.playReady, true);
  assert.equal(live.percent, 100);
});

test("play-critical gaps are reported in the right section", () => {
  const s = playableSetup();
  s.players[0].teamKey = null;
  s.rounds[2].courseId = null;
  s.rounds[0].startTime = null;
  const r = assessReadiness(s, { liveScoringAvailable: true });
  assert.equal(r.playReady, false);
  assert.deepEqual(section(r, "Players").missing, ["Put every player on a team"]);
  assert.deepEqual(section(r, "Courses").missing, ["Pick a course for every round"]);
  assert.deepEqual(section(r, "Schedule").missing, ["Give every round a tee time or shotgun start"]);

  const tooFew = playableSetup();
  tooFew.players = tooFew.players.filter((p) => p.teamKey === "gold" || p.id === "p1");
  const thin = assessReadiness(tooFew, { liveScoringAvailable: true });
  assert.ok(section(thin, "Players").missing[0].startsWith("Give each team at least 2 players"));
});

test("the shared rulebook has the final say before play (e.g. a captain on the wrong team)", () => {
  const s = playableSetup();
  s.teams[0].captainPlayerId = "p8"; // p8 is on Gold
  const r = assessReadiness(s, { liveScoringAvailable: true });
  assert.equal(r.playReady, false);
  assert.ok(r.playMissing.some((m) => /captain must be on Blue/.test(m)), r.playMissing.join(" | "));
});
