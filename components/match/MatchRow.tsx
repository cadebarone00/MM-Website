import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { TrophyBadge } from "@/components/ui/TrophyBadge";
import { ResultChevron } from "@/components/match/ResultChevron";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { RealMatch, Team } from "@/lib/data/types";

function matchStatus(match: RealMatch) {
  if (match.status) return match.status;
  return "final";
}

function matchLeader(match: RealMatch): Team | "tie" {
  if (match.leader) return match.leader;
  if (match.maroonPts > match.whitePts) return "maroon";
  if (match.whitePts > match.maroonPts) return "white";
  return "tie";
}

function liveLabel(match: RealMatch) {
  const status = matchStatus(match);
  const leader = matchLeader(match);
  const hasMatchPlayMargin = match.margin != null;
  const margin = match.margin ?? Math.abs(match.maroonPts - match.whitePts);
  const remaining = match.holesRemaining ?? null;

  if (status === "scheduled") return match.teeTimeCst ?? "VS";
  if (leader === "tie") return "AS";
  if (!hasMatchPlayMargin) return "Won";
  if (status === "final" && remaining != null && remaining > 0) return `${margin}&${remaining}`;
  return `${margin} Up`;
}

function labelColor(match: RealMatch) {
  const leader = matchLeader(match);
  if (leader === "maroon") return "border-maroon-200 bg-maroon-50 text-maroon-700";
  if (leader === "white") return "border-ink-200 bg-white text-ink-900";
  return "border-ink-300 bg-ink-100 text-ink-900";
}

function TeamSide({
  players,
  team,
  defendingChampion,
  tournamentSlug,
}: {
  players: string[];
  team: Team;
  defendingChampion: string | null;
  tournamentSlug: string;
}) {
  const isMaroon = team === "maroon";
  const top = players[0];
  const bottom = players[1];

  return (
    <div className={["flex min-w-0 flex-col gap-1", isMaroon ? "items-end" : "items-start"].join(" ")}>
      {top && (
        <Link
          href={`/leaderboard/${tournamentSlug}/players/${top.toLowerCase()}`}
          className={["flex flex-col gap-1 hover:opacity-80 transition-opacity", isMaroon ? "items-end" : "items-start"].join(" ")}
        >
          <Avatar name={getPlayerDisplayName(top)} src={getPlayerAvatar(top)} size="sm" team={team} />
          <span className="truncate font-sans text-sm font-semibold text-ink-900 inline-flex items-center gap-[6px]">
            {getPlayerDisplayName(top)}
            {defendingChampion === top && <TrophyBadge count={1} />}
          </span>
        </Link>
      )}
      {bottom && (
        <Link
          href={`/leaderboard/${tournamentSlug}/players/${bottom.toLowerCase()}`}
          className={["flex flex-col gap-1 hover:opacity-80 transition-opacity", isMaroon ? "items-end" : "items-start"].join(" ")}
        >
          <span className="truncate font-sans text-sm font-semibold text-ink-900 inline-flex items-center gap-[6px]">
            {getPlayerDisplayName(bottom)}
            {defendingChampion === bottom && <TrophyBadge count={1} />}
          </span>
          <Avatar name={getPlayerDisplayName(bottom)} src={getPlayerAvatar(bottom)} size="sm" team={team} />
        </Link>
      )}
    </div>
  );
}

export function MatchRow({
  match,
  defendingChampion = null,
  tournamentSlug,
  size = "md",
}: {
  match: RealMatch;
  index?: number;
  defendingChampion?: string | null;
  tournamentSlug: string;
  size?: "md" | "lg";
}) {
  const status = matchStatus(match);
  const centerLabel = status === "scheduled" ? "VS" : liveLabel(match);
  const rowPadding = size === "lg" ? "px-4 py-5 sm:px-6" : "px-4 py-4";
  const gridCols = size === "lg" ? "grid-cols-[minmax(0,1fr)_110px_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)]";
  const pillClasses =
    size === "lg"
      ? "inline-flex min-h-[48px] min-w-[86px] items-center justify-center rounded-pill border px-4 font-condensed text-xl font-extrabold uppercase tracking-wide"
      : "inline-flex min-h-[44px] min-w-[62px] items-center justify-center rounded-pill border px-3 font-condensed text-lg font-extrabold uppercase tracking-wide";

  return (
    <div className={["border-b border-ink-100 bg-white last:border-b-0", rowPadding].join(" ")}>
      <div className={["grid min-h-[84px] items-center gap-3", gridCols].join(" ")}>
        <TeamSide players={match.maroonPlayers} team="maroon" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
        <div className="flex justify-center">
          {status === "final" ? (
            <ResultChevron winner={matchLeader(match)} size={size === "lg" ? "lg" : "md"}>
              {centerLabel}
            </ResultChevron>
          ) : (
            <span className={[pillClasses, labelColor(match)].join(" ")}>{centerLabel}</span>
          )}
        </div>
        <TeamSide players={match.whitePlayers} team="white" defendingChampion={defendingChampion} tournamentSlug={tournamentSlug} />
      </div>
    </div>
  );
}
