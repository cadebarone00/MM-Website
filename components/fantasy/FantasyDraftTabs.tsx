// components/fantasy/FantasyDraftTabs.tsx
"use client";

import { useState } from "react";
import { Shirt, ThumbsUp, Layers } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FantasyPlayerRow } from "./FantasyPlayerRow";
import { isDraftComplete, nextEmptySlot, type DraftPicks, type FantasySlot } from "@/lib/fantasy/draftState";
import type { Tournament, Team } from "@/lib/data/types";

const TABS: { slot: FantasySlot; label: string; icon: typeof Shirt }[] = [
  { slot: "maroon", label: "Maroon", icon: Shirt },
  { slot: "white", label: "White", icon: ThumbsUp },
  { slot: "wildcard", label: "Wildcard", icon: Layers },
];

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
  onSubmit,
  onCancel,
  saving,
  error,
}: {
  tournament: Tournament;
  picks: DraftPicks;
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [activeTab, setActiveTab] = useState<FantasySlot>(nextEmptySlot(picks) ?? "maroon");
  const complete = isDraftComplete(picks);
  const missing = TABS.filter((tab) => !picks[tab.slot]).map((tab) => tab.label);
  const excluded = otherPicks(picks, activeTab);

  return (
    <div className="pb-48">
      <div className="flex items-start justify-between gap-3">
        <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Draft Your Team</h1>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="mt-2 font-sans text-sm text-ink-500">Pick one Maroon player, one White player, and a Wildcard from either team.</p>

      <div role="tablist" aria-label="Fantasy draft slots" className="mt-5 flex gap-2 border-b-2 border-ink-100">
        {TABS.map(({ slot, label, icon: Icon }) => {
          const active = activeTab === slot;
          return (
            <button
              key={slot}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(slot)}
              className={[
                "flex flex-1 flex-col items-center gap-1 border-b-2 px-2 pb-3 pt-1 font-condensed text-xs font-bold uppercase tracking-wide transition-colors",
                active ? "border-maroon-700 text-ink-900" : "border-transparent text-ink-400",
              ].join(" ")}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="flex items-center gap-1">
                {label}
                {picks[slot] && <span className="h-1.5 w-1.5 rounded-full bg-maroon-700" aria-hidden="true" />}
              </span>
            </button>
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
          />
        ))}
      </div>

      {error && <p className="mt-4 font-sans text-2xs text-score-under">{error}</p>}

      <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom)+2.5vh)] z-30 border-t border-ink-100 bg-white px-4 py-4 lg:bottom-0">
        <p className="mb-2 font-sans text-2xs text-ink-500">{complete ? "All three picked." : `Still need: ${missing.join(", ")}`}</p>
        <Button fullWidth disabled={!complete || saving} onClick={onSubmit}>
          {saving ? "Submitting..." : "Submit Lineup"}
        </Button>
      </div>
    </div>
  );
}
