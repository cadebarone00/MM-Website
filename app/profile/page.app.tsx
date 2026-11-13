"use client";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { ProfileView } from "@/components/profile/ProfileView";
import type { MyProfilePage } from "@/lib/profile/myProfileServer";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";
import styles from "./page.module.css";

/** App → Profile: the website's profile page, with the same data from /api/app/profile. */
export default function AppProfile() {
  const [state, reload] = useAppData<{ page: MyProfilePage; friends: number | null }>("/api/app/profile");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const { page, friends } = state.data;
  if (page.status === "signed-out") return <AppStatus state={{ status: "error", error: "Sign in to see your profile.", code: 401 }} onRetry={reload} />;
  if (page.status === "no-profile") return <div className={styles.page}><ProfileForm mode="setup" initial={{ displayName: page.displayName, username: "", bio: "" }} /></div>;
  return <div className={styles.page}><ProfileView profile={page.profile} friendsCount={friends} /></div>;
}
