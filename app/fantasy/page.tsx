"use client";

import { useEffect, useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { Button } from "@/components/ui/Button";
import { PlayerPickerSlot, type PlayerOption } from "@/components/fantasy/PlayerPickerSlot";
import { FantasyResults } from "@/components/fantasy/FantasyResults";
import { fantasyTeamScore, type FantasyPicks } from "@/lib/fantasy/scoring";
import type { Team } from "@/lib/data/types";

type Slot = "maroon" | "white" | "wildcard";
type PickState = Record<Slot, string | null>;

const EMPTY_PICKS: PickState = { maroon: null, white: null, wildcard: null };

function toFantasyPicks(picks: PickState): FantasyPicks | null {
  if (!picks.maroon || !picks.white || !picks.wildcard) return null;
  return { maroonPlayer: picks.maroon, whitePlayer: picks.white, wildcardPlayer: picks.wildcard };
}

export default function FantasyPage() {
  const { tournament, loading: tournamentLoading, payload } = useLiveTournament();
  const [picks, setPicks] = useState<PickState>(EMPTY_PICKS);
  const [savedPicks, setSavedPicks] = useState<FantasyPicks | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Load whatever team the user already has saved for the current
  // tournament (if any) and prepopulate the picker with it.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/fantasy/team", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.picks) {
          setSavedPicks(data.picks);
          setPicks({ maroon: data.picks.maroonPlayer, white: data.picks.whitePlayer, wildcard: data.picks.wildcardPlayer });
        }
      } catch {
        // Couldn't load a saved team — leave the picker empty, user can still pick fresh.
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const maroonOptions: PlayerOption[] = tournament.roster.maroon.map((player) => ({ player, team: "maroon" as Team }));
  const whiteOptions: PlayerOption[] = tournament.roster.white.map((player) => ({ player, team: "white" as Team }));
  const wildcardOptions: PlayerOption[] = [...maroonOptions, ...whiteOptions];
  const rosterIsEmpty = maroonOptions.length === 0 && whiteOptions.length === 0;

  function otherPicks(slot: Slot): string[] {
    return (Object.keys(picks) as Slot[]).filter((key) => key !== slot && picks[key]).map((key) => picks[key] as string);
  }

  function selectPlayer(slot: Slot, player: string) {
    setJustSaved(false);
    setPicks((prev) => ({ ...prev, [slot]: player }));
  }

  async function handleSave() {
    const fantasyPicks = toFantasyPicks(picks);
    if (!fantasyPicks) {
      setError("Pick all three players before saving.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/fantasy/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fantasyPicks),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't save your team.");
        return;
      }
      setSavedPicks(fantasyPicks);
      setJustSaved(true);
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setSaving(false);
    }
  }

  const scores = savedPicks ? fantasyTeamScore(tournament, savedPicks) : null;

  return (
    <div>
      <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Fantasy</h1>
      <p className="mt-2 font-sans text-sm text-ink-600">
        Pick 3 players for {tournament.editionLabel}: one from Team Maroon, one from Team White, and a Wildcard from either team. Each pick
        scores points for you on every hole they finish, in every round played:
      </p>
      <ul className="mt-3 flex flex-col gap-1 font-sans text-2xs text-ink-500">
        <li><span className="font-semibold text-ink-800">Eagle or better</span> — 5 points</li>
        <li><span className="font-semibold text-ink-800">Birdie</span> — 3 points</li>
        <li><span className="font-semibold text-ink-800">Par</span> — 1 point</li>
        <li><span className="font-semibold text-ink-800">Bogey</span> — 0 points</li>
        <li><span className="font-semibold text-ink-800">Double bogey or worse</span> — -2 points</li>
      </ul>

      <div className="mt-6 flex flex-col gap-4">
        {tournamentLoading && !payload ? (
          <p className="py-6 text-center font-sans text-sm text-ink-400">Checking the live sheet...</p>
        ) : rosterIsEmpty ? (
          <p className="rounded-md border border-ink-100 bg-cream-50 px-4 py-6 text-center font-sans text-sm text-ink-500">
            Rosters for {tournament.editionLabel} haven&rsquo;t been set yet — check back closer to the tournament.
          </p>
        ) : (
          <>
            <PlayerPickerSlot
              label="Maroon"
              hint="1 player from Team Maroon"
              options={maroonOptions}
              disabledPlayers={otherPicks("maroon")}
              selected={picks.maroon}
              onSelect={(player) => selectPlayer("maroon", player)}
            />
            <PlayerPickerSlot
              label="White"
              hint="1 player from Team White"
              options={whiteOptions}
              disabledPlayers={otherPicks("white")}
              selected={picks.white}
              onSelect={(player) => selectPlayer("white", player)}
            />
            <PlayerPickerSlot
              label="Wildcard"
              hint="1 more player, from either team"
              options={wildcardOptions}
              disabledPlayers={otherPicks("wildcard")}
              selected={picks.wildcard}
              onSelect={(player) => selectPlayer("wildcard", player)}
            />

            {error && <p className="font-sans text-2xs text-score-under">{error}</p>}
            {justSaved && !error && <p className="font-sans text-2xs text-score-even">Team saved.</p>}

            <Button onClick={handleSave} disabled={saving || loadingTeam}>
              {saving ? "Saving..." : "Save Team"}
            </Button>
          </>
        )}
      </div>

      {scores && <FantasyResults tournament={tournament} scores={scores} />}
    </div>
  );
}
