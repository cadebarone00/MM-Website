import type { PlayerScorecard, Tournament } from "../data/types";
import { legacyScorecardRound } from "../data/roundIdentity";
import { getPlayerDisplayName } from "../data/players";
import { resolveGolfFormat } from "./formats";
import type { GolfLeaderboardEntry, GolfMatchPreview } from "./golfTripPreviewFixture";

export function standingsFormat(format: string | undefined) {
  const resolved = resolveGolfFormat(format);
  return /chapman/i.test(format ?? "") ? { label: "Chapman", sharedBall: true } : { label: resolved.label, sharedBall: !resolved.countsIndividualStats };
}

type Session = { round: number; format: string; date?: string };
/** Original 2026 scorecard boundary: individual cards omit the two alternate-shot sessions. */
export function historicalTripStandings(tournament: Tournament, cards: PlayerScorecard[], sessions: Session[]): NonNullable<GolfMatchPreview["roundStandings"]> {
  const source = cards.map(card => ({ ...card, rounds: card.rounds.map(r => ({ ...r, round: legacyScorecardRound(tournament.year, r.round) })) }));
  return sessions.map(session => {
    const ownBall = !standingsFormat(session.format).sharedBall;
    const standingsRound = ownBall ? session.round : sessions.filter(s => s.round < session.round && !standingsFormat(s.format).sharedBall).at(-1)?.round;
    const reference = source.flatMap(c => c.rounds).find(r => r.round === standingsRound);
    const entries = (tournament.individualLeaderboard ?? []).map(standing => {
      const rounds = source.find(c => c.player === standing.player)?.rounds ?? [];
      const counted = rounds.filter(r => r.round <= session.round && !standingsFormat(sessions.find(s => s.round === r.round)?.format).sharedBall);
      const current = rounds.find(r => r.round === standingsRound);
      // The published 2026 competition totals exclude its last session; retain that authoritative final table.
      const total = session.round === sessions.length ? standing.toPar : counted.length ? counted.reduce((sum, r) => sum + r.toPar, 0) : null;
      const label = total === null ? "\u2014" : total === 0 ? "E" : total > 0 ? "+" + total : String(total);
      // Legacy FIR/GIR encode hit/miss only. The miss bucket is used for aggregation,
      // not evidence of the direction of a historical shot.
      const holeDetails = current?.holes.map(h => ({ number: h.hole, par: h.par, strokes: h.score, putts: h.putts,
        fairway: h.par === 3 || h.fir === "X" ? null : h.fir === 1 ? "center" as const : "right" as const,
        green: h.gir === 1 ? "center" as const : "right" as const }));
      return { position: "", total: label, netTotal: "\u2014", today: current ? current.toPar === 0 ? "E" : current.toPar > 0 ? "+" + current.toPar : String(current.toPar) : "\u2014", netToday: "\u2014", thru: current ? "F" : "\u2014", holes: current ? current.holes.map(h => h.score) : Array(18).fill(null), putts: current?.holes.map(h => h.putts), holeDetails, golfer: { name: getPlayerDisplayName(standing.player), hcp: 0, thru: current ? "F" : "\u2014", score: label, teeTime: "", course: current?.course ?? "" } } satisfies GolfLeaderboardEntry;
    });
    const score = (row: GolfLeaderboardEntry) => row.total === "E" ? 0 : row.total === "\u2014" ? Infinity : Number(row.total);
    entries.sort((a,b) => score(a)-score(b) || a.golfer.name.localeCompare(b.golfer.name));
    const leaderboard = entries.map(row => ({ ...row, position: row.total === "\u2014" ? "\u2014" : String(entries.findIndex(other => score(other) === score(row)) + 1) }));
    return { round: session.round, standingsRound, datePlayed: session.date, format: session.format, par: reference?.holes.map(h => h.par), leaderboard };
  });
}
