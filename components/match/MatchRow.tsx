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

function TeamSide({ players, team, defendingChampion }: { players: string[]; team: Team; defendingChampion: string | null }) {
  const isMaroon = team === "maroon";
  const top = players[0];
  const bottom = players[1];

  return (
    <div className={["flex min-w-0 flex-col gap-1", isMaroon ? "items-end" : "items-start"].join(" ")}>
      {top && <Avatar name={getPlayerDisplayName(top)} src={getPlayerAvatar(top)} size="sm" team={team} />}
      {top && (
        <span className="truncate font-sans text-sm font-semibold text-ink-900 inline-flex items-center gap-[6px]">
          {getPlayerDisplayName(top)}
          {defendingChampion === top && <TrophyBadge count={1} />}
        </span>
      )}
      {bottom && (
        <span className="truncate font-sans text-sm font-semibold text-ink-900 inline-flex items-center gap-[6px]">
          {getPlayerDisplayName(bottom)}
          {defendingChampion === bottom && <TrophyBadge count={1} />}
        </span>
      )}
      {bottom && <Avatar name={getPlayerDisplayName(bottom)} src={getPlayerAvatar(bottom)} size="sm" team={team} />}
    </div>
  );
}

export function MatchRow({ match, defendingChampion = null }: { match: RealMatch; index?: number; defendingChampion?: string | null }) {
  const status = matchStatus(match);
  const centerLabel = status === "scheduled" ? "VS" : liveLabel(match);

  return (
    <div className="border-b border-ink-100 bg-white px-4 py-4 last:border-b-0">
      <div className="grid min-h-[84px] grid-cols-[minmax(0,1fr)_86px_minmax(0,1fr)] items-center gap-3">
        <TeamSide players={match.maroonPlayers} team="maroon" defendingChampion={defendingChampion} />
        <div className="flex justify-center">
          {status === "final" ? (
            <ResultChevron winner={matchLeader(match)}>{centerLabel}</ResultChevron>
          ) : (
            <span className={["inline-flex min-h-[44px] min-w-[62px] items-center justify-center rounded-pill border px-3 font-condensed text-lg font-extrabold uppercase tracking-wide", labelColor(match)].join(" ")}>
              {centerLabel}
            </span>
          )}
        </div>
        <TeamSide players={match.whitePlayers} team="white" defendingChampion={defendingChampion} />
      </div>
    </div>
  );
}
