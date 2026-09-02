import { getPlayerDisplayName } from "@/lib/data/players";
import type { PlayerSummary } from "@/lib/live/scoring";

function scoreLabel(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`;
}

/**
 * Full-screen, TV-style individual leaderboard — restyles the same
 * lib/live/scoring.ts standings the rest of the app will eventually show,
 * rather than reusing components/leaderboard/IndividualLeaderboardTable.tsx
 * directly (that component is built around the static, past-years
 * Tournament type, not the live PlayerSummary shape). See the Watch Live
 * Broadcast spec, §17.
 */
export function IndividualLeaderboardScene({ standings }: { standings: PlayerSummary[] }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-[color:var(--color-maroon-900)] px-6 py-10 text-[color:var(--color-maroon-50)]">
      <p className="font-condensed text-sm uppercase tracking-[0.3em] text-[color:var(--color-maroon-300)]">The Maroon Masters</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">Individual Leaderboard</h1>

      {standings.length === 0 ? (
        <p className="mt-16 font-sans text-xl text-[color:var(--color-maroon-200)]">No scores posted yet. Check back once play begins.</p>
      ) : (
        <div className="mt-10 w-full max-w-4xl overflow-hidden rounded-lg border border-white/10">
          {standings.map((p, i) => (
            <div
              key={p.player}
              className={[
                "flex items-center gap-4 border-b border-white/10 px-6 py-3 last:border-b-0 sm:gap-6 sm:px-8 sm:py-4",
                i === 0 ? "bg-white/10" : "bg-white/[0.03]",
              ].join(" ")}
            >
              <span className="w-10 text-right font-condensed text-2xl font-bold tabular-nums text-[color:var(--color-maroon-300)] sm:w-12 sm:text-3xl">
                {i + 1}
              </span>
              <span
                aria-hidden
                className={["h-3 w-3 shrink-0 rounded-full sm:h-4 sm:w-4", p.team === "maroon" ? "bg-[color:var(--color-maroon-500)]" : "bg-white"].join(" ")}
              />
              <span className="flex-1 truncate font-serif text-xl font-semibold uppercase sm:text-2xl">{getPlayerDisplayName(p.player)}</span>
              <span className="w-16 text-right font-sans text-2xl font-bold tabular-nums sm:w-20 sm:text-3xl">{scoreLabel(p.toPar)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
