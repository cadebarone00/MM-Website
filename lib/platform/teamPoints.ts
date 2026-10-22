import { matchScoring, matchStatus, normalizeCompetitor, type GolfMatchPreview, type RoundScoring } from "./golfTripPreviewFixture";
import { matchCard, withHoleStandings } from "./matchCenter";
import { defaultRoundComp, roundPointsAvailable, type RoundCompSettings } from "./roundCompetition";

/**
 * Team points for the tournament box (owner rule 2026-10-19): the organizer's Team Competition settings for each round
 * (Trip Settings → Competition → Format → a round: match type, points per match, Nassau) decide what each match pays.
 *   * Match play, Nassau off: a finished match pays its points to the team that won it (half each if halved).
 *   * Match play, Nassau on: front 9, back 9 and overall each pay the match's points the same way.
 *   * Stroke play: no match points.
 * Total points available = each round's "Total points available" from those settings, added up across the rounds.
 * Points are counted per match, not per player (partners share one team point).
 */

/** Each competition round's settings, from the organizer's saved Format choices (`key` = "<day index>-<slot>"). */
export function roundScoringFrom(rounds: { number: number; dayNumber: number }[], compFormats: Record<string, RoundCompSettings> | undefined,
  compRounds: Record<string, boolean> | undefined, players: number): RoundScoring[] {
  return rounds.flatMap((round): RoundScoring[] => {
    const slot = rounds.filter((r) => r.dayNumber === round.dayNumber).findIndex((r) => r.number === round.number);
    const key = `${round.dayNumber - 1}-${slot}`;
    if (compRounds?.[key] === false) return [];
    const settings = compFormats?.[key] ?? defaultRoundComp(players);
    return [{ round: round.number, matchPlay: settings.matchType === "Match Play", pointsPerMatch: settings.pointsPerMatch, nassau: settings.nassau, pointsAvailable: roundPointsAvailable(settings) }];
  });
}

export interface TeamPoints { points: [number, number]; available: number }

/** Team totals across the trip, round by round. Null when there's nothing to count (no settings and no matches). */
export function teamPoints(source: GolfMatchPreview): TeamPoints | null {
  const match = withHoleStandings(source);
  const settings = match.roundScoring ?? [];
  if (!settings.length && !match.matches.length) return null;
  const forRound = (round: number) => settings.find((s) => s.round === round);
  const net = matchScoring(match) === "Net";
  const points: [number, number] = [0, 0];
  const award = (lead: number, value: number) => {
    if (lead > 0) points[0] += value; else if (lead < 0) points[1] += value; else { points[0] += value / 2; points[1] += value / 2; }
  };
  for (const pairing of match.matches) {
    const round = pairing.round ?? match.round;
    const rule = forRound(round);
    if (rule && !rule.matchPlay) continue;
    const value = rule?.pointsPerMatch ?? 1;
    const left = normalizeCompetitor(pairing.left);
    const standing = net ? pairing.net : pairing.gross;
    const status = matchStatus({ thru: left.thru ?? left.golfers[0]?.thru, standing, result: pairing.result });
    const overallLead = standing?.leader === "left" ? 1 : standing?.leader === "right" ? -1 : 0;
    if (!rule?.nassau) { if (status.kind === "final") award(overallLead, value); continue; }
    // Nassau: front and back from the hole-by-hole card (this round's scorecard); overall from the match result.
    // Each nine counts once all its holes are played (even after the overall match is decided).
    if (round === match.round) {
      const card = matchCard(match, pairing, net);
      const nine = (from: number) => {
        const holes = card.holes.slice(from, from + 9);
        return holes.length === 9 && holes.every((h) => h.left !== null && h.right !== null)
          ? holes.reduce((lead, h) => lead + Math.sign((h.right as number) - (h.left as number)), 0) : null;
      };
      const front = nine(0), back = nine(9);
      if (front !== null) award(front, value);
      if (back !== null) award(back, value);
    }
    if (status.kind === "final") award(overallLead, value);
  }
  // Available: the organizer's totals per round; a round without settings counts its matches at 1 point.
  const roundsWithMatches = [...new Set(match.matches.map((p) => p.round ?? match.round))];
  const available = settings.reduce((sum, s) => sum + s.pointsAvailable, 0)
    + roundsWithMatches.filter((r) => !forRound(r)).reduce((sum, r) => sum + match.matches.filter((p) => (p.round ?? match.round) === r).length, 0);
  return { points, available };
}
