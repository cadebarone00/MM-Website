// app/fantasy/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus } from "@/lib/data";
import { FantasyShell, type FantasyTab } from "@/components/fantasy/FantasyShell";
import { FantasyDraftTabs } from "@/components/fantasy/FantasyDraftTabs";
import { FantasyRosterSummary } from "@/components/fantasy/FantasyRosterSummary";
import { FantasyLeaderboard } from "@/components/fantasy/FantasyLeaderboard";
import { FantasyHowToPlay } from "@/components/fantasy/FantasyHowToPlay";
import {
  EMPTY_DRAFT_PICKS,
  clearDraftPicks,
  hasDraftInProgress,
  readDraftPicks,
  safeSessionStorage,
  seedDraftPicks,
  writeDraftPick,
  type DraftPicks,
  type FantasySlot,
} from "@/lib/fantasy/draftState";
import type { FantasyPicks } from "@/lib/fantasy/scoring";
import type { UpcomingRoundScheduleItem } from "@/lib/data/activeSeasonOverlay";

function toFantasyPicks(picks: DraftPicks): FantasyPicks | null {
  if (!picks.maroon || !picks.white || !picks.wildcard) return null;
  return { maroonPlayer: picks.maroon, whitePlayer: picks.white, wildcardPlayer: picks.wildcard };
}

function toDraftPicks(picks: FantasyPicks): DraftPicks {
  return { maroon: picks.maroonPlayer, white: picks.whitePlayer, wildcard: picks.wildcardPlayer };
}

export default function FantasyPage() {
  const { tournament, loading: tournamentLoading, payload } = useLiveTournament();
  const [tab, setTab] = useState<FantasyTab>("roster");
  const [savedPicks, setSavedPicks] = useState<FantasyPicks | null>(null);
  const [rankLabel, setRankLabel] = useState<string | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [schedule, setSchedule] = useState<UpcomingRoundScheduleItem[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [picks, setPicks] = useState<DraftPicks>(EMPTY_DRAFT_PICKS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load whatever team the user already has saved for the current tournament (if any), plus where it ranks.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/fantasy/team", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok && data.picks) {
          setSavedPicks(data.picks);
          setRankLabel(data.rankLabel ?? null);
          setTotalPlayers(data.totalPlayers ?? null);
        }
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

  // The season's round schedule (which day has how many rounds, and each
  // round's format) — rarely changes, so a one-time fetch is enough.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/upcoming-round-schedule", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ok && Array.isArray(data.schedule)) setSchedule(data.schedule);
      })
      .catch(() => {
        // No schedule yet - the round-circles strip just stays empty.
      });
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

  function cancelDraft() {
    clearDraftPicks(safeSessionStorage, tournament.slug);
    setDrafting(false);
  }

  function pickPlayer(slot: FantasySlot, player: string) {
    const next = writeDraftPick(safeSessionStorage, tournament.slug, slot, player);
    setPicks(next);
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
      setRankLabel(data.rankLabel ?? null);
      setTotalPlayers(data.totalPlayers ?? null);
      setDrafting(false);
    } catch {
      setError("Couldn't reach the server - try again.");
    } finally {
      setSaving(false);
    }
  }

  function rosterTabContent() {
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
      return (
        <FantasyDraftTabs
          tournament={tournament}
          picks={picks}
          onPick={pickPlayer}
          onSubmit={submitLineup}
          onCancel={cancelDraft}
          saving={saving}
          error={error}
        />
      );
    }

    return (
      <FantasyRosterSummary
        tournament={tournament}
        picks={savedPicks}
        locked={locked}
        rankLabel={rankLabel}
        totalPlayers={totalPlayers}
        updatedAt={payload?.updatedAt ?? null}
        schedule={schedule}
        onStart={() => startDraft(EMPTY_DRAFT_PICKS)}
        onEdit={() => savedPicks && startDraft(toDraftPicks(savedPicks))}
      />
    );
  }

  return (
    <FantasyShell activeTab={tab} onTabChange={setTab}>
      {tab === "roster" && rosterTabContent()}
      {tab === "leaderboard" && <FantasyLeaderboard />}
      {tab === "how-to-play" && <FantasyHowToPlay editionLabel={tournament.editionLabel} />}
    </FantasyShell>
  );
}
