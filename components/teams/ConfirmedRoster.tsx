import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import type { RosterEntry } from "@/lib/live/types";

const TEAMS: { value: Team; label: string }[] = [
  { value: "maroon", label: "Maroon" },
  { value: "white", label: "White" },
];

/**
 * The upcoming year's roster, confirmed players only (see
 * getConfirmedRoster). Unlike TeamsDirectory (past years), there are no
 * matches, scores, or a Rankings tab to show yet — just who's locked into
 * which team so far.
 */
export function ConfirmedRoster({ roster }: { roster: RosterEntry[] }) {
  if (roster.length === 0) return null;

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
      {TEAMS.map(({ value, label }) => {
        const players = roster.filter((entry) => entry.team === value);
        if (players.length === 0) return null;
        return (
          <section key={value}>
            <h2 className="font-condensed text-[13px] font-bold uppercase tracking-wide text-maroon-700">{label} — confirmed so far</h2>
            <ul className="mt-3 space-y-3">
              {players.map((entry) => {
                const displayName = getPlayerDisplayName(entry.playerSlug);
                return (
                  <li key={entry.playerSlug} className="flex items-center gap-3">
                    <Avatar src={getPlayerAvatar(entry.playerSlug)} name={displayName} team={entry.team} size="md" />
                    <span className="font-sans text-sm font-semibold text-ink-900">{displayName}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
