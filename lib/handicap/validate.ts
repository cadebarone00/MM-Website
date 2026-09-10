import type { AssignArchiveTeesInput, SubmitHandicapRoundInput } from "./types.ts";

type ValidationResult = { ok: true } | { ok: false; error: string };

const validDirections = new Set(["left", "right", "short", "long", "penalty"]);
function isValidDirection(value: unknown): boolean {
  return value == null || (typeof value === "string" && validDirections.has(value));
}

export function validateSubmitInput(input: SubmitHandicapRoundInput): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid submission." };
  if (typeof input.courseId !== "string" || !input.courseId) return { ok: false, error: "Course is required." };
  if (typeof input.teeSetId !== "string" || !input.teeSetId) return { ok: false, error: "Tee set is required." };
  if (typeof input.datePlayed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.datePlayed)) {
    return { ok: false, error: "A valid date played is required." };
  }
  if (!Array.isArray(input.holes) || input.holes.length !== 18) {
    return { ok: false, error: "All 18 holes are required." };
  }

  const seenHoles = new Set<number>();
  for (const hole of input.holes) {
    if (!hole || typeof hole !== "object") return { ok: false, error: "Invalid hole entry." };
    if (typeof hole.hole !== "number" || hole.hole < 1 || hole.hole > 18) {
      return { ok: false, error: "Invalid hole number." };
    }
    if (seenHoles.has(hole.hole)) {
      return { ok: false, error: `Hole ${hole.hole} was entered more than once.` };
    }
    seenHoles.add(hole.hole);
    if (typeof hole.score !== "number" || !Number.isInteger(hole.score) || hole.score < 1) {
      return { ok: false, error: `Hole ${hole.hole} needs a score.` };
    }
    if (typeof hole.putts !== "number" || !Number.isInteger(hole.putts) || hole.putts < 0) {
      return { ok: false, error: `Hole ${hole.hole} needs a valid putts count.` };
    }
    if (!isValidDirection(hole.firDirection)) {
      return { ok: false, error: `Hole ${hole.hole} has an invalid fairway direction.` };
    }
    if (!isValidDirection(hole.girDirection)) {
      return { ok: false, error: `Hole ${hole.hole} has an invalid green direction.` };
    }
  }
  if (seenHoles.size !== 18) return { ok: false, error: "All 18 holes are required." };

  return { ok: true };
}

export function validateAssignArchiveTeesInput(input: AssignArchiveTeesInput): ValidationResult {
  if (!input || typeof input !== "object") return { ok: false, error: "Invalid submission." };
  if (typeof input.tournamentSlug !== "string" || !input.tournamentSlug) return { ok: false, error: "Tournament is required." };
  if (typeof input.round !== "number" || !Number.isInteger(input.round) || input.round < 1) return { ok: false, error: "Invalid round number." };
  if (typeof input.courseId !== "string" || !input.courseId) return { ok: false, error: "Course is required." };
  if (typeof input.teeSetId !== "string" || !input.teeSetId) return { ok: false, error: "Tee set is required." };
  if (typeof input.datePlayed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.datePlayed)) {
    return { ok: false, error: "A valid date played is required." };
  }
  return { ok: true };
}
