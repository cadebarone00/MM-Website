import { getPlayerDisplayName } from "@/lib/data/players";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BroadcastStanding } from "@/lib/broadcast/types";

interface Row extends BroadcastStanding {
  pos: number;
  showPos: boolean;
}

/** Groups ties (equal toPar) under one shared position number, blank on the rows underneath — same convention the reference broadcast leaderboard uses. */
function rankRows(standings: BroadcastStanding[]): Row[] {
  let pos = 0;
  let lastToPar: number | null = null;
  return standings.map((s, i) => {
    if (lastToPar === null || s.toPar !== lastToPar) {
      pos = i + 1;
      lastToPar = s.toPar;
      return { ...s, pos, showPos: true };
    }
    return { ...s, pos, showPos: false };
  });
}

/**
 * A TV leaderboard graphic in The Maroon Masters' own colors — a full-bleed
 * dark stage-lit canvas (not a card), modeled on modern golf broadcast
 * packages (Golf Channel / PGA Tour Live) rather than a plain website
 * table. Score colors are the site's real red/green/near-black convention
 * (ScoreBadge, shared with every scorecard on the site) — gold here is a
 * pure accent, never a score meaning. See the Round 1 redesign spec.
 */
export function IndividualLeaderboardScene({ standings, final = false }: { standings: BroadcastStanding[]; final?: boolean }) {
  const rows = rankRows(standings);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10 [background:radial-gradient(120%_90%_at_50%_8%,var(--color-maroon-700)_0%,var(--color-maroon-900)_46%,#0d0000_100%)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>

      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">Individual Leaderboard</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">{final ? "Final" : "Live"}</span>
        </div>

        {rows.length === 0 ? (
          <p className="px-2 py-16 text-center font-sans text-lg text-[color:var(--color-ink-400)]">
            No scores posted yet. Check back once play begins.
          </p>
        ) : (
          <div>
            {rows.map((r, i) => (
              <div
                key={r.player}
                className={[
                  "flex items-center gap-4 border-b border-white/[0.06] px-2 py-3",
                  i === 0 ? "bg-gradient-to-r from-[color:var(--color-gold-400)]/[0.08] to-transparent" : "",
                ].join(" ")}
              >
                <span className="w-8 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-ink-400)]">
                  {r.showPos ? r.pos : ""}
                </span>
                <span
                  aria-hidden
                  className={[
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    r.team === "maroon" ? "bg-[color:var(--color-maroon-500)] shadow-[0_0_6px_rgba(168,82,88,0.9)]" : "bg-[color:var(--color-cream-100)]",
                  ].join(" ")}
                />
                <span className="flex-1 truncate font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
                  {getPlayerDisplayName(r.player)}
                </span>
                <span className="inline-flex min-w-[64px] justify-center rounded-md bg-[color:var(--color-cream-50)] px-3 py-1">
                  <ScoreBadge value={r.toPar} size="lg" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
