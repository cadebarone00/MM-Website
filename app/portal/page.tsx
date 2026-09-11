import Image from "next/image";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PortalMatches, type PortalMatch } from "@/components/portal/PortalMatches";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPlayerProfileBySlug } from "@/lib/data/players";
import { findPlayerTeam } from "@/lib/portal/findPlayerTeam";
import { findMatchesForPlayer, matchupLabel } from "@/lib/live/currentRoundForPlayer";
import { pastTournaments } from "@/lib/data";
import { archivedMatchesForPlayer } from "@/lib/portal/archivedMatches";
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
  const year = Number(new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "America/Chicago" }).format(new Date()));
  const archivedTournament = pastTournaments.find((tournament) => tournament.year === year);
  const [upcomingMatches, handicapSummary] = await Promise.all([
    archivedTournament ? Promise.resolve([]) : findMatchesForPlayer(playerSlug, year),
    getHandicapSummaryForPlayer(playerSlug).catch((err) => {
      console.error("Failed to load handicap summary for portal hero:", err);
      return { index: null, lowIndex: null, rounds: [] };
    }),
  ]);
  const matches: PortalMatch[] = upcomingMatches.map((match) => ({
    id: match.matchBox.id ?? `round-${match.round.round}-box-${match.matchBox.boxNumber}`,
    label: matchupLabel(playerSlug, match.matchBox),
    details: `Round ${match.round.round} ? ${match.matchBox.format} ? ${match.matchBox.teeTime.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })} CT`,
    status: match.state === "Final" ? "Past" : match.state === "Live" ? "Live" : "Upcoming",
  }));
  if (archivedTournament) matches.push(...archivedMatchesForPlayer(archivedTournament, playerSlug));
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
          <div className="shrink-0 text-right text-white"><Link href="/portal/handicap" className="mb-3 inline-block rounded border border-gold-300 bg-maroon-950/60 px-3 py-2 font-condensed text-xs font-semibold text-white transition hover:bg-maroon-900">Submit a score</Link><p className="font-condensed text-2xs font-semibold uppercase tracking-[0.16em] text-white/75">Handicap</p><p className="font-serif text-2xl font-bold leading-none">{handicapSummary.index != null ? handicapSummary.index.toFixed(1) : "—"}</p></div>
        </div>
      </section>

      <PortalMatches matches={matches} team={team} year={year} />

      <nav aria-label="Player portal" className="mx-auto mt-5 max-w-4xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-xl border-2 border-gold-300 bg-white divide-y divide-gold-300/50">
          {[{ href: "/portal/profile", name: "Profile" }, { href: "/portal/career", name: "Career" }, { href: "/portal/round-video", name: "Round video" }, { href: "/wagers/portfolio", name: "Wagers" }].map((item) => <Link key={item.href} href={item.href} className="block px-6 py-6 font-serif text-2xl font-bold text-maroon-900 transition hover:bg-cream-50 focus-visible:bg-cream-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-maroon-700">{item.name}</Link>)}
        </div>
      </nav>
    </main>
  );
}
