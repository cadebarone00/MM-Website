import { shortCourseName } from "@/lib/data";

interface RoundBar {
  round: number;
  course?: string;
  puttsPerHole: number;
  threePutts?: number;
}

/** Per-round bar pair (player over comparison), same form as the reference Putting screenshot. */
export function PuttsPerRoundBars({
  compareLabel,
  playerRounds,
  compareRounds,
}: {
  compareLabel: string;
  playerRounds: RoundBar[];
  compareRounds: RoundBar[];
}) {
  const max = Math.max(1, ...playerRounds.map((r) => r.puttsPerHole), ...compareRounds.map((r) => r.puttsPerHole));

  return (
    <div>
      <div className="flex items-center justify-center gap-4 mb-5">
        <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-maroon-600">
          <span className="h-2 w-2 rounded-full bg-maroon-600" /> Player
        </span>
        <span className="flex items-center gap-1.5 font-condensed text-2xs font-semibold uppercase tracking-wide text-ink-400">
          <span className="h-2 w-2 rounded-full bg-ink-400" /> {compareLabel}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {playerRounds.map((pr) => {
          const cr = compareRounds.find((c) => c.round === pr.round);
          return (
            <div key={pr.round}>
              <div className="flex items-center gap-3">
                <div className="relative h-9 flex-1">
                  <div
                    className="absolute inset-y-0 left-0 flex items-center rounded-sm bg-maroon-600 px-3"
                    style={{ width: `${(pr.puttsPerHole / max) * 100}%` }}
                  >
                    <span className="font-sans text-xs font-bold text-white whitespace-nowrap">{pr.course ? shortCourseName(pr.course) : `RD ${pr.round}`}</span>
                  </div>
                </div>
                <span className="w-24 shrink-0 text-right font-sans text-sm font-bold text-maroon-600 tabular-nums">
                  {pr.puttsPerHole.toFixed(2)}
                  {pr.threePutts != null && <span className="ml-1 font-sans text-xs font-normal text-ink-400">({pr.threePutts})</span>}
                </span>
              </div>
              {cr && (
                <div className="flex items-center gap-3 mt-1">
                  <div className="relative h-5 flex-1">
                    <div className="absolute inset-y-0 left-0 rounded-sm bg-ink-400" style={{ width: `${(cr.puttsPerHole / max) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right font-sans text-xs text-ink-500 tabular-nums">{cr.puttsPerHole.toFixed(2)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
