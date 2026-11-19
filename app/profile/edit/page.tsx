import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EditProfileScreen } from "@/components/profile/EditProfileScreen";
import { loadEditProfile } from "@/lib/profile/profileScreensData";

export const metadata: Metadata = { title: "Edit profile | The Maroon", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Edit profile (Instagram-style, 2026-11-13): photo + avatar, name, username, bio, links, gender, Private profile.
 *  Signed out → Log In; no profile yet → finish setup on /profile. */
export default async function EditProfilePage() {
  const data = await loadEditProfile();
  if (data.status === "signed-out") redirect("/login");
  if (data.status !== "ok") redirect("/profile");
  return <EditProfileScreen initial={data.form} />;
}
