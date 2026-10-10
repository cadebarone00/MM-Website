import { getCurrentProfile } from "./currentProfile";
import type { ProfileReadModel } from "./profileReadModel";
import { loadProfileReadModel } from "./profileReadModelServer";

export type MyProfilePage = { status: "signed-out" } | { status: "no-profile" } | { status: "ok"; profile: ProfileReadModel };

/**
 * /profile: the signed-in person's own profile read model — viewer and subject are the same profile, taken from the
 * session only (never the request). Everything is loaded by lib/profile/profileReadModelServer.ts.
 */
export async function loadMyProfile(): Promise<MyProfilePage> {
  const current = await getCurrentProfile();
  if (current.status !== "ok") return { status: current.status };
  const profile = await loadProfileReadModel(current.profile.profileId, current.profile.profileId);
  return profile ? { status: "ok", profile } : { status: "no-profile" };
}
