import type { ReactNode } from "react";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { getPlayerDisplayName } from "@/lib/data/players";
import { getMatchHoleByHole, type MatchHoleStatus } from "@/lib/data/matchHoleByHole";
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

function lastNames(players: string[]) {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

function statusCellColor(leader: Team | null) {
  if (leader === "maroon") return "border-maroon-200 bg-maroon-50 text-maroon-700";
  if (leader === "white") return "border-ink-200 bg-white text-ink-900";
  return "border-ink-300 bg-ink-100 text-ink-900";
}

function HeaderCell({ value }: { value: number }) {
  return (
    <div className="flex h-7 w-9 shrink-0 items-center justify-center border-r border-white/15 bg-maroon-700">
      <span className="font-sans text-2xs font-semibold tabular-nums text-white">{value}</span>
    </div>
  );
}

function ParCell({ value }: { value: number }) {
  return (
    <div className="flex h-6 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100">
      <span className="font-sans text-2xs tabular-nums text-maroon-500">{value}</span>
    </div>
  );
}

function TeamScoreCell({ score, par }: { score: number; par: number }) {
  return (
    <div className="flex h-10 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100">
      <HoleMarkerForDiff diff={score - par} size={26} tone="maroon">
        {score}
      </HoleMarkerForDiff>
    </div>
  );
}

function StatusCell({ hole }: { hole: MatchHoleStatus }) {
  return (
    <div className="flex h-8 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100 p-0.5">
      <span
        className={["flex h-full w-full items-center justify-center rounded-xs border font-condensed text-3xs font-extrabold uppercase", statusCellColor(hole.leader)].join(
          " ",
        )}
      >
        {hole.label}
      </span>
    </div>
  );
}

function RowLabel({ children, height }: { children: ReactNode; height: string }) {
  return (
    <div className={["flex w-24 shrink-0 items-center border-r border-ink-300 bg-cream-100 pl-2 pr-1", height].join(" ")}>
      <span className="truncate font-condensed text-[10px] font-bold uppercase tracking-wide text-maroon-700">{children}</span>
    </div>
  );
}

function NinePage({ holes, maroonNames, whiteNames }: { holes: MatchHoleStatus[]; maroonNames: string; whiteNames: string }) {
  return (
    <div className="flex w-full shrink-0 snap-start flex-col">
      <div className="flex">
        {holes.map((h) => (
          <HeaderCell key={h.hole} value={h.hole} />
        ))}
      </div>
      <div className="flex">
        {holes.map((h) => (
          <ParCell key={h.hole} value={h.par} />
        ))}
      </div>
      <div className="flex" title={maroonNames}>
        {holes.map((h) => (
          <TeamScoreCell key={h.hole} score={h.maroonScore} par={h.par} />
        ))}
      </div>
      <div className="flex" title={whiteNames}>
        {holes.map((h) => (
          <TeamScoreCell key={h.hole} score={h.whiteScore} par={h.par} />
        ))}
      </div>
      <div className="flex">
        {holes.map((h) => (
          <StatusCell key={h.hole} hole={h} />
        ))}
      </div>
    </div>
  );
}

function NotAvailable({ format }: { format: string }) {
  return (
    <div className="border-y border-ink-100 bg-cream-50 px-4 py-4 text-center">
      <p className="m-0 font-sans text-xs text-ink-500">
        {format === "Alt Shot"
          ? "Hole-by-hole detail isn't available for Alt Shot matches — only the shared team score was recorded, not each hole."
          : "Hole-by-hole detail isn't available for this match yet."}
      </p>
    </div>
  );
}

/**
 * Expanded, read-only hole-by-hole strip for a single match — mirrors the
 * dense hole grid pattern from `MobileScorecardGrid` (fixed left label
 * column, horizontally scrolling snap-per-9 hole columns) but for a match's
 * running status rather than one player's round.
 */
export function MatchHoleByHole({ tournament, match }: { tournament: Tournament; match: RealMatch }) {
  const data = getMatchHoleByHole(tournament, match);
  if (!data) return <NotAvailable format={match.format} />;

  const front = data.holes.slice(0, 9);
  const back = data.holes.slice(9);
  const maroonNames = lastNames(data.maroonPlayers);
  const whiteNames = lastNames(data.whitePlayers);

  return (
    <div className="flex border-y border-ink-300 bg-cream-100">
      <div className="flex w-24 shrink-0 flex-col">
        <RowLabel height="h-7">Hole</RowLabel>
        <RowLabel height="h-6">Par</RowLabel>
        <RowLabel height="h-10">{maroonNames}</RowLabel>
        <RowLabel height="h-10">{whiteNames}</RowLabel>
        <RowLabel height="h-8">Status</RowLabel>
      </div>

      <div className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        <NinePage holes={front} maroonNames={maroonNames} whiteNames={whiteNames} />
        {back.length > 0 && <NinePage holes={back} maroonNames={maroonNames} whiteNames={whiteNames} />}
      </div>
    </div>
  );
}
