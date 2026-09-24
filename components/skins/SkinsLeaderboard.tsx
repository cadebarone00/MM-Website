import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import type { SkinWin } from "@/lib/skins/calculate";
import { skinsScoreLabel } from "@/lib/skins/scoreLabel";
import { formatSkinsMoney } from "@/lib/skins/payout";

export type SkinsLeaderboardPlayer = { slug: string; name: string; total: number; wins: (Omit<SkinWin, "opponents"> & { day: number | null; session: string | null; opponents: (SkinWin["opponents"][number] & { name: string; initials: string })[] })[] };

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
              <div role="region" aria-label={`${player.name}'s winning holes`} className="font-sans text-xs sm:text-sm">
                <div className="grid grid-cols-[2rem_4.25rem_minmax(0,1fr)_2rem_3rem] items-center gap-1 border-b border-ink-200 py-3 font-condensed text-[10px] font-bold uppercase text-ink-500 sm:grid-cols-[3rem_6rem_minmax(0,1fr)_3rem_7rem] sm:text-xs">
                  {["Day", "Session", "Course", "Hole", "Score"].map((label) => <span key={label}>{label}</span>)}
                </div>
                {player.wins.map((win) => (
                  <details key={`${win.round}:${win.course}:${win.hole}`} className="border-b border-ink-200 last:border-0">
                    <summary aria-label={`Day ${win.day ?? "unknown"}, ${win.session ?? "unknown session"}, ${win.course}, hole ${win.hole}, score ${win.score}, ${skinsScoreLabel(win.score, win.par)}. Other players' scores`} className="grid min-h-16 cursor-pointer list-none grid-cols-[2rem_4.25rem_minmax(0,1fr)_2rem_3rem] items-center gap-1 py-3 hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-maroon-700 sm:grid-cols-[3rem_6rem_minmax(0,1fr)_3rem_7rem] [&::-webkit-details-marker]:hidden">
                      <span className="tabular-nums">{win.day ?? "—"}</span>
                      <span className="text-[10px] sm:text-xs">{win.session ?? "—"}</span>
                      <span>{win.course}</span>
                      <span className="tabular-nums">{win.hole}</span>
                      <span className="flex flex-col items-center gap-1 text-center sm:flex-row sm:gap-2 sm:text-left">
                        {win.par == null ? <span className="inline-flex h-8 w-8 items-center justify-center font-score font-bold">{win.score}</span> : <HoleMarkerForDiff diff={win.score - win.par} size={30}>{win.score}</HoleMarkerForDiff>}
                        <span>{skinsScoreLabel(win.score, win.par)}</span>
                      </span>
                    </summary>
                    <div className="rounded-sm bg-white/70 py-3" role="group" aria-label={`Other players on hole ${win.hole}`}>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, win.opponents.length)}, minmax(0, 1fr))` }}>
                        {win.opponents.map((opponent) => (
                          <div key={opponent.player} className="flex min-w-0 flex-col items-center gap-1" title={`${opponent.name}: ${opponent.score}, ${skinsScoreLabel(opponent.score, opponent.par)}`} aria-label={`${opponent.name}: ${opponent.score}, ${skinsScoreLabel(opponent.score, opponent.par)}`}>
                            <span className="font-condensed text-[9px] font-bold leading-3 text-ink-700 sm:text-xs">{opponent.initials}</span>
                            <span className="[&_.font-score]:text-[10px]">
                              {opponent.par == null ? <span className="inline-flex h-5 w-5 items-center justify-center font-score text-[10px] font-bold">{opponent.score}</span> : <HoleMarkerForDiff diff={opponent.score - opponent.par} size={20}>{opponent.score}</HoleMarkerForDiff>}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </details>
      ))}
      <p className="px-3 pt-4 font-sans text-xs text-ink-500">$ Earned is the total won from each round’s $200 pot, before the $100 entry.</p>
    </section>
  );
}
