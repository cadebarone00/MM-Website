/** Result of the platform-admin check (requirePlatformAdmin.ts). Pure, so it can be tested without Supabase. */
export type PlatformAdminCheck = { status: "signed-out" } | { status: "forbidden" } | { status: "ok"; userId: string };

/** Only the exact value "admin" counts; anything else (null, "Admin", "host") is forbidden. */
export function platformAdminCheck(sessionUserId: string | null, platformRole: string | null): PlatformAdminCheck {
  if (!sessionUserId) return { status: "signed-out" };
  return platformRole === "admin" ? { status: "ok", userId: sessionUserId } : { status: "forbidden" };
}
