import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { loadEditProfile } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Edit profile | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Edit profile: your name, username and bio (everyone). Signed out → Log In; no profile yet → finish setup on /profile. */
export default async function EditProfilePage() {
  const data = await loadEditProfile();
  if (data.status === "signed-out") redirect("/login");
  if (data.status !== "ok") redirect("/profile");
  return <ProfileForm mode="edit" initial={data.form} />;
}
