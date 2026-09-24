import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PortalMatches } from "@/components/portal/PortalMatches";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { getLiveTeamForPlayer } from "@/lib/data/activeSeasonOverlay";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { findMatchesForPlayer } from "@/lib/live/currentRoundForPlayer";
import { pastTournaments } from "@/lib/data";
import { archivedMatchesForPlayer } from "@/lib/portal/archivedMatches";
import { buildLiveMatchCards } from "@/lib/portal/liveMatchCards";
import type { PortalMatchCard } from "@/lib/portal/matchCards";
import { getScorecardsForTournament, getArchivedHandicapRounds } from "@/lib/data/archivedScorecards";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
import { combinedHandicapIndexes } from "@/lib/handicap/archiveIndex";
import { formatHandicapIndex } from "@/lib/handicap/format";
import { Avatar } from "@/components/ui/Avatar";

export default async function PortalPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_host, player_slug, display_name, username").eq("id", user.id).single();
  if (!profile || (!profile.is_host && !profile.player_slug)) redirect("/");
  if (profile.is_host) redirect("/portal/admin");

  const playerSlug = profile.player_slug!;
  const playerProfile = getPlayerProfileBySlug(playerSlug);
  const year = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Chicago" }).format(new Date()));
  const archivedTournament = pastTournaments.find((tournament) => tournament.year === year);
  const [team, allPlayers, upcomingMatches, archivedScorecards, handicapSummary, archivedHandicapRounds] = await Promise.all([
    getLiveTeamForPlayer(playerSlug),
    getAllPlayerRows(),
    archivedTournament ? Promise.resolve([]) : findMatchesForPlayer(playerSlug, year),
    archivedTournament
      ? getScorecardsForTournament(archivedTournament).catch((err) => {
          console.error("Failed to load archived scorecards for portal matches:", err);
          return [];
        })
      : Promise.resolve([]),
    getHandicapSummaryForPlayer(playerSlug).catch((err) => {
      console.error("Failed to load handicap summary for portal hero:", err);
      return { index: null, lowIndex: null, rounds: [] };
    }),
    getArchivedHandicapRounds(playerSlug).catch((err) => {
      console.error("Failed to load archived handicap rounds for portal hero:", err);
      return [];
    }),
  ]);
  // Same combined math as the dedicated My Handicap page — self-submitted
  // scores plus Maroon Masters archive rounds that have a verified tee
  // assigned — so the two screens never show two different numbers.
  const heroHandicapIndex = combinedHandicapIndexes(handicapSummary.rounds, archivedHandicapRounds).index;
  const playerName = allPlayers.find((p) => p.playerSlug === playerSlug)?.fullName ?? profile.display_name ?? "Player";
  const matches: PortalMatchCard[] = await buildLiveMatchCards(upcomingMatches);
  if (archivedTournament) matches.push(...archivedMatchesForPlayer(archivedTournament, playerSlug, archivedScorecards));
  const teamName = team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Unassigned";
  const heroTextClass = team === "maroon" ? "text-maroon-300" : "text-white";
  const heroOverlayClass = team === "white"
    ? "bg-gradient-to-t from-maroon-950/90 via-maroon-800/55 to-maroon-950/25"
    : "bg-gradient-to-t from-maroon-950/75 via-maroon-950/20 to-transparent";

  return (
    <main className="w-full">
      <section className="relative isolate overflow-hidden bg-maroon-950">
        <div className="relative aspect-[16/7] min-h-52 sm:min-h-64">
          <Image src="/loading/desktop.png" alt="Maroon Masters course view" fill priority sizes="100vw" className="object-cover" />
          <div className={`absolute inset-0 ${heroOverlayClass}`} />
        </div>
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
          <div className={`flex min-w-0 items-start gap-3 ${heroTextClass}`}>
            <Avatar name={playerName} src={playerProfile?.avatarSrc ?? null} size="md" team={team} />
            <div className="min-w-0 pt-0.5"><h1 className="truncate font-serif text-2xl font-bold sm:text-3xl">{playerName}</h1><p className="mt-0.5 font-sans text-xs sm:text-sm">{teamName} · @{profile.username}</p></div>
          </div>
          <Link href="/portal/handicap?tab=overall" aria-label={`Overall handicap: ${formatHandicapIndex(heroHandicapIndex)}`} className="shrink-0 text-right font-serif text-4xl font-bold leading-none tabular-nums text-white sm:text-5xl">{formatHandicapIndex(heroHandicapIndex)}</Link>
        </div>
        <nav aria-label="Handicap and player lookup" className="absolute inset-x-0 bottom-5 grid grid-cols-2 items-center px-4 sm:bottom-8 sm:px-6">
          {[{ href: "/portal/handicap", label: "My Handicap" }, { href: "/portal/player-lookup", label: "Player Lookup" }].map(item => <Link key={item.href} href={item.href} className="flex min-h-11 items-center justify-center px-2 text-center font-serif text-sm font-bold uppercase tracking-wide text-white underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-white sm:text-lg">{item.label}</Link>)}
        </nav>
      </section>

      <PortalMatches matches={matches} team={team} year={year} />

      <div className={`pt-5 pb-10 ${team === "white" ? "bg-maroon-900" : ""}`}>
      <nav aria-label="Player portal" className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="space-y-3">
          {[{ href: "/portal/profile", name: "Profile", image: "profile" }, { href: "/portal/career", name: "Career", image: "career" }, { href: "/portal/round-video", name: "Round video", image: "round-video" }, { href: "/wagers/portfolio", name: "Wagers", image: "wagers" }].map((item) => <Link key={item.href} href={item.href} className="group relative isolate block overflow-hidden rounded-xl border-2 border-gold-300 px-6 py-6 font-serif text-2xl font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-gold-300"><Image src={`/portal/navigation/${item.image}.webp`} alt="" fill sizes="(max-width: 896px) 100vw, 896px" className="-z-20 object-cover" /><span aria-hidden="true" className="absolute inset-0 -z-10 bg-black/45 transition group-hover:bg-black/30 group-focus-visible:bg-black/30" />{item.name}</Link>)}
        </div>
      </nav>
      </div>
    </main>
  );
}
