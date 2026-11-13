"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TournamentHomeScreen } from "@/components/platform/play/TournamentHomeScreen";
import { PlayLeaderboard, PlayMatches, PlayMore, PlayPlayers } from "@/components/platform/play/PlayTabs";
import { TournamentSiteView } from "@/components/platform/TournamentSiteView";
import { TournamentPreviewView } from "@/components/platform/TournamentPreviewView";
import { NextYearView, StudioDashboardView } from "@/components/tournament-dashboard/StudioViews";
import { isPublicPage, publicBasePath, type PublicTournament } from "@/lib/platform/publicSite";
import type { TournamentHome } from "@/lib/platform/tournamentHome";
import type { TournamentPreview } from "@/lib/platform/publicSiteServer";
import type { NextYearData, StudioData } from "@/lib/platform/tournamentScreensData";
import { useAppData } from "./useAppData";
import { AppStatus } from "./AppStatus";

/**
 * The app's tournament screens (project_specs.md "The Maroon iPhone app — Phase 2"): Play's league home and tabs, a
 * tournament's public site, and the organizer's studio (setup, start next year, preview) — the website's components,
 * with the same data from /api/app/tournament. Addresses carry the slug and year in the query (lib/app/appPaths.ts).
 */
const notFound = { status: "error" as const, error: "That tournament wasn't found.", code: 0 };

function useTournament<T>(kind: string) {
  const query = useSearchParams();
  const slug = query.get("tournament") ?? "", year = query.get("year") ?? "", section = query.get("section") ?? undefined;
  const path = slug ? `/api/app/tournament?kind=${kind}&tournament=${encodeURIComponent(slug)}&year=${encodeURIComponent(year)}` : null;
  const [state, reload] = useAppData<T>(path);
  return { slug, year, section, state, reload };
}

function Play() {
  const { section, state, reload } = useTournament<TournamentHome>("play");
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const home = state.data;
  return section === "leaderboard" ? <PlayLeaderboard home={home} /> : section === "matches" ? <PlayMatches home={home} />
    : section === "players" ? <PlayPlayers home={home} /> : section === "more" ? <PlayMore home={home} /> : <TournamentHomeScreen home={home} />;
}

function PublicSite() {
  const router = useRouter();
  const query = useSearchParams();
  const slug = query.get("tournament") ?? "", year = query.get("year"), section = query.get("section") ?? undefined;
  // /t/<slug> with no year: the latest public year, like the website's redirect.
  const [latest] = useAppData<{ year: number | null }>(slug && !year ? `/api/app/tournament?kind=latest&tournament=${encodeURIComponent(slug)}` : null);
  useEffect(() => {
    if (latest.status === "ok" && latest.data.year) router.replace(`/t/site/?tournament=${encodeURIComponent(slug)}&year=${latest.data.year}`);
  }, [latest, slug, router]);
  const [state, reload] = useAppData<PublicTournament>(slug && year ? `/api/app/tournament?kind=public&tournament=${encodeURIComponent(slug)}&year=${encodeURIComponent(year)}` : null);
  if (!year) return latest.status === "ok" && !latest.data.year ? <AppStatus state={notFound} onRetry={() => undefined} /> : <AppStatus state={{ status: "loading" }} onRetry={() => undefined} />;
  if (state.status !== "ok") return <AppStatus state={state} onRetry={reload} />;
  const tournament = state.data;
  // A section the organizer turned off is "not found", as on the website.
  if (section !== undefined && !isPublicPage(section, tournament.site)) return <AppStatus state={notFound} onRetry={reload} />;
  return <TournamentSiteView tournament={tournament} section={section} basePath={publicBasePath(tournament.tournament.slug, tournament.edition.seasonYear)} />;
}

function Studio() {
  const { state, reload } = useTournament<StudioData>("studio");
  if (state.status !== "ok") return <AppStatus state={state.status === "error" && state.code === 404 ? notFound : state} onRetry={reload} />;
  return <StudioDashboardView {...state.data} />;
}

function NextYear() {
  const { state, reload } = useTournament<NextYearData>("next");
  if (state.status !== "ok") return <AppStatus state={state.status === "error" && state.code === 404 ? notFound : state} onRetry={reload} />;
  return <NextYearView {...state.data} />;
}

function Preview() {
  const { section, state, reload } = useTournament<TournamentPreview>("preview");
  if (state.status !== "ok") return <AppStatus state={state.status === "error" && state.code === 404 ? notFound : state} onRetry={reload} />;
  if (section !== undefined && !isPublicPage(section, state.data.tournament.site)) return <AppStatus state={notFound} onRetry={reload} />;
  return <TournamentPreviewView preview={state.data} section={section} />;
}

export const AppPlayTournament = () => <Suspense><Play /></Suspense>;
export const AppPublicSite = () => <Suspense><PublicSite /></Suspense>;
export const AppStudio = () => <Suspense><Studio /></Suspense>;
export const AppNextYear = () => <Suspense><NextYear /></Suspense>;
export const AppPreview = () => <Suspense><Preview /></Suspense>;
