// components/fantasy/FantasyDraftTabs.tsx
"use client";

import { useState } from "react";
import { Shirt, ThumbsUp, Layers } from "lucide-react";
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
}: {
  tournament: Tournament;
  picks: DraftPicks;
  onPick: (slot: FantasySlot, player: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
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

      <div role="tablist" aria-label="Fantasy draft slots" className="mt-6 grid grid-cols-3 gap-2">
        {TABS.map(({ slot, label, icon: Icon }) => {
          const active = activeTab === slot;
          const pickedPlayer = picks[slot];
          return (
            <div key={slot} className="flex flex-col items-center gap-1">
              <div className="flex h-14 flex-col items-center justify-end">
                {pickedPlayer && (
                  <>
                    <Avatar src={getPlayerAvatar(pickedPlayer)} name={getPlayerFirstName(pickedPlayer)} team={teamOf(tournament, pickedPlayer)} size="sm" />
                    <span className="mt-0.5 max-w-full truncate font-sans text-3xs font-semibold text-ink-700">
                      {getPlayerFirstName(pickedPlayer)}
                    </span>
                  </>
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
