/**
 * Short course names for tight spots (Live Activity, Dynamic Island, Android chip). Spec: project_specs.md → "Short
 * course names". The full name still shows wherever there's room; the organizer can type their own short name.
 */

/** Longest short name the organizer can type (and what the automatic one aims for). */
export const COURSE_SHORT_NAME_MAX = 24;

// Filler that adds nothing at a glance, longest first so "Golf & Country Club" goes before "Country Club".
const FILLER = [
  "golf and country club", "golf & country club", "golf resort and spa", "golf resort & spa", "resort and spa", "resort & spa",
  "country club", "golf club", "golf course", "golf links", "golf resort", "golf & spa", "golf center", "golf centre",
  "tournament course", "championship course", "resort", "course", "golf", "club", "cc", "gc",
];
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FILLER_PATTERN = new RegExp(`(^|\\s)(${FILLER.map(escape).join("|")})(?=\\s|$)`, "gi");

/** ALL-CAPS words read as shouting: "THE PLAYERS" → "Players"; short acronyms (TPC, PGA, GC) stay as they are. */
const calmCaps = (text: string) => text.replace(/\b[A-Z]{4,}\b/g, word => word[0] + word.slice(1).toLowerCase());

function tidy(part: string): string {
  let text = calmCaps(part).replace(FILLER_PATTERN, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/^the\s+/i, "").replace(/[\s,&-]+$/, "").trim();
  return text;
}

/**
 * The automatic short name: filler words removed ("Golf Club", "Country Club", "Resort & Spa", a leading "The" …).
 * "Club – Course" names keep both parts when they fit 24 letters ("Pinehurst No. 2"), otherwise the named course alone
 * ("Pacific Dunes"). Never longer than the full name; falls back to the full name when nothing is left.
 */
export function courseShortName(fullName: string): string {
  const full = fullName.replace(/\s+/g, " ").trim();
  if (!full) return "";
  const [club, ...rest] = full.split(/\s+[–—-]\s+|\s*[:,]\s+/).map(tidy).filter(Boolean);
  const course = rest.join(" ");
  const together = [club, course].filter(Boolean).join(" ");
  const candidates = [together, course.split(" ").length >= 2 ? course : "", club ?? ""].filter(Boolean);
  const fits = candidates.find(name => name.length <= COURSE_SHORT_NAME_MAX);
  return fits ?? candidates[0] ?? full;
}

/** What tight spots show: the organizer's short name when set, otherwise the automatic one. */
export function courseDisplayName(fullName: string, shortName?: string | null): string {
  const typed = shortName?.replace(/\s+/g, " ").trim().slice(0, COURSE_SHORT_NAME_MAX);
  return typed || courseShortName(fullName);
}
