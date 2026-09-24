"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MatchProfile } from "./MatchProfile";
import { LiveMatchScorecard } from "./LiveMatchScorecard";
import { profileMatch, type MatchProfileEntry } from "@/lib/live/matchProfile";

export function LiveMatchProfile({ tournamentSlug, matchId }: { tournamentSlug: string; matchId: string }) {
  const [entry, setEntry] = useState<MatchProfileEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await fetch(`/api/live/matches/${encodeURIComponent(matchId)}?profile=1`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 404 ? "This match has not been posted yet." : "Unable to refresh this match. Showing the last successful update, if available.");
        const data = await response.json();
        if (!data.ok) throw new Error("Unable to load this match.");
        if (!controller.signal.aborted) { setEntry(data); setError(null); }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Unable to load this match.");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 5000);
      }
    }
    load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [matchId]);
  if (!entry) return <main className="mx-auto max-w-[1200px] p-7"><Link href={`/leaderboard/${tournamentSlug}`} className="text-maroon-700">← Back</Link><p className="py-12 text-center" role="status">{error ?? "Loading match…"}</p></main>;
  const match = profileMatch(entry);
  return <>{error && <p role="status" className="mx-auto max-w-[1200px] px-7 pt-4 text-sm text-ink-500">{error}</p>}<MatchProfile match={match} tournamentSlug={tournamentSlug} editionLabel={`${entry.match.season_year} Maroon Masters`} round={entry.match.round} live odds={entry.oddsHistory} scorecard={<LiveMatchScorecard match={match} scorecard={entry.scorecard} />} /></>;
}
