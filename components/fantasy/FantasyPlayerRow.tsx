// components/fantasy/FantasyPlayerRow.tsx
"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import type { FantasySlot } from "@/lib/fantasy/draftState";

/**
 * One row in a draft tab's player list. Tapping it navigates to that
 * player's real profile page with ?draftSlot= set, which shows a "Draft"
 * button there (see FantasyDraftActionBar) instead of picking inline -
 * see the design spec for why. A row for a player already picked into a
 * *different* slot is shown disabled, since the server would reject that
 * combination anyway (lib/fantasy/validate.ts: all three picks must be
 * different players).
 */
export function FantasyPlayerRow({
  player,
  team,
  tournamentSlug,
  slot,
  selected,
  disabled,
}: {
  player: string;
  team: Team;
  tournamentSlug: string;
  slot: FantasySlot;
  selected: boolean;
  disabled: boolean;
}) {
  const displayName = getPlayerDisplayName(player);
  const avatar = getPlayerAvatar(player);

  const content = (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar src={avatar} name={displayName} team={team} size="md" />
      <span className="min-w-0 flex-1 truncate font-sans text-sm font-semibold text-ink-900">{displayName}</span>
    </div>
  );

  if (disabled) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-transparent px-3 py-3 opacity-40">
        {content}
        <span className="shrink-0 font-condensed text-2xs uppercase tracking-wide text-ink-400">Picked elsewhere</span>
      </div>
    );
  }

  return (
    <Link
      href={`/leaderboard/${tournamentSlug}/players/${encodeURIComponent(player.toLowerCase())}?draftSlot=${slot}`}
      className={[
        "flex items-center justify-between gap-3 rounded-md border px-3 py-3 transition-colors",
        selected ? "border-gold-500 bg-gold-200/30" : "border-transparent hover:bg-cream-100",
      ].join(" ")}
    >
      {content}
      {selected ? (
        <span className="shrink-0 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700">Drafted</span>
      ) : (
        <span aria-hidden="true" className="shrink-0 text-ink-300">
          →
        </span>
      )}
    </Link>
  );
}
