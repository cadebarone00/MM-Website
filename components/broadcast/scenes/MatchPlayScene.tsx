import type { BroadcastMatchBox, BroadcastMatchPlay } from "@/lib/broadcast/matchPlayData";

/** "MAROON 2 UP", "ALL SQUARE", "WHITE 3 & 2" (closed out early), "HALVED" — presentation only, all the real math (leader/margin/holesRemaining) comes from lib/live/orchestration.ts. */
function statusLabel(box: BroadcastMatchBox): string {
  if (box.state === "Scheduled") return "Scheduled";
  if (box.state === "Armed") return "Starting Soon";
  if (box.leader === "tie") return box.state === "Final" ? "Halved" : "All Square";

  const team = box.leader === "maroon" ? "Maroon" : "White";
  if (box.state === "Final" && box.margin > box.holesRemaining) return `${team} ${box.margin} & ${box.holesRemaining}`;
  return `${team} ${box.margin} UP`;
}

function PairingNames({ names }: { names: string[] }) {
  return <span className="truncate">{names.join(" / ")}</span>;
}

/** Full-screen, TV-style match play board — one row per box in the round currently being played. See the Watch Live Broadcast spec, §17/§19. */
export function MatchPlayScene({ matchPlay }: { matchPlay: BroadcastMatchPlay }) {
  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-[color:var(--color-maroon-900)] px-6 py-10 text-[color:var(--color-maroon-50)]">
      <p className="font-condensed text-sm uppercase tracking-[0.3em] text-[color:var(--color-maroon-300)]">The Maroon Masters</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold sm:text-5xl">
        Match Play{matchPlay.round !== null ? ` — Round ${matchPlay.round}` : ""}
      </h1>

      {matchPlay.matchBoxes.length === 0 ? (
        <p className="mt-16 font-sans text-xl text-[color:var(--color-maroon-200)]">No round is live yet.</p>
      ) : (
        <div className="mt-10 w-full max-w-4xl overflow-hidden rounded-lg border border-white/10">
          {matchPlay.matchBoxes.map((box) => (
            <div key={box.boxNumber} className="flex items-center gap-4 border-b border-white/10 bg-white/[0.03] px-6 py-4 last:border-b-0 sm:gap-6 sm:px-8">
              <span className="w-8 shrink-0 font-condensed text-lg font-bold text-[color:var(--color-maroon-300)]">#{box.boxNumber}</span>
              <div className="flex flex-1 flex-col gap-1 overflow-hidden font-serif text-lg sm:text-xl">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--color-maroon-500)]" />
                  <PairingNames names={box.maroonNames} />
                </div>
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-white" />
                  <PairingNames names={box.whiteNames} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                <span className="font-sans text-lg font-bold sm:text-xl">{statusLabel(box)}</span>
                {box.thru && <span className="font-condensed text-xs uppercase tracking-wide text-[color:var(--color-maroon-300)]">{box.thru}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
