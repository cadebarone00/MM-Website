import type { SubmitHandicapRoundInput } from "./types.ts";

type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateSubmitInput(input: SubmitHandicapRoundInput): ValidationResult {
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
    if (typeof hole.hole !== "number" || hole.hole < 1 || hole.hole > 18) {
      return { ok: false, error: "Invalid hole number." };
    }
    if (seenHoles.has(hole.hole)) {
      return { ok: false, error: `Hole ${hole.hole} was entered more than once.` };
    }
    seenHoles.add(hole.hole);
    if (typeof hole.score !== "number" || hole.score < 1) {
      return { ok: false, error: `Hole ${hole.hole} needs a score.` };
    }
    if (typeof hole.putts !== "number" || hole.putts < 0) {
      return { ok: false, error: `Hole ${hole.hole} needs a valid putts count.` };
    }
  }
  if (seenHoles.size !== 18) return { ok: false, error: "All 18 holes are required." };

  return { ok: true };
}
