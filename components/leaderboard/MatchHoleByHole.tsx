import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { HoleMarkerForDiff } from "@/components/scorecard/HoleMarker";
import { getPlayerDisplayName } from "@/lib/data/players";
import { getMatchHoleByHole, type MatchHoleByHole as MatchHoleByHoleData, type MatchHoleStatus } from "@/lib/data/matchHoleByHole";
import { matchLabel, matchLeader } from "@/components/leaderboard/matchUtils";
import type { RealMatch, Team, Tournament } from "@/lib/data/types";

function lastNames(players: string[]) {
  return players
    .map((player) => {
      const name = getPlayerDisplayName(player).split(" ").pop() ?? player;
      if (name.toLowerCase() === "wojciechowski") return "WOJO";
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    })
    .join(" & ");
}

function statusCellColor(leader: Team | null) {
  if (leader === "maroon") return "bg-maroon-700 text-white";
  if (leader === "white") return "bg-white text-maroon-700";
  return "bg-cream-100 text-maroon-700";
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

function statusDivider(nextLeader: Team | null) {
  return nextLeader === "maroon" ? "border-gold-600" : "border-ink-300";
}

function TeamStatusCell({ status, nextStatus, endedFill }: { status?: MatchHoleStatus; nextStatus?: MatchHoleStatus; endedFill: Team | null }) {
  const nextLeader = nextStatus?.leader ?? endedFill;
  const divider = statusDivider(nextLeader);
  if (!status) {
    const fill = endedFill === "maroon" ? "bg-maroon-700" : endedFill === "white" ? "bg-white" : "bg-cream-100";
    return <div className={["flex h-9 min-w-0 flex-1 border-r", fill, divider].join(" ")} />;
  }
  return (
    <div className={["flex h-9 min-w-0 flex-1 items-center justify-center border-r bg-cream-100", divider].join(" ")}>
      <span className={["flex h-full w-full items-center justify-center gap-px font-condensed text-sm font-extrabold", statusCellColor(status.leader)].join(" ")}>
        {status.leader ? Math.abs(status.tally) : "AS"}
        {status.leader === "maroon" ? <ArrowUp size={14} strokeWidth={3} aria-label="Maroon up" /> : status.leader === "white" ? <ArrowDown size={14} strokeWidth={3} aria-label="White up" /> : null}
      </span>
    </div>
  );
}

function SideCell({ children, className }: { children: ReactNode; className: string }) {
  return <div className={["flex w-[72px] shrink-0 items-center justify-center border-r border-ink-300 px-1 text-center", className].join(" ")}>{children}</div>;
}

function TotalCell({ children, className }: { children: ReactNode; className: string }) {
  return <div className={["flex w-14 shrink-0 items-center justify-center border-l border-ink-300 px-1 text-center", className].join(" ")}>{children}</div>;
}

function SinglesNinePage({ holes, statusByHole, endedFill }: { holes: MatchHoleByHoleData["allHoles"]; statusByHole: Map<number, MatchHoleStatus>; endedFill: Team | null }) {
  return (
    <div className="flex w-full shrink-0 snap-start flex-col">
      <div className="flex">{holes.map((hole) => <div key={hole.hole} className="flex h-8 min-w-0 flex-1 items-center justify-center border-r border-ink-300 bg-cream-100 font-sans text-xs font-semibold tabular-nums text-maroon-700">{hole.hole}</div>)}</div>
      <div className="flex">{holes.map((hole) => <div key={hole.hole} className="flex h-8 min-w-0 flex-1 items-center justify-center border-r border-ink-300 bg-cream-100 font-sans text-xs tabular-nums text-maroon-700">{hole.par}</div>)}</div>
      <div className="flex">{holes.map((hole) => <div key={hole.hole} className="flex h-11 min-w-0 flex-1 items-center justify-center border-r border-gold-600 bg-maroon-700"><HoleMarkerForDiff diff={hole.maroonScore - hole.par} size={24} tone="white">{hole.maroonScore}</HoleMarkerForDiff></div>)}</div>
      <div className="flex">{holes.map((hole) => <TeamStatusCell key={hole.hole} status={statusByHole.get(hole.hole)} nextStatus={statusByHole.get(hole.hole + 1)} endedFill={endedFill} />)}</div>
      <div className="flex">{holes.map((hole) => <div key={hole.hole} className="flex h-11 min-w-0 flex-1 items-center justify-center border-r border-ink-300 bg-white"><HoleMarkerForDiff diff={hole.whiteScore - hole.par} size={24} tone="maroon">{hole.whiteScore}</HoleMarkerForDiff></div>)}</div>
    </div>
  );
}

function SinglesMatchGrid({ tournament, match, tournamentSlug }: { tournament: Tournament; match: RealMatch; tournamentSlug: string }) {
  const data = getMatchHoleByHole(tournament, match);
  if (!data) return <NotAvailable format={match.format} />;

  const statusByHole = new Map(data.holes.map((hole) => [hole.hole, hole]));
  const maroonTotal = data.allHoles.reduce((total, hole) => total + hole.maroonScore, 0);
  const whiteTotal = data.allHoles.reduce((total, hole) => total + hole.whiteScore, 0);
  const parTotal = data.allHoles.reduce((total, hole) => total + hole.par, 0);
  const winner = matchLeader(match);
  const endedFill: Team | null = winner === "tie" ? null : winner;
  const resultTone = winner === "maroon" ? "bg-maroon-700 text-white" : winner === "white" ? "bg-white text-maroon-700" : "bg-cream-100 text-maroon-700";
  const front = data.allHoles.slice(0, 9);
  const back = data.allHoles.slice(9, 18);

  return (
    <div className="mx-0 flex border-y border-ink-300 bg-cream-100">
      <div className="flex w-[72px] shrink-0 flex-col">
        <SideCell className="h-8 bg-cream-100 text-maroon-700"><span className="font-condensed text-[10px] font-bold uppercase tracking-eyebrow">Hole</span></SideCell>
        <SideCell className="h-8 bg-cream-100 text-maroon-700"><span className="font-condensed text-[10px] font-bold uppercase tracking-eyebrow">Par</span></SideCell>
        <SideCell className="h-11 border-gold-600 bg-maroon-700 text-white"><Link href={`/leaderboard/${tournamentSlug}/players/${data.maroonPlayers[0].toLowerCase()}`} className="truncate font-condensed text-[10px] font-bold uppercase tracking-wide hover:underline">{lastNames(data.maroonPlayers)}</Link></SideCell>
        <SideCell className="h-9 bg-cream-100 text-maroon-700"><span className="font-condensed text-[10px] font-bold uppercase tracking-eyebrow">Status</span></SideCell>
        <SideCell className="h-11 bg-white text-maroon-700"><Link href={`/leaderboard/${tournamentSlug}/players/${data.whitePlayers[0].toLowerCase()}`} className="truncate font-condensed text-[10px] font-bold uppercase tracking-wide hover:underline">{lastNames(data.whitePlayers)}</Link></SideCell>
      </div>

      <div className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden">
        <SinglesNinePage holes={front} statusByHole={statusByHole} endedFill={endedFill} />
        <SinglesNinePage holes={back} statusByHole={statusByHole} endedFill={endedFill} />
      </div>

      <div className="flex w-14 shrink-0 flex-col">
        <TotalCell className="h-8 bg-cream-100 text-maroon-700"><span className="font-condensed text-[10px] font-bold uppercase tracking-eyebrow">Tot</span></TotalCell>
        <TotalCell className="h-8 bg-cream-100 font-sans text-xs font-semibold tabular-nums text-maroon-700">{parTotal}</TotalCell>
        <TotalCell className="h-11 border-gold-600 bg-maroon-700 font-score text-xs font-bold tabular-nums text-white">{maroonTotal}</TotalCell>
        <TotalCell className={["h-9 px-0 font-condensed text-3xs font-extrabold uppercase", resultTone].join(" ")}>{matchLabel(match)}</TotalCell>
        <TotalCell className="h-11 bg-white font-score text-xs font-bold tabular-nums text-maroon-700">{whiteTotal}</TotalCell>
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
export function MatchHoleByHole({ tournament, match, tournamentSlug }: { tournament: Tournament; match: RealMatch; tournamentSlug: string }) {
  if (match.format === "Singles") return <SinglesMatchGrid tournament={tournament} match={match} tournamentSlug={tournamentSlug} />;
  return <LegacyMatchHoleByHole tournament={tournament} match={match} />;
}
