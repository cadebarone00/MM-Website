import type { TripRoundScoring } from "../../platform/tripScoring.ts";
import type { TemplateValues } from "../template.ts";
import type { MatchFormat } from "../engine/evaluate.ts";
import { attestedScores, playingOrder, type DetectedMoment } from "./scoreMoments.ts";

/**
 * Match-play highlights (owner request 2026-11-27, "Match play drama" tab). Pure: a round's ATTESTED scores + its matches
 * in → moments out, recomputed from the whole round every time (corrections just change the result).
 *
 * The match, hole by hole: a side's score on a hole is its best ball (singles = the one player); a hole counts once every
 * player in the match has an attested score on it, in the group's playing order (shotgun starts too). Lower side score
 * wins the hole; same = halved. GROSS only (Claude's call 2026-11-27: trips don't store handicaps yet, so a Net match
 * can't be scored fairly). The match ends when one side is up more holes than are left ("3&2"), or after 18.
 *
 * In every moment "Team A" is the side it's about (the winner, the leader, the side on a run); for moments about both
 * sides (back to all square, dormie, going to 18, halved) Team A / B are the match's sides as set up.
 *   HL-011 back to all square after 5+ holes not square · HL-012 3 holes won in a row · HL-013 comeback from 3+ down
 *   (back to all square) · HL-014 lead change (takes the lead after the other side led) · HL-015 dormie (first time)
 *   · HL-016 the match goes to the last hole · HL-017 won on the last hole · HL-018 halved · HL-019 match clinched before
 *   the last hole · HL-021 a big win (4&3 or better, or closed by the 15th) — sent INSTEAD of HL-019, never both.
 */

export interface MatchSetup { index: number; format: MatchFormat; a: string[]; b: string[] }
export interface MatchDetectionInput {
  tripId: string;
  scoring: TripRoundScoring;
  matches: MatchSetup[];
  startHoles?: Record<string, number>;
  course?: string | null;
}

const HOLES = 18;
const names = (ids: string[], nameOf: (id: string) => string) => ids.map(nameOf);

export function detectMatchMoments(input: MatchDetectionInput): DetectedMoment[] {
  const { scoring } = input;
  const scores = attestedScores(scoring);
  const nameMap = new Map(scoring.groups.flatMap((g) => g.players.map((p) => [p.profileId, p.displayName] as const)));
  const nameOf = (id: string) => nameMap.get(id) ?? "A golfer";
  const groupOf = new Map(scoring.groups.flatMap((g) => g.players.map((p) => [p.profileId, g.id] as const)));
  const out: DetectedMoment[] = [];

  for (const match of input.matches) {
    const everyone = [...match.a, ...match.b];
    if (!match.a.length || !match.b.length || everyone.some((id) => !scores.has(id))) continue;
    const start = input.startHoles?.[groupOf.get(match.a[0]) ?? ""] ?? 1;
    const sideValues = (first: string[], second: string[]): TemplateValues => {
      const [a1, a2] = names(first, nameOf), [b1, b2] = names(second, nameOf);
      return {
        "Player 1, Team A": a1, "Player 1, Team B": b1, ...(a2 ? { "Player 2, Team A": a2 } : {}), ...(b2 ? { "Player 2, Team B": b2 } : {}),
        "Team A": names(first, nameOf).join(" & "), "Team B": names(second, nameOf).join(" & "),
        Opponent: names(second, nameOf).join(" & "),
        Player: names(first, nameOf).join(" & "), Round: String(scoring.roundNumber), ...(input.course ? { Course: input.course } : {}),
      };
    };
    const sides = { a: match.a.length, b: match.b.length };
    const push = (ruleId: string, hole: number, at: string, aSide: "a" | "b", extra: TemplateValues = {}) => {
      const first = aSide === "a" ? match.a : match.b, second = aSide === "a" ? match.b : match.a;
      out.push({
        key: `${input.tripId}:${scoring.roundId}:${ruleId}:m${match.index}:${hole}`, ruleId, tier: null, profileId: first[0], playerName: nameOf(first[0]), hole, at,
        values: { ...sideValues(first, second), Hole: String(hole), ...extra }, format: match.format, sides,
      });
    };

    let diff = 0; // holes up for side A (negative = side B up)
    let played = 0;
    let sinceSquare = 0; // holes in a row not all square
    let run = 0, runSide: "a" | "b" | null = null;
    const ledBefore = { a: false, b: false };
    const worst = { a: 0, b: 0 }; // biggest deficit each side has faced
    const fired = new Set<string>();
    for (const hole of playingOrder(start)) {
      const i = hole - 1;
      const holeScores = everyone.map((id) => scores.get(id)?.[i] ?? null);
      if (holeScores.some((s) => !s)) break; // the match continues in playing order: stop at the first unfinished hole
      const best = (ids: string[]) => Math.min(...ids.map((id) => scores.get(id)![i]!.strokes));
      const at = holeScores.reduce((latest, s) => (s!.at > latest ? s!.at : latest), "");
      const before = diff;
      const a = best(match.a), b = best(match.b);
      const winner: "a" | "b" | null = a < b ? "a" : b < a ? "b" : null;
      diff += winner === "a" ? 1 : winner === "b" ? -1 : 0;
      played++;
      const left = HOLES - played;
      const leader: "a" | "b" | null = diff > 0 ? "a" : diff < 0 ? "b" : null;

      // Runs of holes won by the same side.
      if (winner && winner === runSide) run++; else { run = winner ? 1 : 0; runSide = winner; }
      if (run === 3 && runSide) push("HL-012", hole, at, runSide, { Count: "3" });

      if (diff === 0 && before !== 0) {
        const trailing: "a" | "b" = before > 0 ? "b" : "a";
        if (worst[trailing] >= 3 && !fired.has(`HL-013:${trailing}`)) { fired.add(`HL-013:${trailing}`); push("HL-013", hole, at, trailing, { Count: String(worst[trailing]) }); }
        else if (sinceSquare >= 5) push("HL-011", hole, at, "a");
      }
      if (leader && before === 0 && ledBefore[leader === "a" ? "b" : "a"]) push("HL-014", hole, at, leader);
      if (leader) ledBefore[leader] = true;
      sinceSquare = diff === 0 ? 0 : sinceSquare + 1;
      if (leader) { const behind = leader === "a" ? "b" : "a"; worst[behind] = Math.max(worst[behind], Math.abs(diff)); }

      const over = Math.abs(diff) > left || played === HOLES;
      if (over) {
        if (diff === 0) push("HL-018", hole, at, "a");
        else if (left === 0) push("HL-017", hole, at, leader!, { Margin: `${Math.abs(diff)} up` });
        else {
          const margin = `${Math.abs(diff)}&${left}`;
          push(Math.abs(diff) >= 4 || played <= 15 ? "HL-021" : "HL-019", hole, at, leader!, { Margin: margin });
        }
        break;
      }
      // Dormie and "going to the last hole" can land on the same hole: then only dormie (one buzz, the bigger news).
      const dormie = !!leader && Math.abs(diff) === left && !fired.has("HL-015");
      if (dormie) { fired.add("HL-015"); push("HL-015", hole, at, leader!, { Count: String(Math.abs(diff)) }); }
      if (left === 1 && !fired.has("HL-016")) { fired.add("HL-016"); if (!dormie) push("HL-016", hole, at, "a"); }
    }
  }
  return out;
}
