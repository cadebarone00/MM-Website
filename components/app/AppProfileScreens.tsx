"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FindGolfers } from "@/components/profile/FindGolfers";
import { FriendsList } from "@/components/profile/FriendsList";
import { ProfileView } from "@/components/profile/ProfileView";
import { ContentTeamView, DeleteAccountView } from "@/components/settings/SettingsSubpages";
import type { ContentTeamData, DeleteAccountData, FindGolfersData, FriendsData, PublicProfileData } from "@/lib/profile/profileScreensData";
import { useAppData } from "./useAppData";
import { AppStatus } from "./AppStatus";
import profileStyles from "@/app/profile/page.module.css";

/** The app's Profile extras: the website's screens, each with the same data from /api/app/profile?view=…. */
const signInAgain = { status: "error" as const, error: "Sign in again to see this.", code: 401 };

export function AppFindGolfers() {
  const [state, reload] = useAppData<FindGolfersData>("/api/app/profile?view=search");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (state.data.status !== "ok") return <AppStatus state={signInAgain} onRetry={reload} />;
  return <FindGolfers incoming={state.data.incoming} setupMessage={state.data.setupMessage} />;
}

export function AppFriends() {
  const [state, reload] = useAppData<FriendsData>("/api/app/profile?view=friends");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (state.data.status !== "ok") return <AppStatus state={signInAgain} onRetry={reload} />;
  return <FriendsList friends={state.data.friends} />;
}

function PublicProfile() {
  const router = useRouter();
  const username = useSearchParams().get("username") ?? "";
  const [state, reload] = useAppData<PublicProfileData>(username ? `/api/app/profile?view=user&username=${encodeURIComponent(username)}` : null);
  const self = state.status === "ok" && state.data.status === "self";
  useEffect(() => { if (self) router.replace("/profile/"); }, [self, router]);
  if (!username) return <AppStatus state={{ status: "error", error: "That profile wasn't found.", code: 404 }} onRetry={reload} />;
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (state.data.status === "not-found") return <AppStatus state={{ status: "error", error: "That profile wasn't found.", code: 0 }} onRetry={reload} />;
  if (state.data.status === "self") return null;
  return <div className={profileStyles.page}><ProfileView profile={state.data.profile} friendsCount={state.data.friends} friendship={state.data.friendship} /></div>;
}
export function AppPublicProfile() {
  return <Suspense><PublicProfile /></Suspense>;
}

export function AppDeleteAccount() {
  const [state, reload] = useAppData<DeleteAccountData>("/api/app/profile?view=delete");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (state.data.status !== "ok") return <AppStatus state={signInAgain} onRetry={reload} />;
  return <DeleteAccountView preview={state.data.preview} />;
}

export function AppContentTeam() {
  const [state, reload] = useAppData<ContentTeamData>("/api/app/profile?view=content-team");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  if (state.data.status !== "ok") return <AppStatus state={{ status: "error", error: "Only Content Admins can open the content team.", code: 0 }} onRetry={reload} />;
  return <ContentTeamView members={state.data.members} sample={state.data.sample} />;
}
