"use client";

import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";

export interface PlayerOption {
  player: string;
  team: Team;
}

/**
 * One labeled pick slot (Maroon / White / Wildcard) — a grid of avatar
 * buttons drawn from that slot's eligible roster, rather than a plain
 * <select>, so picks look consistent with the rest of the site. Players
 * already chosen in one of the *other* slots show up disabled here, which
 * is what actually prevents picking the same player twice.
 */
export function PlayerPickerSlot({
  label,
  hint,
  options,
  disabledPlayers,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  options: PlayerOption[];
  disabledPlayers: string[];
  selected: string | null;
  onSelect: (player: string) => void;
}) {
  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <p className="m-0 font-condensed text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className="m-0 mt-[2px] font-sans text-2xs text-ink-400">{hint}</p>

      {options.length === 0 ? (
        <p className="mt-3 font-sans text-sm text-ink-400">Roster not set yet — check back closer to the tournament.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3">
          {options.map(({ player, team }) => {
            const isSelected = selected?.toLowerCase() === player.toLowerCase();
            const isDisabled = !isSelected && disabledPlayers.some((p) => p.toLowerCase() === player.toLowerCase());
            return (
              <button
                key={player}
                type="button"
                disabled={isDisabled}
                onClick={() => onSelect(player)}
                className={[
                  "flex w-[74px] flex-col items-center gap-1 rounded-md border px-1 py-2 transition-colors",
                  isSelected ? "border-gold-500 bg-gold-200/30" : "border-transparent hover:bg-cream-100",
                  isDisabled ? "cursor-not-allowed opacity-35" : "cursor-pointer",
                ].join(" ")}
              >
                <Avatar src={getPlayerAvatar(player)} name={getPlayerDisplayName(player)} team={team} size="md" />
                <span className="text-center font-sans text-2xs font-semibold leading-tight text-ink-800">
                  {getPlayerDisplayName(player).split(" ")[0]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
