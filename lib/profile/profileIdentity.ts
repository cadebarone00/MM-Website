/**
 * The golfer's identity. ACCOUNT (Supabase auth) = login only; PROFILE = the person. `profileId` is profiles.id —
 * the permanent profile_id every golf / product record should point at. It equals the owning login account's id
 * (one account, one profile — supabase/profile_identity.sql), so the lookup is always direct, never by email,
 * username, name or player_slug. Teams are never part of a profile: they belong to a trip / edition roster.
 */

/** profiles.id. A plain string at runtime; the name says which id it is. */
export type ProfileId = string;

export interface ProfileIdentity {
  profileId: ProfileId;
  displayName: string;
  username: string;
  email: string;
  /**
   * LEGACY COMPATIBILITY ONLY: the old Maroon player slot this profile claimed (profiles.player_slug), used to find
   * pre-platform Maroon data (scorecards, bios, handicap rounds, live scoring). Optional, and never the identity.
   */
  legacyMaroonPlayerSlug: string | null;
}

export function profileIdentityFromRow(row: Record<string, unknown> | null | undefined): ProfileIdentity | null {
  if (!row || typeof row.id !== "string") return null;
  const text = (value: unknown) => typeof value === "string" ? value : "";
  return {
    profileId: row.id, displayName: text(row.display_name), username: text(row.username), email: text(row.email),
    legacyMaroonPlayerSlug: typeof row.player_slug === "string" && row.player_slug ? row.player_slug : null,
  };
}
