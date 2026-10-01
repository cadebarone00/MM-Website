import { redirect } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfile } from "@/lib/profile/myProfileServer";
import styles from "./page.module.css";

export default async function MyProfilePage() {
  const profile = await loadMyProfile();
  if (!profile) redirect("/login");
  return <div className={styles.page}><ProfileView profile={profile} /></div>;
}
