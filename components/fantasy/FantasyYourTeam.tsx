import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { FantasyResults } from "./FantasyResults";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import { fantasyTeamScore, type FantasyPicks } from "@/lib/fantasy/scoring";
import type { Tournament, Team } from "@/lib/data/types";

function teamOf(tournament: Tournament, player: string): Team {
  return tournament.roster.maroon.some((p) => p.toLowerCase() === player.toLowerCase()) ? "maroon" : "white";
}

export function FantasyYourTeam({
  tournament,
  picks,
  locked,
  onEdit,
}: {
  tournament: Tournament;
  picks: FantasyPicks;
  locked: boolean;
  onEdit: () => void;
}) {
  const roster: { label: string; player: string }[] = [
    { label: "Maroon", player: picks.maroonPlayer },
    { label: "White", player: picks.whitePlayer },
    { label: "Wildcard", player: picks.wildcardPlayer },
  ];

  return (
    <div>
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Your Team</h1>
      <p className="mt-2 font-sans text-sm text-ink-500">{tournament.editionLabel}</p>

      <div className="mt-5 flex flex-col gap-3">
        {roster.map(({ label, player }) => (
          <div key={label} className="flex items-center gap-3 rounded-md border border-ink-100 bg-white p-3">
            <Avatar src={getPlayerAvatar(player)} name={getPlayerDisplayName(player)} team={teamOf(tournament, player)} size="md" />
            <div>
              <p className="m-0 font-condensed text-3xs font-bold uppercase tracking-wide text-ink-400">{label}</p>
              <p className="m-0 font-sans text-sm font-semibold text-ink-900">{getPlayerDisplayName(player)}</p>
            </div>
          </div>
        ))}
      </div>

      {locked ? (
        <FantasyResults tournament={tournament} scores={fantasyTeamScore(tournament, picks)} />
      ) : (
        <Button className="mt-5" variant="secondary" onClick={onEdit}>
          Edit Lineup
        </Button>
      )}
    </div>
  );
}
