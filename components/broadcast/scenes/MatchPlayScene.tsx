import Image from "next/image";
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
 * A TV match-play graphic in The Maroon Masters' own colors — full-bleed
 * dark stage-lit canvas, same system as IndividualLeaderboardScene.tsx.
 * See the Round 1 redesign spec, §17/§19 of the master broadcast spec.
 */
export function MatchPlayScene({ matchPlay }: { matchPlay: BroadcastMatchPlay }) {
  const scoreLeader = matchPlay.maroonPts === matchPlay.whitePts ? "tie" : matchPlay.maroonPts > matchPlay.whitePts ? "maroon" : "white";

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-10 py-10">
      <Image src="/loading/desktop.png" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-maroon-900/80" />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-[10%] -right-[6%] z-[1] font-serif text-[22vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1px_rgba(201,168,110,0.14)]"
      >
        MM
      </span>

      <div className="relative z-[1] w-full max-w-[900px]">
        <div className="mb-2 flex items-baseline justify-between border-b border-[color:var(--color-gold-400)]/35 pb-3">
          <span className="font-serif text-lg italic text-[color:var(--color-cream-100)]">The Maroon Masters</span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-cream-50)]">
            Match Play{matchPlay.roundLabel ? ` — ${matchPlay.roundLabel}` : ""}
          </span>
          <span className="font-condensed text-sm font-bold uppercase tracking-[0.2em] text-[color:var(--color-gold-300)]">
            {matchPlay.final ? "Final" : "Live"}
          </span>
        </div>

        {matchPlay.matchBoxes.length === 0 ? (
          <p className="px-2 py-16 text-center font-sans text-lg text-[color:var(--color-ink-400)]">No round is live yet.</p>
        ) : (
          <div>
            {matchPlay.matchBoxes.map((box) => (
              <div key={box.boxNumber} className="flex items-center gap-4 border-b border-white/[0.06] px-2 py-3">
                <span className="w-6 shrink-0 text-right font-condensed text-lg font-bold tabular-nums text-[color:var(--color-ink-400)]">
                  {box.boxNumber}
                </span>
                <div className="flex flex-1 flex-col gap-1 overflow-hidden font-sans text-lg font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-maroon-500)] shadow-[0_0_6px_rgba(168,82,88,0.9)]" />
                    <PairingNames names={box.maroonNames} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-cream-100)]" />
                    <PairingNames names={box.whiteNames} />
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span
                    className={[
                      "font-condensed text-lg font-bold uppercase tracking-wide",
                      box.state === "Live"
                        ? "text-[color:var(--color-gold-300)] [text-shadow:0_0_12px_rgba(220,196,149,0.45)]"
                        : "text-[color:var(--color-ink-400)]",
                    ].join(" ")}
                  >
                    {statusLabel(box)}
                  </span>
                  {box.thru && <span className="font-condensed text-xs uppercase tracking-wide text-[color:var(--color-ink-400)]">{box.thru}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center justify-between border-t border-[color:var(--color-gold-400)]/35 pt-3">
          <span className="font-condensed text-lg font-bold uppercase tracking-wide text-[color:var(--color-cream-50)]">
            {scoreLeader === "tie" ? (
              <>
                All Square{" "}
                <span className="text-[color:var(--color-ink-400)]">
                  {ptsLabel(matchPlay.maroonPts)} – {ptsLabel(matchPlay.whitePts)}
                </span>
              </>
            ) : (
              <>
                <span className={scoreLeader === "maroon" ? "text-[color:var(--color-maroon-400)]" : "text-[color:var(--color-cream-50)]"}>
                  {scoreLeader === "maroon" ? "Maroon" : "White"} Leads
                </span>{" "}
                <span className="text-[color:var(--color-ink-400)]">
                  {ptsLabel(Math.max(matchPlay.maroonPts, matchPlay.whitePts))} – {ptsLabel(Math.min(matchPlay.maroonPts, matchPlay.whitePts))}
                </span>
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
