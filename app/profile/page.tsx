import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfileScreen } from "@/lib/profile/profileScreensData";
import { skipSignInWall } from "@/lib/dev/signInWall";
import { SignedOutNotice } from "@/components/auth/SignedOutNotice";
import styles from "./page.module.css";

/** Your profile (website). Loaded by loadMyProfileScreen, the same loader the app reads through /api/app/profile. */
export default async function MyProfilePage() {
  const { page, friends } = await loadMyProfileScreen();
  if (page.status === "signed-out") {
    if (!skipSignInWall()) redirect("/login");
    return <div className={styles.page}><SignedOutNotice what="profile" /></div>;
  }
  // Signed in, but setup isn't finished (no profile row yet, or no username / name): finish it here.
  if (page.status === "no-profile") return <div className={styles.page}><ProfileForm mode="setup" initial={{ displayName: page.displayName, username: "", bio: "" }} /></div>;
  return <div className={styles.page}><ProfileView profile={page.profile} friendsCount={friends} /></div>;
}
