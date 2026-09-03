import { getPlayerDisplayName } from "@/lib/data/players";
import type { BroadcastStanding } from "@/lib/broadcast/types";

function scoreLabel(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`;
}

/** Red under par / dark green even / near-black over — the same three tones components/ui/ScoreBadge.tsx already uses everywhere else on the site, just as a filled pill here instead of text. */
function pillBg(toPar: number): string {
  if (toPar < 0) return "var(--color-score-under)";
  if (toPar === 0) return "var(--color-score-even)";
  return "var(--color-ink-700)";
}

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
 * A TV leaderboard card in The Maroon Masters' own colors — modeled on a
 * real broadcast leaderboard graphic (cream card, header wordmark, a
 * striped title bar, alternating rows, a colored score pill, a gold leader
 * ticker) rather than a plain website table. See the Watch Live Broadcast
 * spec, §17, and the reference screenshot this was designed against.
 */
export function IndividualLeaderboardScene({ standings }: { standings: BroadcastStanding[] }) {
  const rows = rankRows(standings);
  const leader = rows[0];

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
      <div className="w-full max-w-[900px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
        <div className="bg-[color:var(--color-cream-50)] px-8 pb-5 pt-7 text-center">
          <p className="font-serif text-4xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <div className="mx-auto mt-3 h-px w-24 bg-[color:var(--color-gold-400)]" />
        </div>

        <div className="flex items-center justify-between bg-[color:var(--color-maroon-900)] px-8 py-3">
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-white">Individual Leaderboard</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">Live</span>
        </div>

        {rows.length === 0 ? (
          <p className="bg-[color:var(--color-cream-50)] px-8 py-16 text-center font-sans text-lg text-[color:var(--color-ink-500)]">
            No scores posted yet. Check back once play begins.
          </p>
        ) : (
          <div>
            {rows.map((r, i) => (
              <div
                key={r.player}
                className={["flex items-center gap-4 px-8 py-3", i % 2 === 0 ? "bg-[color:var(--color-cream-50)]" : "bg-[color:var(--color-cream-100)]"].join(
                  " "
                )}
              >
                <span className="w-8 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-maroon-600)]">
                  {r.showPos ? r.pos : ""}
                </span>
                <span
                  aria-hidden
                  className={[
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    r.team === "maroon" ? "bg-[color:var(--color-maroon-500)]" : "border border-[color:var(--color-ink-300)] bg-white",
                  ].join(" ")}
                />
                <span className="flex-1 truncate font-sans text-xl font-bold uppercase tracking-wide text-[color:var(--color-ink-900)]">
                  {getPlayerDisplayName(r.player)}
                </span>
                <span
                  className="min-w-[64px] rounded-md px-3 py-1 text-center font-condensed text-xl font-bold tabular-nums text-white"
                  style={{ background: pillBg(r.toPar) }}
                >
                  {scoreLabel(r.toPar)}
                </span>
              </div>
            ))}
          </div>
        )}

        {leader && (
          <div className="flex items-center justify-between bg-gradient-trophy px-8 py-3">
            <span className="font-serif text-lg font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">
              {getPlayerDisplayName(leader.player)} {scoreLabel(leader.toPar)}
            </span>
            <span className="font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-maroon-900)]/70">
              The Maroon Masters
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
