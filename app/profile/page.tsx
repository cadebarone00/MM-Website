import { redirect } from "next/navigation";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfile } from "@/lib/profile/myProfileServer";
import styles from "./page.module.css";

export default async function MyProfilePage() {
  const page = await loadMyProfile();
  if (page.status === "signed-out") redirect("/login");
  if (page.status === "no-profile") return <div className={styles.page}><p className="px-5 pt-24 text-center text-maroon-900/70">Finish setting up your profile to see it here.</p></div>;
  return <div className={styles.page}><ProfileView profile={page.profile} /></div>;
}
