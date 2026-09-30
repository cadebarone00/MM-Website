import { DEFAULT_SITE, type TournamentSetup } from "./setup.ts";

// Shared test fixtures (not a test file itself, so importing it runs no tests).

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


export const RULES = { mode: "match_play", pointsForWin: 1, pointsForHalve: 0.5, handicap: "gross", allowancePercent: 100, allowEarlyFinish: true, allowConcessions: false, individualLeaderboard: true } as const;

/** Everything a public site needs (publish gate), nothing more. */
export function publishableSetup(): TournamentSetup {
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
export function playableSetup(): TournamentSetup {
  const s = publishableSetup();
  s.players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}`, name: `Golfer ${i + 1}`, email: null, handicap: i, teamKey: i < 4 ? "blue" : "gold" }));
  s.courses = [{ id: "c1", name: "Horseshoe Bay", city: null, state: "TX", teeName: "Blue", par: 72, yards: 6800, rating: 72.1, slope: 131 }];
  s.rounds = s.rounds.map((round, index) => ({ ...round, courseId: "c1", playDate: `2027-04-1${5 + index}`, startType: "tee_times", startTime: "08:30" }));
  s.edition.publishedAt = "2027-03-01T00:00:00Z";
  return s;
}

