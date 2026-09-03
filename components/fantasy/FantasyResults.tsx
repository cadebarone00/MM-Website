import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Tournament, Team } from "@/lib/data/types";
import type { FantasyTeamScore } from "@/lib/fantasy/scoring";

function teamOf(tournament: Tournament, player: string): Team {
  return tournament.roster.maroon.some((p) => p.toLowerCase() === player.toLowerCase()) ? "maroon" : "white";
}

export function FantasyResults({ tournament, scores }: { tournament: Tournament; scores: FantasyTeamScore }) {
  return (
    <div className="mt-8 rounded-md border border-ink-100 bg-white p-4">
      <p className="m-0 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">Your Team&rsquo;s Points</p>
      <div className="mt-3 flex flex-col divide-y divide-ink-100">
        {scores.picks.map(({ player, points }) => (
          <div key={player} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="flex items-center gap-3">
              <Avatar src={getPlayerAvatar(player)} name={getPlayerDisplayName(player)} team={teamOf(tournament, player)} size="sm" />
              <span className="font-sans text-sm font-semibold text-ink-900">{getPlayerDisplayName(player)}</span>
            </div>
            <span className="font-score text-base font-bold tabular-nums text-ink-900">{points}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-ink-200 pt-3">
        <span className="font-condensed text-xs font-bold uppercase tracking-wide text-ink-700">Team Total</span>
        <span className="font-score text-xl font-bold tabular-nums text-maroon-700">{scores.total}</span>
      </div>
    </div>
  );
}
