import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlayer } from "@/lib/portal/requirePlayer";
import { getAllPlayerRows } from "@/lib/portal/allPlayers";
import { get2026SkinsResults, SKINS_YEAR } from "@/lib/skins/data";
import { pastTournaments } from "@/lib/data";
import { tournamentRoundSequence } from "@/lib/data/tournamentRoundSequence";
import { SkinsLeaderboard } from "@/components/skins/SkinsLeaderboard";
import { calculateSkinsPayouts, formatSkinsMoney, SKINS_2026_POT_CENTS } from "@/lib/skins/payout";

export default async function SkinsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!await requirePlayer()) redirect("/portal");
  const tab = (await searchParams).tab === "payout" ? "payout" : "skins";
  const [results, directory] = await Promise.all([
    get2026SkinsResults().catch((error) => { console.error("Could not load skins leaderboard:", error); return null; }),
    getAllPlayerRows(),
  ]);
  const tournament = pastTournaments.find((entry) => entry.year === SKINS_YEAR);
  const payouts = results ? calculateSkinsPayouts(results.totals, SKINS_2026_POT_CENTS) : null;
  const sessions = tournament ? tournamentRoundSequence(tournament) : [];
  const players = Object.entries(results?.totals ?? {}).map(([slug, total]) => ({
    slug, total, name: directory.find((player) => player.playerSlug === slug)?.fullName ?? slug,
    wins: (results?.wins ?? []).filter((win) => win.player === slug).map((win) => ({
      ...win, day: sessions[win.round - 1]?.day ?? null, session: sessions[win.round - 1]?.session ?? null,
    })),
  })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return (
    <main className="mx-auto w-full max-w-3xl bg-white pb-8 sm:my-6 sm:rounded-md sm:border sm:border-ink-100">
      <div className="mx-2 mt-1 flex min-h-24 flex-col items-center justify-center rounded-md border-2 border-gold-500 bg-maroon-700 px-4 text-center text-white">
        <p className="font-condensed text-xs font-bold tracking-widest">{SKINS_YEAR}</p>
        <h1 className="m-0 font-serif text-lg font-bold uppercase tracking-wide">Maroon Masters Skins</h1>
      </div>
      <nav aria-label="Skins navigation" className="flex justify-center border-b border-ink-200">
        {(["skins", "payout"] as const).map((item) => <Link key={item} href={item === "skins" ? "/portal/skins" : "/portal/skins?tab=payout"} aria-current={tab === item ? "page" : undefined} className={`relative px-8 py-3 font-condensed text-sm font-bold uppercase tracking-wide ${tab === item ? "text-maroon-700" : "text-ink-400 hover:text-ink-700"}`}>
          {item === "skins" ? "Skins" : "Payout"}{tab === item && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
        </Link>)}
      </nav>
      <div className="px-2 py-4 sm:px-4">
        {tab === "payout" ? <section className="space-y-4 px-3 font-sans text-sm text-ink-700">
          <h2 className="font-serif text-xl font-bold text-ink-900">2026 payout</h2>
          <p>The total pot is split equally across all skins won. Each player earns their share based on their total skins.</p>
          <dl className="space-y-3">
            <div className="flex justify-between gap-4"><dt>Total pot</dt><dd className="font-bold tabular-nums">{SKINS_2026_POT_CENTS == null ? "Not set yet" : formatSkinsMoney(SKINS_2026_POT_CENTS)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Total skins</dt><dd className="font-bold tabular-nums">{results?.wins.length ?? "—"}</dd></div>
            <div className="flex justify-between gap-4"><dt>Per skin</dt><dd className="font-bold tabular-nums">{SKINS_2026_POT_CENTS != null && results && results.wins.length > 0 ? formatSkinsMoney(SKINS_2026_POT_CENTS / results.wins.length) : "—"}</dd></div>
          </dl>
          {SKINS_2026_POT_CENTS == null && <p>Dollar earnings will appear once the 2026 pot amount is confirmed.</p>}
          <p>Player earnings are rounded to cents, with any remaining cents assigned to the largest fractional shares so the full pot is distributed.</p>
          <p>Each sole lowest gross score earns one skin. Tied holes earn no skin, with no carryover.</p>
        </section> : results ? <SkinsLeaderboard players={players} payouts={payouts} /> : <p role="status" className="px-3 font-sans text-sm text-ink-500">Skins are unavailable right now. Please try again shortly.</p>}
      </div>
    </main>
  );
}
