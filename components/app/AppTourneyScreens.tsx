"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { JoinTournamentPage } from "@/components/platform/JoinTournamentPage";
import { MyPlayingTournamentsPage } from "@/components/platform/MyPlayingTournamentsPage";
import { MyTournamentsPage } from "@/components/platform/MyTournamentsPage";
import type { MyPastTournaments } from "@/lib/platform/pastTournamentsServer";
import type { OrganizerHomeData, TourneysHomeData } from "@/lib/platform/tourneyScreensData";
import joinStyles from "@/app/tournaments/join/page.module.css";
import { useAppData } from "./useAppData";
import { AppStatus } from "./AppStatus";

/** The app's Tourneys, My Tournaments and organizer-home screens: the website's views, with data from /api/app/tourneys. */
export function AppTourneysHome() {
  const [state, reload] = useAppData<TourneysHomeData>("/api/app/tourneys?view=join");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  return <div className={joinStyles.pageHeader}><JoinTournamentPage {...state.data} /></div>;
}

export function AppMyPlaying() {
  const [state, reload] = useAppData<MyPastTournaments>("/api/app/tourneys?view=mine");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  return <MyPlayingTournamentsPage mine={state.data} />;
}

export function AppOrganizerHome() {
  const router = useRouter();
  const [state, reload] = useAppData<OrganizerHomeData>("/api/app/tourneys?view=organizer");
  const signedOut = state.status === "ok" && !state.data.signedIn;
  useEffect(() => { if (signedOut) router.replace("/start/"); }, [signedOut, router]);
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  return state.data.signedIn ? <MyTournamentsPage {...state.data} /> : null;
}
