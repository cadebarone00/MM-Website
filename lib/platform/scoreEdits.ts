import { buildPlayerRound, type EditableField, type PlayerRound, type ScoreEdit, type ShotResult } from "./playerRounds";
import { mismatchedHoles, type LiveCard } from "./liveCards";

/**
 * Organizer fixes (Player & Attest add-on, decisions 9–10). Players can never change a submitted round; the trip or
 * tournament organizer can, with a reason, and every change is kept in the round's `edits` log. Fixed rounds still
 * count toward handicap (decision 14), so `enteredBy` stays "player" and the differential is recomputed.
 */
const SHOTS: ShotResult[] = ["up", "left", "center", "right", "down"];
export interface OverrideInput { hole: number; field: EditableField; to: number | ShotResult | null; byProfileId: string; at: string; reason: string }

export function overrideHole(round: PlayerRound, input: OverrideInput): PlayerRound {
  if (round.source === "personal") throw new Error("Personal rounds have no organizer.");
  const reason = input.reason.trim();
  if (!reason) throw new Error("Add a reason for the change.");
  const hole = round.holes.find((h) => h.number === input.hole);
  if (!hole) throw new Error(`Hole ${input.hole} isn't on this card.`);
  const { field, to } = input;
  if (field === "strokes" && !(typeof to === "number" && Number.isInteger(to) && to >= 1 && to <= 20)) throw new Error("Strokes must be 1–20.");
  if (field === "putts" && to !== null && !(typeof to === "number" && Number.isInteger(to) && to >= 0 && to <= 10)) throw new Error("Putts must be 0–10.");
  if ((field === "fairway" || field === "green") && to !== null && !SHOTS.includes(to as ShotResult)) throw new Error("Pick where the shot finished.");
  if (field === "fairway" && hole.par === 3) throw new Error("There's no fairway on a par 3.");
  const from = hole[field];
  if (from === to) throw new Error("That's already the value.");
  const edit: ScoreEdit = { hole: input.hole, field, from, to, byProfileId: input.byProfileId, at: input.at, reason, kind: "override" };
  return buildPlayerRound({ ...round, holes: round.holes.map((h) => h.number === input.hole ? { ...h, [field]: to } : h), edits: [...(round.edits ?? []), edit] });
}

export type PushChoice = "player" | "attester";

/** A card that can't be submitted (scores don't match): the organizer picks whose strokes count on each mismatched hole. */
export function pushThrough(card: LiveCard, choices: Record<number, PushChoice>, byProfileId: string, at: string, reason: string): { strokes: number[]; edits: ScoreEdit[] } {
  const why = reason.trim();
  if (!why) throw new Error("Add a reason for the push-through.");
  const mismatched = mismatchedHoles(card);
  if (!mismatched.length) throw new Error("Nothing to push through: the scores already match.");
  const missing = mismatched.filter((n) => !choices[n]);
  if (missing.length) throw new Error(`Pick a score for hole ${missing.join(", ")}.`);
  const edits: ScoreEdit[] = [];
  const strokes = card.holes.map((h) => {
    if (!mismatched.includes(h.number)) {
      if (h.strokes === null) throw new Error(`Hole ${h.number} has no score.`);
      return h.strokes;
    }
    const pick = choices[h.number] === "player" ? h.strokes : h.attestStrokes;
    if (pick === null) throw new Error(`Hole ${h.number}: that score wasn't entered.`);
    edits.push({ hole: h.number, field: "strokes", from: h.strokes, to: pick, byProfileId, at, reason: why, kind: "pushThrough" });
    return pick;
  });
  return { strokes, edits };
}

/** Decision 9: changes an organizer made to their own round, which everyone on the trip can see. */
export const organizerOwnEdits = (rounds: PlayerRound[]) =>
  rounds.flatMap((round) => (round.edits ?? []).filter((edit) => edit.byProfileId === round.profileId).map((edit) => ({ round, edit })));
