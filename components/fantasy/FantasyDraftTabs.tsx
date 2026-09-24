// components/fantasy/FantasyDraftTabs.tsx
"use client";

import { useState } from "react";
import { Shirt, ThumbsUp, Layers, UserRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { FantasyPlayerRow } from "./FantasyPlayerRow";
import { getPlayerAvatar, getPlayerFirstName } from "@/lib/data/players";
import { isDraftComplete, nextEmptySlot, type DraftPicks, type FantasySlot } from "@/lib/fantasy/draftState";
import type { Tournament, Team } from "@/lib/data/types";

const TABS: { slot: FantasySlot; label: string; icon: typeof Shirt }[] = [
  { slot: "maroon", label: "Maroon", icon: Shirt },
  { slot: "white", label: "White", icon: ThumbsUp },
  { slot: "wildcard", label: "Wildcard", icon: Layers },
];

/** Before a slot has a pick, its avatar spot shows this team-colored circle instead. */
const SLOT_PLACEHOLDER: Record<FantasySlot, { fill: string; icon: string }> = {
  maroon: { fill: "bg-maroon-700", icon: "text-white" },
  white: { fill: "bg-white border-2 border-ink-300", icon: "text-ink-400" },
  wildcard: { fill: "bg-gold-400", icon: "text-white" },
};

function teamOf(tournament: Tournament, player: string): Team {
  return tournament.roster.maroon.some((p) => p.toLowerCase() === player.toLowerCase()) ? "maroon" : "white";
}

function rosterFor(tournament: Tournament, picks: DraftPicks, slot: FantasySlot): { player: string; team: Team }[] {
  if (slot === "maroon") return tournament.roster.maroon.map((player) => ({ player, team: "maroon" as Team }));
  if (slot === "white") return tournament.roster.white.map((player) => ({ player, team: "white" as Team }));
  const both = [
    ...tournament.roster.maroon.map((player) => ({ player, team: "maroon" as Team })),
    ...tournament.roster.white.map((player) => ({ player, team: "white" as Team })),
  ];
  return both.filter(
    ({ player }) => player.toLowerCase() !== picks.maroon?.toLowerCase() && player.toLowerCase() !== picks.white?.toLowerCase()
  );
}

function otherPicks(picks: DraftPicks, slot: FantasySlot): string[] {
  return (Object.keys(picks) as FantasySlot[]).filter((key) => key !== slot && picks[key]).map((key) => picks[key] as string);
}

export function FantasyDraftTabs({
  tournament,
  picks,
  onPick,
  onSubmit,
  onCancel,
  saving,
  error,
  teamName,
  onTeamNameChange,
}: {
  tournament: Tournament;
  picks: DraftPicks;
  onPick: (slot: FantasySlot, player: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  teamName: string;
  onTeamNameChange: (teamName: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<FantasySlot>(nextEmptySlot(picks) ?? "maroon");
  const complete = isDraftComplete(picks);
  const excluded = otherPicks(picks, activeTab);

  return (
    <div className="pb-48">
      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={onCancel}
          className="absolute left-0 font-condensed text-2xs font-bold uppercase tracking-wide text-maroon-700 hover:underline"
        >
          Cancel
        </button>
        <h1 className="m-0 font-serif text-xl font-bold uppercase tracking-wide text-ink-900">Draft Your Roster</h1>
      </div>

      <input
        type="text"
        value={teamName}
        onChange={(event) => onTeamNameChange(event.target.value)}
        placeholder="Team Name"
        maxLength={40}
        aria-label="Team name"
        className="mt-4 w-full rounded-md border border-ink-200 bg-white px-4 py-2 text-center font-serif text-base font-bold text-ink-900 placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:normal-case placeholder:text-ink-300 focus:border-maroon-700 focus:outline-none"
      />

      <div aria-hidden="true" className="mt-6 flex items-center justify-between px-1">
        {[0, 1, 2, 3].map((line) => (
          <span key={line} className="h-4 w-[3px] rounded-pill bg-gold-500" />
        ))}
      </div>

      <div role="tablist" aria-label="Fantasy draft slots" className="mt-2 grid grid-cols-3 gap-2">
        {TABS.map(({ slot, label, icon: Icon }) => {
          const active = activeTab === slot;
          const pickedPlayer = picks[slot];
          const placeholder = SLOT_PLACEHOLDER[slot];
          return (
            <div key={slot} className="flex flex-col items-center gap-1">
              <div className="flex h-14 flex-col items-center justify-end">
                {pickedPlayer ? (
                  <>
                    <Avatar src={getPlayerAvatar(pickedPlayer)} name={getPlayerFirstName(pickedPlayer)} team={teamOf(tournament, pickedPlayer)} size="sm" />
                    <span className="mt-0.5 max-w-full truncate font-sans text-3xs font-semibold text-ink-700">
                      {getPlayerFirstName(pickedPlayer)}
                    </span>
                  </>
                ) : (
                  <span className={["flex h-8 w-8 items-center justify-center rounded-full", placeholder.fill].join(" ")}>
                    <UserRound size={16} strokeWidth={1.7} className={placeholder.icon} aria-hidden="true" />
                  </span>
                )}
              </div>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(slot)}
                className={[
                  "flex w-full flex-col items-center gap-1 border-b-2 pb-2 pt-1 font-condensed text-xs font-bold uppercase tracking-wide transition-colors",
                  active ? "border-maroon-700 text-ink-900" : "border-transparent text-ink-400",
                ].join(" ")}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {rosterFor(tournament, picks, activeTab).map(({ player, team }) => (
          <FantasyPlayerRow
            key={player}
            player={player}
            team={team}
            tournamentSlug={tournament.slug}
            slot={activeTab}
            selected={picks[activeTab]?.toLowerCase() === player.toLowerCase()}
            disabled={excluded.some((p) => p.toLowerCase() === player.toLowerCase())}
            onDraft={() => onPick(activeTab, player)}
          />
        ))}
      </div>

      {error && <p className="mt-4 font-sans text-2xs text-score-under">{error}</p>}

      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom)+2.5vh)] z-30 border-t border-ink-100 bg-white px-4 py-4 lg:bottom-0">
        <Button fullWidth disabled={!complete || saving} onClick={onSubmit}>
          {saving ? "Submitting..." : "Submit Lineup"}
        </Button>
      </div>
    </div>
  );
}
