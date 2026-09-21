import { validHoleDraft, type HoleSubmission, type ScoringPair } from "./holeSubmission.ts";
import { describeBlocker, liveRoundStatus, waitingOnSubmitters } from "./roundStatus.ts";
import type { MatchFormat } from "./types.ts";

/**
 * The in-memory "room" behind Tiger's Live Scoring Page Editor: two phones
 * scoring each other, with no database. It follows the same rules as the real
 * thing (a hole entry is checked, Submit Round needs every hole to match, a
 * submitted player is locked, a round is official only when both have
 * submitted) so Tiger can click through the whole lifecycle safely.
 */
export const PREVIEW_PARS = [4, 4, 5, 3, 4, 5, 3, 4, 4, 4, 3, 4, 4, 4, 5, 4, 3, 5];
const HOLES = PREVIEW_PARS.map((_, i) => ({ number: i + 1 }));
const TEAMMATES: Record<string, string> = { "cam-latto": "pete-peabody", "cade-barone": "kyle-schnabel" };

export interface PreviewRoom { submissions: HoleSubmission[]; submitted: string[] }
export interface PreviewOutcome { room: PreviewRoom; error?: string; official?: boolean; waitingOn?: string[] }

export function emptyRoom(): PreviewRoom {
  return { submissions: [], submitted: [] };
}

export function applyPreviewHole(box: ScoringPair, room: PreviewRoom, player: string, entry: HoleSubmission, submittedAt: string): PreviewOutcome {
  const inRange = Number.isInteger(entry.hole) && entry.hole >= 1 && entry.hole <= 18;
  if (!inRange || !validHoleDraft(entry, PREVIEW_PARS[entry.hole - 1], box.format)) return { room, error: "Not all information is complete." };
  if (room.submitted.includes(player)) return { room, error: "Your round is submitted. Tiger can change it." };
  const saved: HoleSubmission = { ...entry, player, submittedAt };
  return { room: { ...room, submissions: [...room.submissions.filter((row) => row.player !== player || row.hole !== entry.hole), saved] } };
}

export function applyPreviewRoundSubmit(box: ScoringPair, room: PreviewRoom, player: string): PreviewOutcome {
  let next = room;
  if (!room.submitted.includes(player)) {
    const status = liveRoundStatus(box, player, HOLES, room.submissions);
    if (status.state !== "match") return { room, error: describeBlocker(status.blocker, "your scorer") ?? "Your card doesn't match yet." };
    next = { ...room, submitted: [...room.submitted, player] };
  }
  const waitingOn = waitingOnSubmitters(box, player, next.submitted).filter((slug) => slug !== player);
  return { room: next, official: waitingOn.length === 0, waitingOn };
}

/** Players whose round is now an official record: they and everyone they need have submitted. */
export function officialPreviewPlayers(box: ScoringPair, room: PreviewRoom): string[] {
  return [...box.maroonPlayers, ...box.whitePlayers].filter((player) => room.submitted.includes(player) && waitingOnSubmitters(box, player, room.submitted).length === 0);
}

/** The preview only has one phone per side, so in Fourball/Foursome a lead player's teammate is treated as submitting along with them. */
export function expandPreviewTeammates(format: MatchFormat, submitted: string[]): string[] {
  if (format === "Singles") return submitted;
  return submitted.flatMap((slug) => (TEAMMATES[slug] ? [slug, TEAMMATES[slug]] : [slug]));
}
