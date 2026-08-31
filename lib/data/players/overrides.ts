import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { PlayerProfile } from "../types";

// Every PlayerProfile field a player can propose a change to — everything
// shown on their public bio (PlayerBioSection) plus their photo. `id`,
// `slug`, and `fullName` are structural/identity fields and are never
// editable through this system.
export const EDITABLE_PLAYER_FIELDS = [
  "bio",
  "avatarSrc",
  "history",
  "instagram",
  "linkedin",
  "nickname",
  "classYear",
  "major",
  "occupation",
  "hometown",
  "residence",
  "playsFrom",
  "status",
  "clubGolfYears",
  "college",
  "height",
  "weight",
  "age",
  "birthday",
  "handicap",
  "rankingNotes",
  "debut",
  "debutLocation",
  "strengths",
  "careerHighlights",
  "personal",
  "hobbies",
  "goals",
  "misc",
] as const;

export type EditableField = (typeof EDITABLE_PLAYER_FIELDS)[number];

export function isEditableField(field: string): field is EditableField {
  return (EDITABLE_PLAYER_FIELDS as readonly string[]).includes(field);
}

export function mergeProfile(base: PlayerProfile, overrides: Partial<PlayerProfile>): PlayerProfile {
  return { ...base, ...overrides };
}

/** Reads every approved override for one player. Public data — no auth required to call this. */
export async function getProfileOverrides(playerSlug: string): Promise<Partial<PlayerProfile>> {
  const service = createSupabaseServiceRoleClient();
  const { data } = await service.from("player_profile_overrides").select("field, value").eq("player_slug", playerSlug);

  const overrides: Record<string, unknown> = {};
  for (const row of data ?? []) {
    if (isEditableField(row.field)) {
      overrides[row.field] = row.value;
    }
  }
  return overrides as Partial<PlayerProfile>;
}
