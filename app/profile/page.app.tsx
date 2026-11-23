"use client";
import { AppOnboardingResume } from "@/components/app/AppOnboarding";
import { ProfileView } from "@/components/profile/ProfileView";
import type { MyProfilePage } from "@/lib/profile/myProfileServer";
import { useAppData } from "@/components/app/useAppData";
import { AppStatus } from "@/components/app/AppStatus";
import styles from "./page.module.css";

/** App → Profile: the website's profile page, with the same data from /api/app/profile. An unfinished account goes back to sign-up. */
export default function AppProfile() {
  const [state, reload] = useAppData<{ page: MyProfilePage; friends: number | null }>("/api/app/profile");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const { page, friends } = state.data;
  if (page.status === "signed-out") return <AppStatus state={{ status: "error", error: "Sign in to see your profile.", code: 401 }} onRetry={reload} />;
  // No profile yet = sign-up isn't finished: back to the step it stopped at (never a separate setup form).
  if (page.status === "no-profile") return <AppOnboardingResume />;
  return <div className={styles.page}><ProfileView profile={page.profile} friendsCount={friends} /></div>;
}
