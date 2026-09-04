"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { PointsRibbon } from "./PointsRibbon";
import { LeaderboardBoard } from "./LeaderboardBoard";
import { useLiveTournament } from "@/lib/hooks/useLiveTournament";
import { getNextTournamentStatus, latestCompleted } from "@/lib/data";
import type { RealMatch, Tournament } from "@/lib/data/types";

type OfficialEntry = {
  match: { id: string; round: number; box_number: number; format: string; tee_time: string; maroon_players: string[]; white_players: string[] };
  officialState: { status: "upcoming" | "live" | "complete" | "closed_out"; thru: number; leader: "maroon" | "white" | "tie"; margin: number } | null;
};
type OfficialStanding = { player: string; team: "maroon" | "white"; toPar: number };

function asOfficialMatches(entries: OfficialEntry[]): RealMatch[] {
  return entries.map(({ match, officialState }) => ({
    id: match.id,
    day: match.round,
    session: "Morning",
    format: match.format,
    maroonPlayers: match.maroon_players,
    whitePlayers: match.white_players,
    maroonPts: (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState.leader === "maroon" ? 1 : (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState?.leader === "tie" ? 0.5 : 0,
    whitePts: (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState.leader === "white" ? 1 : (officialState?.status === "closed_out" || officialState?.status === "complete") && officialState?.leader === "tie" ? 0.5 : 0,
    status: officialState?.status === "closed_out" || officialState?.status === "complete" ? "final" : officialState?.status === "live" ? "live" : "scheduled",
    thru: officialState?.thru,
    leader: officialState?.leader,
    margin: officialState?.margin,
    holesRemaining: officialState ? 18 - officialState.thru : 18,
    teeTimeCst: new Date(match.tee_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  }));
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

/**
 * Live 2027 data once the feed has entries; otherwise falls back to the
 * latest completed tournament (2026) so this page previews the real
 * leaderboard styling with real data instead of sitting empty — same
 * live-else-fallback pattern the home screen's strip and quick cards
 * already use. Outside the live window with no feed data, we always show
 * the 2026 preview rather than an empty 2027 shell; during the live window
 * we show the real (possibly still-empty) 2027 tournament so "no scores
 * posted yet" reads honestly if the feed hasn't caught up yet.
 */
export function LiveLeaderboardContent() {
  const { tournament, payload, error, loading } = useLiveTournament();
  const [officialEntries, setOfficialEntries] = useState<OfficialEntry[] | null>(null);
  const [officialStandings, setOfficialStandings] = useState<OfficialStanding[] | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/matches", { cache: "no-store" }).then((res) => res.json()).then((data) => active && setOfficialEntries(data.ok ? data.matches : [])).catch(() => active && setOfficialEntries([]));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/live/standings", { cache: "no-store" }).then((res) => res.json()).then((data) => active && setOfficialStandings(data.ok ? data.standings : [])).catch(() => active && setOfficialStandings([]));
    load();
    const timer = window.setInterval(load, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const isLive = getNextTournamentStatus() === "live";
  const hasLiveData = tournament.matches.length > 0;
  const showFallback = !isLive && !hasLiveData;
  const source = showFallback ? latestCompleted : tournament;
  const officialMatches = officialEntries ? asOfficialMatches(officialEntries) : [];
  const liveSource: Tournament = officialMatches.length > 0
    ? { ...source, matches: officialMatches, individualLeaderboard: officialStandings ?? source.individualLeaderboard, maroonPts: officialMatches.reduce((sum, match) => sum + match.maroonPts, 0), whitePts: officialMatches.reduce((sum, match) => sum + match.whitePts, 0) }
    : officialStandings && officialStandings.length > 0 ? { ...source, individualLeaderboard: officialStandings } : source;

  return (
    <div>
      <div className="pt-[4vh] lg:pt-0">
        <PointsRibbon tournament={source} />
      </div>

      <div className="pt-4">
        {isLive && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Badge live>Live</Badge>
            {payload?.updatedAt && <span className="font-sans text-[11px] text-ink-400">Updated {timeAgo(payload.updatedAt)}</span>}
            {error && <span className="font-sans text-[11px] text-score-under">{error}</span>}
          </div>
        )}

        {isLive && loading && !payload && officialEntries === null ? (
          <p className="font-sans text-sm text-ink-400 py-10 text-center">Checking the live sheet...</p>
        ) : (
          <LeaderboardBoard tournament={liveSource} live={isLive} />
        )}
      </div>
    </div>
  );
}
