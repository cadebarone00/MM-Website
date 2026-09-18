import type { MatchFormat } from "./types";
import type { RecapHoleRow } from "@/lib/portal/roundRecap";

export type ShotChoice = "hit" | "long" | "short" | "left" | "right" | "penalty";
export type HoleDraft = { ownScore: number; opponentScore: number; putts: number | null; fairway: ShotChoice | null; green: ShotChoice | null };
export type HoleSubmission = HoleDraft & { player: string; hole: number; submittedAt: string };
export type ScoringPair = { format: MatchFormat; maroonPlayers: string[]; whitePlayers: string[] };
export type HoleSubmissionStatus = "empty" | "submitted" | "confirmed" | "disputed";

export function validHoleDraft(value: unknown, par: number, format: MatchFormat): value is HoleDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as HoleDraft;
  if (![d.ownScore, d.opponentScore].every((n) => Number.isInteger(n) && n > 0)) return false;
  if (format === "Foursome") return true;
  const directions = ["hit", "long", "short", "left", "right", "penalty"];
  return d.putts !== null && Number.isInteger(d.putts) && d.putts >= 0 && d.putts <= d.ownScore
    && (par === 3 || directions.includes(d.fairway ?? "")) && directions.includes(d.green ?? "");
}

export function scoringSides(box: ScoringPair, player: string) {
  const maroon = box.maroonPlayers.includes(player);
  const own = maroon ? box.maroonPlayers : box.whitePlayers;
  const other = maroon ? box.whitePlayers : box.maroonPlayers;
  const index = own.indexOf(player);
  return { maroon, own, opponents: index < 0 ? [] : box.format === "Foursome" ? other : other.slice(index, index + 1) };
}

export function submittedPair(box: ScoringPair, player: string, hole: number, submissions: HoleSubmission[]) {
  const { own, opponents } = scoringSides(box, player);
  const latest = (players: string[]) => submissions.filter((s) => s.hole === hole && players.includes(s.player))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  return { mine: latest(box.format === "Foursome" ? own : [player]), other: latest(opponents) };
}

export function holeSubmissionStatus(box: ScoringPair, player: string, hole: number, submissions: HoleSubmission[]): HoleSubmissionStatus {
  const { mine, other } = submittedPair(box, player, hole, submissions);
  if (!mine) return "empty";
  if (!other) return "submitted";
  return mine.ownScore === other.opponentScore && mine.opponentScore === other.ownScore ? "confirmed" : "disputed";
}

export function sameHoleDraft(a: HoleDraft, b: HoleDraft, par: number, format: MatchFormat) {
  return a.ownScore === b.ownScore && a.opponentScore === b.opponentScore
    && (format === "Foursome" || (a.putts === b.putts && a.green === b.green && (par === 3 || a.fairway === b.fairway)));
}

/** Maps one player's submitted holes into Round Recap rows. Alternate Shot never collects putts/fairway/green, so those come back null (not applicable) even on an entered hole; fairway is also null on a par 3. */
export function buildRecapRows(holes: { number: number; par: number; yards: number }[], player: string, submissions: HoleSubmission[], format: MatchFormat): RecapHoleRow[] {
  return holes.map((hole) => {
    const entry = submissions.filter((s) => s.hole === hole.number && s.player === player).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
    const isFoursome = format === "Foursome";
    const par3 = hole.par === 3;
    const shot = (choice: ShotChoice | null): { hit: boolean | null; direction: RecapHoleRow["firDirection"] } =>
      choice == null ? { hit: null, direction: null } : { hit: choice === "hit", direction: choice === "hit" ? null : choice };
    const fairway = !entry || isFoursome || par3 ? { hit: null, direction: null } : shot(entry.fairway);
    const green = !entry || isFoursome ? { hit: null, direction: null } : shot(entry.green);
    return {
      hole: hole.number,
      par: hole.par,
      yards: hole.yards,
      score: entry?.ownScore ?? null,
      putts: !entry || isFoursome ? null : entry.putts,
      fir: fairway.hit,
      firDirection: fairway.direction,
      gir: green.hit,
      girDirection: green.direction,
    };
  });
}
