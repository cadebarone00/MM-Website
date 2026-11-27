/**
 * A saved trip round's matches, from the trip setup (pure, unit-tested; project_specs.md "Expo app Step 6", part 6f).
 * The round's slot (tripSchedule: round number → "day-slot" key) holds its competition settings (`compFormats`) and its
 * matches (`teeMatches[slot][match] = { a: [player numbers], b: [player numbers] }`). Player numbers are places in the
 * trip's members in join order (the order the setup editors use; same reading as the tee-time reminders). Only Match Play
 * rounds have matches; a match with an empty side or a place with no account is skipped.
 */
import type { MatchSetup } from "@/lib/highlights/detect/matchMoments";
import { defaultRoundComp, playersPerSide, type RoundCompSettings } from "./roundCompetition";
import type { SetupBasis } from "./savedTripSetup";
import { tripSchedule } from "./tripScheduleView";

export function tripRoundMatches(values: Record<string, unknown>, basis: SetupBasis, roundNumber: number, placeIds: (string | null)[]): MatchSetup[] {
  const slot = tripSchedule(values, basis).slots.find((s) => s.number === roundNumber);
  if (!slot) return [];
  const comp = (values.compFormats as Record<string, RoundCompSettings> | undefined)?.[slot.key] ?? defaultRoundComp(0);
  if (comp.matchType !== "Match Play") return [];
  const format = playersPerSide(comp.format) >= 2 ? "fourball" : "singles";
  const matches = (values.teeMatches as Record<string, Record<string, { a?: (number | null)[]; b?: (number | null)[] }>> | undefined)?.[slot.key] ?? {};
  const ids = (places: (number | null)[] | undefined) => (places ?? []).flatMap((p) => (Number.isInteger(p) && placeIds[p as number] ? [placeIds[p as number] as string] : []));
  return Object.entries(matches)
    .map(([index, sides]) => ({ index: Number(index), format, a: ids(sides?.a), b: ids(sides?.b) }) satisfies MatchSetup)
    .filter((m) => Number.isInteger(m.index) && m.a.length > 0 && m.b.length > 0)
    .sort((x, y) => x.index - y.index);
}
