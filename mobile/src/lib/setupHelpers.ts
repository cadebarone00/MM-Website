/** Small pure helpers for the round setup screens (tested in setupHelpers.test.ts). */

/** A day as the server stores it ("2026-11-24"), in the phone's own time zone. */
export function dayText(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "2026-11-24" → that day at noon (noon so no time zone can move it to another day). Bad text → today. */
export function dayDate(text: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** A guest's id, unique within the round (website newGuestId). */
export const newGuestId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A guest's name as kept: trimmed, at most 40 characters. */
export const guestName = (text: string) => text.trim().slice(0, 40);

/** Tapping a hole in the side-game hole picker: add it (kept in order) or take it out. */
export function toggleHole(selected: number[], hole: number): number[] {
  return selected.includes(hole) ? selected.filter((n) => n !== hole) : [...selected, hole].sort((a, b) => a - b);
}

/** The scorecard a player built by hand at a course is remembered by course ref (website maroonBuiltCourses). */
export function builtParsFor(text: string | null, ref: string): number[] | undefined {
  try {
    const all = JSON.parse(text ?? "{}") as Record<string, unknown>;
    const par = all[ref];
    return Array.isArray(par) && par.every((p) => typeof p === "number") ? par : undefined;
  } catch {
    return undefined;
  }
}
