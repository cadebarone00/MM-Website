// app/fantasy/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";
import { FantasyWelcome } from "@/components/fantasy/FantasyWelcome";
import { FantasyDraftTabs } from "@/components/fantasy/FantasyDraftTabs";
import { FantasyYourTeam } from "@/components/fantasy/FantasyYourTeam";
import {
  EMPTY_DRAFT_PICKS,
  clearDraftPicks,
  hasDraftInProgress,
  readDraftPicks,
  safeSessionStorage,
  seedDraftPicks,
  type DraftPicks,
} from "@/lib/fantasy/draftState";
import type { FantasyPicks } from "@/lib/fantasy/scoring";

function toFantasyPicks(picks: DraftPicks): FantasyPicks | null {
  if (!picks.maroon || !picks.white || !picks.wildcard) return null;
  return { maroonPlayer: picks.maroon, whitePlayer: picks.white, wildcardPlayer: picks.wildcard };
}

function toDraftPicks(picks: FantasyPicks): DraftPicks {
  return { maroon: picks.maroonPlayer, white: picks.whitePlayer, wildcard: picks.wildcardPlayer };
}

export default function FantasyPage() {
  const { tournament, loading: tournamentLoading, payload } = useLiveTournament();
  const [savedPicks, setSavedPicks] = useState<FantasyPicks | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [picks, setPicks] = useState<DraftPicks>(EMPTY_DRAFT_PICKS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load whatever team the user already has saved for the current tournament (if any).
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/fantasy/team", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.picks) setSavedPicks(data.picks);
      } catch {
        // Couldn't load a saved team - leave it empty, the user can still draft fresh.
      } finally {
        if (!cancelled) setLoadingTeam(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume a draft left in progress (started here, possibly continued on a
  // player's profile page and back) once the tournament slug is known.
  useEffect(() => {
    if (!tournament.slug) return;
    if (hasDraftInProgress(safeSessionStorage, tournament.slug)) {
      setPicks(readDraftPicks(safeSessionStorage, tournament.slug));
      setDrafting(true);
    }
  }, [tournament.slug]);

  const locked = getNextTournamentStatus() !== "upcoming";
  const rosterIsEmpty = tournament.roster.maroon.length === 0 && tournament.roster.white.length === 0;

  function startDraft(seed: DraftPicks) {
    seedDraftPicks(safeSessionStorage, tournament.slug, seed);
    setPicks(seed);
    setError(null);
    setDrafting(true);
  }

  async function submitLineup() {
    const fantasyPicks = toFantasyPicks(picks);
    if (!fantasyPicks) return;

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
        setError(data.error ?? "Couldn't save your lineup.");
        return;
      }
      clearDraftPicks(safeSessionStorage, tournament.slug);
      setSavedPicks(fantasyPicks);
      setDrafting(false);
    } catch {
      setError("Couldn't reach the server - try again.");
    } finally {
      setSaving(false);
    }
  }

  if ((tournamentLoading && !payload) || loadingTeam) {
    return <p className="py-10 text-center font-sans text-sm text-ink-400">Loading Fantasy...</p>;
  }

  if (rosterIsEmpty) {
    return (
      <p className="rounded-md border border-ink-100 bg-cream-50 px-4 py-6 text-center font-sans text-sm text-ink-500">
        Rosters for {tournament.editionLabel} haven&rsquo;t been set yet — check back closer to the tournament.
      </p>
    );
  }

  if (drafting && !locked) {
    return <FantasyDraftTabs tournament={tournament} picks={picks} onSubmit={submitLineup} saving={saving} error={error} />;
  }

  if (savedPicks) {
    return (
      <FantasyYourTeam
        tournament={tournament}
        picks={savedPicks}
        locked={locked}
        onEdit={() => startDraft(toDraftPicks(savedPicks))}
      />
    );
  }

  if (locked) {
    return (
      <div className="mt-10 text-center">
        <h1 className="m-0 font-serif text-2xl font-bold text-ink-900">Fantasy</h1>
        <p className="mt-3 font-sans text-sm text-ink-500">Fantasy picks are closed for {tournament.editionLabel}.</p>
      </div>
    );
  }

  return <FantasyWelcome editionLabel={tournament.editionLabel} onStart={() => startDraft(EMPTY_DRAFT_PICKS)} />;
}
