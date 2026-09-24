import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import type { SkinWin } from "@/lib/skins/calculate";
import { skinsScoreLabel } from "@/lib/skins/scoreLabel";
import { formatSkinsMoney } from "@/lib/skins/payout";

export type SkinsLeaderboardPlayer = { slug: string; name: string; total: number; wins: (SkinWin & { day: number | null; session: string | null })[] };

export function SkinsLeaderboard({ players, payouts }: { players: SkinsLeaderboardPlayer[]; payouts: Record<string, number> | null }) {
  return (
    <section aria-label="Skins leaderboard">
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2 border-b border-ink-200 px-3 py-3 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500 sm:grid-cols-[minmax(0,1fr)_7rem_6rem]">
        <span>Player name</span><span className="text-right">Total skins</span><span className="text-right">$ Earned</span>
      </div>
      {players.map((player) => (
        <details key={player.slug} className="group border-b border-ink-100">
          <summary className="grid min-h-16 cursor-pointer list-none grid-cols-[minmax(0,1fr)_5rem_5rem] items-center gap-2 px-3 py-4 hover:bg-cream-100 focus-visible:outline-2 focus-visible:outline-maroon-700 sm:grid-cols-[minmax(0,1fr)_7rem_6rem] [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2 font-serif text-sm font-bold text-ink-900 sm:text-base"><span aria-hidden="true" className="text-maroon-700 transition-transform group-open:rotate-90">›</span>{player.name}</span>
            <span className="text-right font-score text-xl font-bold tabular-nums text-maroon-700">{player.total}</span>
            <span className="text-right font-score text-sm tabular-nums text-ink-500" aria-label={payouts == null ? "Payout unavailable" : undefined}>{payouts == null ? "—" : formatSkinsMoney(payouts[player.slug] ?? 0)}</span>
          </summary>
          <div className="bg-cream-100 px-3 pb-4 pt-2">
            {player.wins.length === 0 ? <p className="py-3 font-sans text-sm text-ink-500">No skins won in 2026.</p> : (
              <div className="overflow-x-auto" role="region" aria-label={`${player.name}'s winning holes`} tabIndex={0}>
                <table className="w-full min-w-[520px] text-left font-sans text-xs sm:text-sm">
                  <caption className="sr-only">Winning holes for {player.name}</caption>
                  <thead><tr className="border-b border-ink-200 font-condensed text-xs uppercase text-ink-500">{["Day", "Session", "Course", "Hole", "Score"].map((label) => <th key={label} scope="col" className="px-2 py-3">{label}</th>)}</tr></thead>
                  <tbody>{player.wins.map((win) => (
                    <tr key={`${win.round}:${win.course}:${win.hole}`} className="border-b border-ink-200 last:border-0">
                      <td className="px-2 py-3 tabular-nums">{win.day ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-3">{win.round}{win.session ? ` · ${win.session}` : ""}</td>
                      <td className="px-2 py-3">{win.course}</td>
                      <td className="px-2 py-3 tabular-nums">{win.hole}</td>
                      <td className="px-2 py-3"><span className="flex items-center gap-2 whitespace-nowrap">
                        {win.par == null ? <span className="inline-flex h-8 w-8 items-center justify-center font-score font-bold">{win.score}</span> : <HoleMarkerForDiff diff={win.score - win.par} size={30}>{win.score}</HoleMarkerForDiff>}
                        <span>{skinsScoreLabel(win.score, win.par)}</span>
                      </span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      ))}
      <p className="px-3 pt-4 font-sans text-xs text-ink-500">$ Earned is the total won from each round’s $200 pot, before the $100 entry.</p>
    </section>
  );
}
