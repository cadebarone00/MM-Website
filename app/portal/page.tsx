import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, CircleUserRound, Flag, Trophy } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { findCurrentRoundForPlayer, matchupLabel } from "@/lib/live/currentRoundForPlayer";
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
  const currentMatch = await findCurrentRoundForPlayer(playerSlug);
  const isLive = currentMatch?.state === "Live";
  const teamName = team ? `Team ${team === "maroon" ? "Maroon" : "White"}` : "Team pending";
  const heroTextClass = team === "maroon" ? "text-maroon-300" : "text-white";

  return (
    <main className="w-full pb-10">
      <section className="relative isolate overflow-hidden bg-maroon-950">
        <div className="relative aspect-[16/7] min-h-52 sm:min-h-64">
          <Image src="/loading/desktop.png" alt="Maroon Masters course view" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/75 via-maroon-950/20 to-transparent" />
        </div>
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4 sm:p-6">
          <div className={`flex min-w-0 items-start gap-3 ${heroTextClass}`}>
            <Avatar name={playerName} src={playerProfile?.avatarSrc ?? null} size="md" team={team} />
            <div className="min-w-0 pt-0.5">
              <h1 className="truncate font-serif text-2xl font-bold sm:text-3xl">{playerName}</h1>
              <p className="mt-0.5 font-sans text-xs sm:text-sm">{teamName} · @{profile.username}</p>
            </div>
          </div>
          <div className="text-right text-white">
            <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">Handicap</p>
            <p className="font-serif text-2xl font-bold leading-none">0.0</p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-4xl px-3 sm:px-6">
        <div className="mt-5 grid gap-5 md:grid-cols-[1.45fr_0.9fr]">
          <section className="py-1 sm:py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">My match</p>
                <h2 className="mt-1 font-serif text-xl font-bold text-ink-900 sm:text-2xl">{currentMatch ? matchupLabel(playerSlug, currentMatch.matchBox) : "No match currently assigned"}</h2>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 font-condensed text-2xs font-semibold uppercase tracking-wide ${isLive ? "bg-maroon-700 text-white" : "bg-stone-100 text-ink-600"}`}>{isLive ? "Live now" : currentMatch ? "Upcoming" : "Waiting"}</span>
            </div>
            {currentMatch ? (
              <>
                <div className="mt-4 grid grid-cols-3 divide-x divide-stone-200 rounded-lg border border-stone-200 bg-stone-50 text-center">
                  <div className="p-2.5"><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">Round</p><p className="mt-0.5 font-serif text-lg font-bold text-ink-900">{currentMatch.round.round}</p></div>
                  <div className="p-2.5"><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">Format</p><p className="mt-0.5 truncate font-sans text-sm font-semibold text-ink-900">{currentMatch.matchBox.format}</p></div>
                  <div className="p-2.5"><p className="font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-500">Tee time</p><p className="mt-0.5 font-sans text-sm font-semibold text-ink-900">{currentMatch.matchBox.teeTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p></div>
                </div>
                {isLive ? <Link href="/portal/scoring/play" className="mt-4 flex items-center justify-between rounded-lg bg-maroon-700 px-4 py-3 font-condensed text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-maroon-800">Open live scoring <ArrowRight size={16} aria-hidden="true" /></Link> : <p className="mt-4 font-sans text-sm leading-5 text-ink-500">Scoring opens at tee time, or when Tiger starts your match.</p>}
              </>
            ) : <p className="mt-3 font-sans text-sm leading-5 text-ink-500">Waiting for an upcoming match to be set up.</p>}
          </section>

          <section className="rounded-xl border border-stone-300 bg-cream-50 p-4 shadow-sm sm:p-5">
            <p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">My tournament</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3"><span className={`grid size-9 place-items-center rounded-full ${team === "maroon" ? "bg-maroon-700 text-white" : team === "white" ? "bg-stone-200 text-ink-700" : "bg-stone-100 text-ink-500"}`}><Flag size={17} aria-hidden="true" /></span><div><p className="font-sans text-sm font-semibold text-ink-900">{teamName}</p><p className="font-sans text-xs text-ink-500">Your team assignment</p></div></div>
              <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3"><span className="grid size-9 place-items-center rounded-full bg-gold-100 text-maroon-800"><Trophy size={17} aria-hidden="true" /></span><div><p className="font-sans text-sm font-semibold text-ink-900">Personal access</p><p className="font-sans text-xs text-ink-500">Your profile, stats, and scoring</p></div></div>
            </div>
          </section>
        </div>

        <section className="mt-4">
          <p className="mb-2 font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-ink-500">My information</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/portal/profile" className="group rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><CircleUserRound size={20} className="text-maroon-700" aria-hidden="true" /><h2 className="mt-4 font-serif text-lg font-bold text-ink-900">My profile</h2><p className="mt-1 font-sans text-sm leading-5 text-ink-500">Update the personal information shown on your player page.</p><span className="mt-4 flex items-center gap-1 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Edit profile <ArrowRight size={14} /></span></Link>
            <Link href={`/teams/stats/players/${playerSlug}`} className="group rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><ChartNoAxesCombined size={20} className="text-maroon-700" aria-hidden="true" /><h2 className="mt-4 font-serif text-lg font-bold text-ink-900">My career stats</h2><p className="mt-1 font-sans text-sm leading-5 text-ink-500">Explore your archived scorecards and career performance.</p><span className="mt-4 flex items-center gap-1 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">View archive <ArrowRight size={14} /></span></Link>
            <Link href="/wagers/portfolio" className="group rounded-xl border border-stone-300 bg-white p-4 shadow-sm transition hover:border-maroon-400 hover:shadow-md"><Trophy size={20} className="text-maroon-700" aria-hidden="true" /><h2 className="mt-4 font-serif text-lg font-bold text-ink-900">My wagers</h2><p className="mt-1 font-sans text-sm leading-5 text-ink-500">Review your current wagers and MM Coins activity.</p><span className="mt-4 flex items-center gap-1 font-condensed text-xs font-semibold uppercase tracking-wide text-maroon-700">Open wagers <ArrowRight size={14} /></span></Link>
          </div>
        </section>
      </div>
    </main>
  );
}
