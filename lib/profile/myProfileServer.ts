import { getCurrentProfile } from "./currentProfile";
import type { ProfileReadModel } from "./profileReadModel";
import { loadProfileReadModel } from "./profileReadModelServer";

/** "no-profile" = Finish setup is needed (no profile row yet, or one without a username / name); `displayName` prefills
 *  the form when an admin player invitation already supplied the real name. */
export type MyProfilePage = { status: "signed-out" } | { status: "no-profile"; displayName: string } | { status: "ok"; profile: ProfileReadModel };

/**
 * /profile: the signed-in person's own profile read model — viewer and subject are the same profile, taken from the
 * session only (never the request). Everything is loaded by lib/profile/profileReadModelServer.ts.
 */
export async function loadMyProfile(): Promise<MyProfilePage> {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return { status: "signed-out" };
  if (current.status !== "ok") return { status: "no-profile", displayName: current.status === "incomplete" ? current.displayName ?? "" : "" };
  const profile = await loadProfileReadModel(current.profile.profileId, current.profile.profileId);
  return profile ? { status: "ok", profile } : { status: "no-profile", displayName: "" };
}
