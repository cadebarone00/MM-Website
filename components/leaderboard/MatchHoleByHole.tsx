import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { getPlayerDisplayName } from "@/lib/data/players";
import { getMatchHoleByHole, type MatchHoleStatus } from "@/lib/data/matchHoleByHole";
import { matchLabel, matchLeader } from "@/components/leaderboard/matchUtils";
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

function lastNames(players: string[]) {
  return players.map((p) => getPlayerDisplayName(p).split(" ").pop()).join(" & ");
}

function statusCellColor(leader: Team | null) {
  if (leader === "maroon") return "border-maroon-300 bg-maroon-700/15 text-maroon-700";
  if (leader === "white") return "border-ink-300 bg-white/70 text-ink-800";
  return "border-ink-300 bg-ink-100 text-ink-900";
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

const singlesGrid = "grid grid-cols-[minmax(78px,1.8fr)_repeat(18,minmax(0,1fr))_minmax(54px,1.2fr)]";

function GridCell({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <div className={["flex min-w-0 items-center justify-center border-r border-b border-ink-300", className].join(" ")}>{children}</div>;
}

function SinglesStatusCell({ status }: { status?: MatchHoleStatus }) {
  if (!status) return <GridCell className="h-8 bg-cream-100" />;

  return (
    <GridCell className="h-8 bg-cream-100 p-px">
      <span className={["flex h-full w-full items-center justify-center gap-px rounded-xs border font-condensed text-3xs font-extrabold", statusCellColor(status.leader)].join(" ")}>
        {status.leader === "maroon" ? <ArrowUp size={10} strokeWidth={3} aria-label="Maroon up" /> : status.leader === "white" ? <ArrowDown size={10} strokeWidth={3} aria-label="White up" /> : null}
        {status.leader ? Math.abs(status.tally) : "AS"}
      </span>
    </GridCell>
  );
}

function SinglesMatchGrid({ tournament, match }: { tournament: Tournament; match: RealMatch }) {
  const data = getMatchHoleByHole(tournament, match);
  if (!data) return <NotAvailable format={match.format} />;

  const statusByHole = new Map(data.holes.map((hole) => [hole.hole, hole]));
  const maroonTotal = data.allHoles.reduce((total, hole) => total + hole.maroonScore, 0);
  const whiteTotal = data.allHoles.reduce((total, hole) => total + hole.whiteScore, 0);
  const parTotal = data.allHoles.reduce((total, hole) => total + hole.par, 0);
  const winner = matchLeader(match);
  const resultTone = winner === "maroon" ? "border-maroon-300 bg-maroon-700/15 text-maroon-700" : winner === "white" ? "border-ink-300 bg-white/70 text-ink-800" : "border-ink-300 bg-ink-100 text-ink-900";

  return (
    <div className="overflow-hidden border-y border-ink-300 bg-cream-100">
      <div className={singlesGrid}>
        <GridCell className="h-7 justify-start bg-maroon-700 px-2 text-left text-white"><span className="font-condensed text-3xs font-bold uppercase tracking-wide">Hole</span></GridCell>
        {data.allHoles.map((hole) => <GridCell key={hole.hole} className="h-7 bg-maroon-700 text-white"><span className="font-sans text-[10px] font-semibold tabular-nums">{hole.hole}</span></GridCell>)}
        <GridCell className="h-7 bg-maroon-700 text-white"><span className="font-condensed text-3xs font-bold uppercase">Total</span></GridCell>
      </div>

      <div className={singlesGrid}>
        <GridCell className="h-6 justify-start bg-cream-100 px-2"><span className="font-condensed text-3xs font-bold uppercase tracking-wide text-maroon-700">Par</span></GridCell>
        {data.allHoles.map((hole) => <GridCell key={hole.hole} className="h-6 bg-cream-100"><span className="font-sans text-[10px] tabular-nums text-maroon-500">{hole.par}</span></GridCell>)}
        <GridCell className="h-6 bg-cream-100"><span className="font-sans text-[10px] font-semibold tabular-nums text-maroon-700">{parTotal}</span></GridCell>
      </div>

      <div className={singlesGrid}>
        <GridCell className="h-9 justify-start bg-cream-100 px-2"><span className="truncate font-condensed text-3xs font-bold uppercase tracking-wide text-maroon-700">{lastNames(data.maroonPlayers)}</span></GridCell>
        {data.allHoles.map((hole) => <GridCell key={hole.hole} className="h-9 bg-cream-100"><HoleMarkerForDiff diff={hole.maroonScore - hole.par} size={20} tone="maroon">{hole.maroonScore}</HoleMarkerForDiff></GridCell>)}
        <GridCell className="h-9 bg-cream-100"><span className="font-score text-xs font-bold tabular-nums text-maroon-700">{maroonTotal}</span></GridCell>
      </div>

      <div className={singlesGrid}>
        <GridCell className="h-8 justify-start bg-cream-100 px-2"><span className="font-condensed text-3xs font-bold uppercase tracking-wide text-maroon-700">Status</span></GridCell>
        {data.allHoles.map((hole) => <SinglesStatusCell key={hole.hole} status={statusByHole.get(hole.hole)} />)}
        <GridCell className="h-8 bg-cream-100 p-px"><span className={["flex h-full w-full items-center justify-center rounded-xs border font-condensed text-3xs font-extrabold uppercase", resultTone].join(" ")}>{matchLabel(match)}</span></GridCell>
      </div>

      <div className={singlesGrid}>
        <GridCell className="h-9 justify-start bg-cream-100 px-2"><span className="truncate font-condensed text-3xs font-bold uppercase tracking-wide text-ink-800">{lastNames(data.whitePlayers)}</span></GridCell>
        {data.allHoles.map((hole) => <GridCell key={hole.hole} className="h-9 bg-cream-100"><HoleMarkerForDiff diff={hole.whiteScore - hole.par} size={20} tone="maroon">{hole.whiteScore}</HoleMarkerForDiff></GridCell>)}
        <GridCell className="h-9 bg-cream-100"><span className="font-score text-xs font-bold tabular-nums text-ink-800">{whiteTotal}</span></GridCell>
      </div>
    </div>
  );
}

function LegacyHeaderCell({ value }: { value: number }) {
  return <div className="flex h-7 w-9 shrink-0 items-center justify-center border-r border-white/15 bg-maroon-700 font-sans text-2xs font-semibold tabular-nums text-white">{value}</div>;
}

function LegacyRowLabel({ children, height }: { children: ReactNode; height: string }) {
  return <div className={["flex w-24 shrink-0 items-center border-r border-ink-300 bg-cream-100 px-2", height].join(" ")}><span className="truncate font-condensed text-[10px] font-bold uppercase tracking-wide text-maroon-700">{children}</span></div>;
}

function LegacyNinePage({ holes, maroonNames, whiteNames }: { holes: MatchHoleStatus[]; maroonNames: string; whiteNames: string }) {
  return (
    <div className="flex w-full shrink-0 snap-start flex-col">
      <div className="flex">{holes.map((hole) => <LegacyHeaderCell key={hole.hole} value={hole.hole} />)}</div>
      <div className="flex">{holes.map((hole) => <div key={hole.hole} className="flex h-6 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100 font-sans text-2xs tabular-nums text-maroon-500">{hole.par}</div>)}</div>
      <div className="flex" title={maroonNames}>{holes.map((hole) => <div key={hole.hole} className="flex h-10 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100"><HoleMarkerForDiff diff={hole.maroonScore - hole.par} size={26} tone="maroon">{hole.maroonScore}</HoleMarkerForDiff></div>)}</div>
      <div className="flex" title={whiteNames}>{holes.map((hole) => <div key={hole.hole} className="flex h-10 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100"><HoleMarkerForDiff diff={hole.whiteScore - hole.par} size={26} tone="maroon">{hole.whiteScore}</HoleMarkerForDiff></div>)}</div>
      <div className="flex">{holes.map((hole) => <div key={hole.hole} className="flex h-8 w-9 shrink-0 items-center justify-center border-r border-ink-300 bg-cream-100 p-0.5"><span className={["flex h-full w-full items-center justify-center rounded-xs border font-condensed text-3xs font-extrabold uppercase", statusCellColor(hole.leader)].join(" ")}>{hole.label}</span></div>)}</div>
    </div>
  );
}

/** Existing horizontally paged view, retained until Fourball gets its own compact redesign. */
function LegacyMatchHoleByHole({ tournament, match }: { tournament: Tournament; match: RealMatch }) {
  const data = getMatchHoleByHole(tournament, match);
  if (!data) return <NotAvailable format={match.format} />;

  const front = data.holes.slice(0, 9);
  const back = data.holes.slice(9);
  const maroonNames = lastNames(data.maroonPlayers);
  const whiteNames = lastNames(data.whitePlayers);

  return (
    <div className="flex border-y border-ink-300 bg-cream-100">
      <div className="flex w-24 shrink-0 flex-col">
        <LegacyRowLabel height="h-7">Hole</LegacyRowLabel>
        <LegacyRowLabel height="h-6">Par</LegacyRowLabel>
        <LegacyRowLabel height="h-10">{maroonNames}</LegacyRowLabel>
        <LegacyRowLabel height="h-10">{whiteNames}</LegacyRowLabel>
        <LegacyRowLabel height="h-8">Status</LegacyRowLabel>
      </div>
      <div className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        <LegacyNinePage holes={front} maroonNames={maroonNames} whiteNames={whiteNames} />
        {back.length > 0 && <LegacyNinePage holes={back} maroonNames={maroonNames} whiteNames={whiteNames} />}
      </div>
    </div>
  );
}

/** A compact, full-width 18-hole scorecard for expanded Singles matches. */
export function MatchHoleByHole({ tournament, match }: { tournament: Tournament; match: RealMatch }) {
  if (match.format === "Singles") return <SinglesMatchGrid tournament={tournament} match={match} />;
  return <LegacyMatchHoleByHole tournament={tournament} match={match} />;
}
