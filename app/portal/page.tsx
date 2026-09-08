import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChartNoAxesCombined, CircleUserRound, ClipboardPenLine, Trophy, Video } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { findCurrentRoundForPlayer, matchupLabel } from "@/lib/live/currentRoundForPlayer";
import { getHandicapSummaryForPlayer } from "@/lib/handicap/data";
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
  const playerName = playerProfile?.fullName ?? profile.display_name ?? "Player";
  const team = findPlayerTeam(playerSlug);
  const [currentMatch, handicapSummary] = await Promise.all([
    findCurrentRoundForPlayer(playerSlug),
    getHandicapSummaryForPlayer(playerSlug).catch((err) => {
      console.error("Failed to load handicap summary for portal hero:", err);
      return { index: null, lowIndex: null, rounds: [] };
    }),
  ]);
  const isLive = currentMatch?.state === "Live";
  const teamName = team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Team pending";
  const heroTextClass = team === "maroon" ? "text-maroon-300" : "text-white";
  const heroOverlayClass = team === "white"
    ? "bg-gradient-to-t from-maroon-950/90 via-maroon-800/55 to-maroon-950/25"
    : "bg-gradient-to-t from-maroon-950/75 via-maroon-950/20 to-transparent";

  return (
    <main className="w-full pb-10">
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
          <div className="text-right text-white"><p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">Handicap</p><p className="font-serif text-2xl font-bold leading-none">{handicapSummary.index != null ? handicapSummary.index.toFixed(1) : "—"}</p></div>
        </div>
      </section>

      <section className="relative flex aspect-[16/7] min-h-52 items-center bg-cream-50 sm:min-h-64">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">My match</p><h2 className="mt-1 font-serif text-2xl font-bold text-ink-900 sm:text-3xl">{currentMatch ? matchupLabel(playerSlug, currentMatch.matchBox) : "Waiting for an upcoming match"}</h2></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide ${isLive ? "bg-maroon-700 text-white" : "bg-stone-200 text-ink-600"}`}>{isLive ? "Live now" : currentMatch ? "Upcoming" : "Waiting"}</span>
          </div>
          {currentMatch ? (
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 font-sans text-sm text-ink-600">
              <span>Round {currentMatch.round.round}</span><span>{currentMatch.matchBox.format}</span><span>{currentMatch.matchBox.teeTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
              {isLive && <Link href="/portal/scoring/play" className="rounded-pill bg-maroon-700 px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-wide text-white">Open live scoring</Link>}
            </div>
          ) : <p className="mt-3 font-sans text-sm text-ink-500">Tiger will add your matchup here once the next round is ready.</p>}
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-4xl px-3 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Link href="/portal/profile" className="group flex aspect-[4/3] flex-col justify-between rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><CircleUserRound size={22} className="text-maroon-700" aria-hidden="true" /><h2 className="font-serif text-lg font-bold text-ink-900">Profile</h2></Link>
          <Link href={`/teams/stats/players/${playerProfile?.id.toLowerCase() ?? playerSlug}`} className="group flex aspect-[4/3] flex-col justify-between rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><ChartNoAxesCombined size={22} className="text-maroon-700" aria-hidden="true" /><h2 className="font-serif text-lg font-bold text-ink-900">Career</h2></Link>
          <Link href="/portal/round-video" className="group flex aspect-[4/3] flex-col justify-between rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><Video size={22} className="text-maroon-700" aria-hidden="true" /><h2 className="font-serif text-lg font-bold text-ink-900">Round video</h2></Link>
          <Link href="/portal/scoring" className="group flex aspect-[4/3] flex-col justify-between rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><ClipboardPenLine size={22} className="text-maroon-700" aria-hidden="true" /><h2 className="font-serif text-lg font-bold text-ink-900">Submit a score</h2></Link>
          <Link href="/wagers/portfolio" className="group flex aspect-[4/3] flex-col justify-between rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><Trophy size={22} className="text-maroon-700" aria-hidden="true" /><h2 className="font-serif text-lg font-bold text-ink-900">Wagers</h2></Link>
        </div>
      </section>
    </main>
  );
}
