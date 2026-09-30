/**
 * What a plan unlocks, and who may create a tournament
 * (THE_MAROON_PRODUCT_SPEC.md §14). No prices here: plans only list
 * features. Anything a plan doesn't explicitly grant is off, so a typo or a
 * brand-new feature can never be switched on by accident.
 */
export const ENTITLEMENTS = ["custom_branding", "broadcast", "wagers", "fantasy", "custom_domain"] as const;
export type Entitlement = (typeof ENTITLEMENTS)[number];

/** Reads a platform_plans.entitlements value (untrusted jsonb). */
export function hasEntitlement(planEntitlements: unknown, entitlement: Entitlement): boolean {
  if (planEntitlements === null || typeof planEntitlements !== "object" || Array.isArray(planEntitlements)) return false;
  return (planEntitlements as Record<string, unknown>)[entitlement] === true;
}

/** Player cap from a plan; null = no cap. */
export function maxPlayers(planEntitlements: unknown): number | null {
  const value = (planEntitlements as Record<string, unknown> | null)?.max_players;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export type CreationMode = "invite_only" | "self_serve";
export type CreatorAccessStatus = "requested" | "approved" | "revoked" | null;

/**
 * V1 is invite-only: platform admins always can, anyone else needs an
 * approved request. Switching platform_settings to 'self_serve' opens it
 * to every signed-in user, except anyone whose access was revoked.
 */
export function canCreateTournament(input: {
  signedIn: boolean;
  platformRole: string | null;
  creationMode: CreationMode;
  accessStatus: CreatorAccessStatus;
}): boolean {
  if (!input.signedIn) return false;
  if (input.platformRole === "admin") return true;
  if (input.accessStatus === "revoked") return false;
  if (input.creationMode === "self_serve") return true;
  return input.accessStatus === "approved";
}
