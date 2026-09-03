import type { BroadcastMatchBox, BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

/** "Maroon 2 UP", "All Square", "White 3 & 2" (closed out early), "Halved" — presentation only, all the real math (leader/margin/holesRemaining) comes from lib/live/orchestration.ts. */
function statusLabel(box: BroadcastMatchBox): string {
  if (box.state === "Scheduled") return "Scheduled";
  if (box.state === "Armed") return "Starting Soon";
  if (box.leader === "tie") return box.state === "Final" ? "Halved" : "All Square";

  const team = box.leader === "maroon" ? "Maroon" : "White";
  if (box.state === "Final" && box.margin > box.holesRemaining) return `${team} ${box.margin} & ${box.holesRemaining}`;
  return `${team} ${box.margin} UP`;
}

/** "3.5" instead of "3.5000000000000004" — points are always in half-point steps, so one decimal is exact. */
function ptsLabel(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function PairingNames({ names }: { names: string[] }) {
  return <span className="truncate">{names.join(" / ")}</span>;
}

/**
 * A TV match-play board in The Maroon Masters' own colors — same card
 * chrome as IndividualLeaderboardScene.tsx (cream card, wordmark, striped
 * title bar, gold ticker), with the ticker here carrying the one number
 * that actually tells the story of a match-play session: the overall
 * points score. See the Watch Live Broadcast spec, §17/§19.
 */
export function MatchPlayScene({ matchPlay }: { matchPlay: BroadcastMatchPlay }) {
  const scoreLeader = matchPlay.maroonPts === matchPlay.whitePts ? "tie" : matchPlay.maroonPts > matchPlay.whitePts ? "maroon" : "white";

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-maroon px-10 py-10">
      <div className="w-full max-w-[900px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-[color:var(--color-gold-400)]/40">
        <div className="bg-[color:var(--color-cream-50)] px-8 pb-5 pt-7 text-center">
          <p className="font-serif text-4xl italic text-[color:var(--color-maroon-700)]">The Maroon Masters</p>
          <div className="mx-auto mt-3 h-px w-24 bg-[color:var(--color-gold-400)]" />
        </div>

        <div className="flex items-center justify-between bg-[color:var(--color-maroon-900)] px-8 py-3">
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-white">
            Match Play{matchPlay.roundLabel ? ` — ${matchPlay.roundLabel}` : ""}
          </span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">
            {matchPlay.final ? "Final" : "Live"}
          </span>
        </div>

        {matchPlay.matchBoxes.length === 0 ? (
          <p className="bg-[color:var(--color-cream-50)] px-8 py-16 text-center font-sans text-lg text-[color:var(--color-ink-500)]">
            No round is live yet.
          </p>
        ) : (
          <div>
            {matchPlay.matchBoxes.map((box, i) => (
              <div
                key={box.boxNumber}
                className={[
                  "flex items-center gap-4 px-8 py-3",
                  i % 2 === 0 ? "bg-[color:var(--color-cream-50)]" : "bg-[color:var(--color-cream-100)]",
                ].join(" ")}
              >
                <span className="w-6 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-maroon-600)]">
                  {box.boxNumber}
                </span>
                <div className="flex flex-1 flex-col gap-1 overflow-hidden font-sans text-lg font-bold uppercase tracking-wide text-[color:var(--color-ink-900)]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-maroon-500)]" />
                    <PairingNames names={box.maroonNames} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-ink-800)]" />
                    <PairingNames names={box.whiteNames} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="font-condensed text-lg font-bold uppercase tracking-wide text-[color:var(--color-ink-900)]">{statusLabel(box)}</span>
                  {box.thru && <span className="font-condensed text-xs uppercase tracking-wide text-[color:var(--color-ink-500)]">{box.thru}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between bg-gradient-trophy px-8 py-3">
          <span className="font-serif text-lg font-bold uppercase tracking-wide text-[color:var(--color-maroon-900)]">
            {scoreLeader === "tie"
              ? `All Square ${ptsLabel(matchPlay.maroonPts)} – ${ptsLabel(matchPlay.whitePts)}`
              : `${scoreLeader === "maroon" ? "Maroon" : "White"} Leads ${ptsLabel(Math.max(matchPlay.maroonPts, matchPlay.whitePts))} – ${ptsLabel(Math.min(matchPlay.maroonPts, matchPlay.whitePts))}`}
          </span>
          <span className="font-condensed text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--color-maroon-900)]/70">The Maroon Masters</span>
        </div>
      </div>
    </div>
  );
}
