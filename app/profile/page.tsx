import { redirect } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfile } from "@/lib/profile/myProfileServer";

export default async function MyProfilePage() {
  const profile = await loadMyProfile();
  if (!profile) redirect("/login");
  return <ProfileView profile={profile} />;
}
