import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EditProfileScreen } from "@/components/profile/EditProfileScreen";
import { getMyRoundsVisibility } from "@/lib/platform/playerRoundsServer";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { getMyProfileForm } from "@/lib/profile/profileEditServer";
import { myPhotoPath, profilePhotoUrl } from "@/lib/profile/profilePhoto";

export const metadata: Metadata = { title: "Edit profile | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Edit profile (Instagram-style, 2026-11-13): photo + avatar, name, username, bio, links, gender, Private profile.
 *  Signed out → Log In; no profile yet → finish setup on /profile. */
export default async function EditProfilePage() {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") redirect("/login");
  if (current.status !== "ok") redirect("/profile");
  const profileId = current.profile.profileId;
  const [form, photo, privacy] = await Promise.all([getMyProfileForm(profileId), myPhotoPath(profileId), getMyRoundsVisibility(profileId)]);
  if (!form) redirect("/profile");
  return <EditProfileScreen initial={{
    ...form, photoUrl: profilePhotoUrl(photo.path), photoAvailable: photo.installed,
    visibility: privacy.status === "ok" ? privacy.visibility : null,
  }} />;
}
