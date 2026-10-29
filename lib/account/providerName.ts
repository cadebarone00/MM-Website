/**
 * Phase 7C — the first / last name Google or Apple supplied, to PREFILL the Name screen (pure, unit tested). Only a
 * suggestion: the person can edit it, and the Name step itself only ever saves a profile whose name is still missing
 * (complete_my_profile), so an existing profile's name is never overwritten. Google gives given_name / family_name and
 * full_name; Apple gives a name only on the very first sign-in (Supabase keeps it as full_name), and none for later ones.
 */
import { NAME_MAX } from "@/lib/profile/profileEdit";

type Metadata = Record<string, unknown> | null | undefined;
const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");
const clip = (value: string) => value.slice(0, NAME_MAX);

export function providerNameParts(metadata: Metadata): { first: string; last: string } {
  const given = text(metadata?.given_name), family = text(metadata?.family_name);
  if (given || family) return { first: clip(given), last: clip(family) };
  const full = text(metadata?.full_name) || text(metadata?.name);
  if (!full || full.includes("@")) return { first: "", last: "" }; // some providers put the email in `name`
  const [first, ...rest] = full.split(" ");
  return { first: clip(first), last: clip(rest.join(" ")) };
}
