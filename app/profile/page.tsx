import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfile } from "@/lib/profile/myProfileServer";
import styles from "./page.module.css";

export default async function MyProfilePage() {
  const page = await loadMyProfile();
  if (page.status === "signed-out") redirect("/login");
  // Signed in, but the profile row was never made (signup stopped half-way): finish it here.
  if (page.status === "no-profile") return <div className={styles.page}><ProfileForm mode="setup" initial={{ displayName: "", username: "", bio: "" }} /></div>;
  return <div className={styles.page}><ProfileView profile={page.profile} /></div>;
}
