// components/fantasy/FantasyPlayerRow.tsx
"use client";

import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getPlayerAvatar, getPlayerDisplayName } from "@/lib/data/players";
import type { Team } from "@/lib/data/types";
import type { FantasySlot } from "@/lib/fantasy/draftState";

const SLOT_FILL: Record<FantasySlot, string> = {
  maroon: "bg-maroon-700 border-maroon-700",
  white: "bg-white border-ink-300",
  wildcard: "bg-gold-400 border-gold-400",
};

const SLOT_TEXT: Record<FantasySlot, string> = {
  maroon: "text-white",
  white: "text-ink-900",
  wildcard: "text-ink-900",
};

const SLOT_DRAFT_BUTTON: Record<FantasySlot, string> = {
  maroon: "border-white/60 bg-white/10 text-white",
  white: "border-ink-300 bg-cream-50 text-ink-700",
  wildcard: "border-ink-900/20 bg-white/60 text-ink-900",
};

/**
 * One row in a draft tab's player list: Draft button, avatar, name, and a
 * "Learn More" link to the real player profile (view-only — drafting
 * happens right here, not on the profile page). Tapping Draft picks this
 * player into the active slot immediately; the row then fills with that
 * slot's color (maroon / white / gold). A player already picked into a
 * *different* slot shows disabled, since the server would reject that
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
  onDraft,
}: {
  player: string;
  team: Team;
  tournamentSlug: string;
  slot: FantasySlot;
  selected: boolean;
  disabled: boolean;
  onDraft: () => void;
}) {
  const displayName = getPlayerDisplayName(player);
  const avatar = getPlayerAvatar(player);

  return (
    <div
      className={[
        "flex items-center gap-3 rounded-md border px-3 py-2 transition-colors",
        disabled ? "border-transparent opacity-40" : selected ? SLOT_FILL[slot] : "border-transparent hover:bg-cream-100",
      ].join(" ")}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onDraft}
        className={[
          "shrink-0 rounded-pill border px-3 py-1 font-condensed text-2xs font-bold uppercase tracking-wide transition-colors",
          disabled ? "border-ink-200 text-ink-300" : selected ? SLOT_DRAFT_BUTTON[slot] : "border-maroon-700 text-maroon-700 hover:bg-maroon-50",
        ].join(" ")}
      >
        {selected ? "Drafted" : "Draft"}
      </button>

      <Avatar src={avatar} name={displayName} team={team} size="md" />

      <span className={["min-w-0 flex-1 truncate font-sans text-sm font-semibold", selected ? SLOT_TEXT[slot] : "text-ink-900"].join(" ")}>
        {displayName}
      </span>

      <Link
        href={`/leaderboard/${tournamentSlug}/players/${encodeURIComponent(player.toLowerCase())}`}
        className={[
          "shrink-0 font-condensed text-2xs font-bold uppercase tracking-wide underline-offset-2 hover:underline",
          selected ? SLOT_TEXT[slot] : "text-maroon-700",
        ].join(" ")}
      >
        Learn More
      </Link>
    </div>
  );
}
