import { drawPairs, type League } from "@/lib/platform/leagues";

/**
 * DEV ONLY: a made-up league for the Leagues preview (/dev/leagues), so the league screens can be seen before the
 * database is set up. Nothing here is saved; changes in the preview only last until the page reloads.
 * 16 players in 4 groups, part way through the round. "me" organizes the league and keeps group 1's card.
 */

export const SAMPLE_LEAGUE_ME = "me";
const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const SI = [7, 13, 17, 1, 9, 3, 15, 11, 5, 8, 14, 18, 2, 10, 4, 16, 12, 6];
const PLAYERS: [string, string, number][] = [
  [SAMPLE_LEAGUE_ME, "Cam Latto", 6.2], ["p2", "Cade Barone", 11.4], ["p3", "Jake Hill", 3.8], ["p4", "Luke Sherrell", 15.0],
  ["p5", "Drew Weisser", 8.9], ["p6", "Jackson Collins", 19.6], ["p7", "Nate Brooks", 1.2], ["p8", "Ryan Ortiz", 24.3],
  ["p9", "Sam Pierce", 12.7], ["p10", "Tyler Grant", 5.5], ["p11", "Ben Carter", 17.1], ["p12", "Will Hayes", 9.8],
  ["p13", "Chris Dunn", 2.4], ["p14", "Matt Lowe", 21.0], ["p15", "Josh Reed", 13.3], ["p16", "Alex Moore", 7.6],
];
/** How many holes each group has played so far. */
const THRU = [7, 12, 9, 5];
/** The same made-up score every time: par plus a small, steady wobble by player and hole (higher handicaps a bit more). */
const strokes = (player: number, hole: number) => PAR[hole] + [0, 1, 0, -1, 1, 0, 2, 0, 1, 0][(player * 7 + hole * 3) % 10] + (PLAYERS[player][2] > 15 && hole % 3 === 0 ? 1 : 0);
/** The same "random" draw every time the preview opens. */
const steady = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

export function sampleLeague(): League {
  const today = new Date().toLocaleDateString("en-CA");
  // Group 2 is playing net skins among themselves; group 1 (the organizer's) hasn't picked a game yet.
  const groups = THRU.map((_, g) => ({ number: g + 1, time: ["08:00", "08:10", "08:20", "08:30"][g], hole: 1, scorer: PLAYERS[g * 4][0], players: PLAYERS.slice(g * 4, g * 4 + 4).map(([id]) => id),
    game: g === 1 ? { id: "skins" as const, net: true, birdiesDouble: false } : null, inputs: [] }));
  const holes: League["holes"] = [];
  PLAYERS.forEach(([id], p) => { for (let h = 0; h < THRU[Math.floor(p / 4)]; h++) holes.push({ profileId: id, hole: h + 1, strokes: strokes(p, h) }); });
  const base = {
    players: PLAYERS.map(([profileId, name, handicap]) => ({ profileId, name, handicap })),
    groups,
  };
  return {
    id: "sample", code: "LG7K2Q", name: "Thursday Night League", organizer: SAMPLE_LEAGUE_ME, date: today, status: "live",
    course: { name: "Stevens Park Golf Course", place: "Dallas, TX", par: PAR, strokeIndex: SI, tee: { name: "Blue", rating: 70.4, slope: 124 } },
    scoring: "Gross", ...base,
    skins: { on: true, net: false, carryover: true },
    pairs: { on: true, format: "bestball", net: true, segments: 6, rule: "split-groups", locked: true, teams: drawPairs(base, "split-groups", steady(11)) },
    holes,
  };
}
