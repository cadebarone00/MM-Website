import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { getMyProfileForm } from "@/lib/profile/profileEditServer";

export const metadata: Metadata = { title: "Edit profile | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Edit profile: your name, username and bio (everyone). Signed out → Log In; no profile yet → finish setup on /profile. */
export default async function EditProfilePage() {
  const current = await getCurrentProfile();
  if (current.status === "signed-out") redirect("/login");
  if (current.status === "no-profile") redirect("/profile");
  const form = await getMyProfileForm(current.profile.profileId);
  if (!form) redirect("/profile");
  return <ProfileForm mode="edit" initial={form} />;
}
