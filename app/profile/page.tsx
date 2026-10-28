import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileView } from "@/components/profile/ProfileView";
import { loadMyProfile } from "@/lib/profile/myProfileServer";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { friendCount } from "@/lib/profile/friendsServer";
import { skipSignInWall } from "@/lib/dev/signInWall";
import { SignedOutNotice } from "@/components/auth/SignedOutNotice";
import styles from "./page.module.css";

export default async function MyProfilePage() {
  const page = await loadMyProfile();
  if (page.status === "signed-out") {
    if (!skipSignInWall()) redirect("/login");
    return <div className={styles.page}><SignedOutNotice what="profile" /></div>;
  }
  // Signed in, but setup isn't finished (no profile row yet, or no username / name): finish it here.
  if (page.status === "no-profile") return <div className={styles.page}><ProfileForm mode="setup" initial={{ displayName: page.displayName, username: "", bio: "" }} /></div>;
  const current = await getCurrentProfile();
  const friends = current.status === "ok" ? await friendCount(current.profile.profileId).catch(() => null) : null;
  return <div className={styles.page}><ProfileView profile={page.profile} friendsCount={friends} /></div>;
}
