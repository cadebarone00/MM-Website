"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { GolfTripHome } from "./GolfTripHome";
import { CodeTournamentHome } from "./CodeTournamentHome";
import { LeagueHome } from "./LeagueHome";
import { SavedTripSetupProvider } from "./SavedTripSetupProvider";
import { tapInStats } from "@/lib/platform/tapInStats";
import { savedTripPresentation } from "@/lib/platform/savedTripPresentation";
import { roundScoringFrom } from "@/lib/platform/teamPoints";
import type { RoundCompSettings } from "@/lib/platform/roundCompetition";
import type { SpectatorTrip, WatchView } from "@/lib/platform/watchView";
import homeStyles from "./GolfTripHome.module.css";
import styles from "./CodeTournament.module.css";
import tapStyles from "./TripTapIn.module.css";

/** How often a watched trip checks for new scores (a watched tournament refreshes itself). */
const POLL_MS = 10_000;

/**
 * Watch with a code (/watch/<code>), no sign-in: a tournament's header and leaderboard, or a golf trip's Golf tab
 * (Leaderboard, Matches, Stats), read only and refreshing on their own. Everything private was removed on the server.
 * `sample` (the dev simulator): show this watcher's view, or "missing" for the unavailable message; nothing is loaded.
 * `toolbar`: shown under the top bar (The Maroon Live's Board | TV mode pills, owner 2026-11-23).
 */
export function WatchPage({ code, sample, toolbar }: { code: string; sample?: WatchView | "missing"; toolbar?: ReactNode }) {
  const [view, setView] = useState<WatchView | null>(sample && sample !== "missing" ? sample : null);
  const [problem, setProblem] = useState<string | null>(sample === "missing" ? "This event isn't available." : null);
  const load = useCallback(async () => {
    if (sample) return;
    const reply = await fetch(`/api/watch/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; code?: string } & Partial<WatchView>>).catch(() => null);
    if (reply?.ok && reply.kind) { setView(reply as WatchView); setProblem(null); return; }
    setProblem(reply === null ? "No connection. Scores will refresh when you're back online."
      : reply.code === "missing" ? "This event isn't available." : "Couldn't load this event. Trying again…");
  }, [code, sample]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    // A watched tournament or league refreshes itself; a trip reloads here.
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && view?.kind !== "tournament" && view?.kind !== "league") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load, view?.kind]);

  // The Maroon Live: every live page (trip or tournament) has the same top bar, back to the directory.
  if (view?.kind === "tournament") return <div className={tapStyles.spectator}><LiveTopBar />{toolbar}{sample ? <CodeTournamentHome id="sample" meId={null} sample={{ tournament: view.tournament, spectator: true }} />
    : <CodeTournamentHome id="" meId={null} watchCode={code} />}</div>;
  if (view?.kind === "trip") return <SpectatorTrip trip={view.trip} problem={problem} toolbar={toolbar} />;
  if (view?.kind === "league") return <div className={tapStyles.spectator}><LiveTopBar />{toolbar}{sample ? <LeagueHome sample={{ league: view.league, meId: "", spectator: true }} /> : <LeagueHome watchCode={code} />}</div>;
  return <div className={tapStyles.spectator}><LiveTopBar />{toolbar}<main className={homeStyles.page}><p className={styles.status} role={problem ? "alert" : undefined}>{problem ?? "Loading…"}</p></main></div>;
}

/** The top of every live page: back to The Maroon Live directory, and the brand. */
function LiveTopBar() {
  return <nav className={tapStyles.topBar} aria-label="The Maroon Live">
    <Link href="/tap-in" prefetch={false} className={tapStyles.topBack}><ChevronLeft size={18} aria-hidden="true" /> All events</Link>
    <span className={tapStyles.pill}>The Maroon Live</span>
  </nav>;
}

/** A trip's Golf tab for spectators: the same leaderboard and matches members see, built the same way. */
function SpectatorTrip({ trip, problem, toolbar }: { trip: SpectatorTrip; problem: string | null; toolbar?: ReactNode }) {
  const { savedTrip, scoring, setup, draft } = trip;
  const values = setup.values;
  const types = values.localCompetitionType as { individual: string | null; team: string | null } | undefined;
  const previewMatch = { ...savedTripPresentation(savedTrip, scoring),
    roundScoring: roundScoringFrom(savedTrip.rounds.map((r) => ({ number: r.roundNumber, dayNumber: r.dayNumber })), values.compFormats as Record<string, RoundCompSettings> | undefined,
      values.compRounds as Record<string, boolean> | undefined, Number(values.playerTotal) || savedTrip.members.length) };
  return <SavedTripSetupProvider tripId={savedTrip.trip.id} snapshot={setup} editable={false}>
    <div className={tapStyles.spectator}>
      <LiveTopBar />{toolbar}
      <header className={tapStyles.masthead}>
        <p className={tapStyles.brand}>The Maroon</p>
        <h1 className={tapStyles.tripName}>{savedTrip.trip.name}</h1>
        <p className={tapStyles.summary}>{savedTrip.members.length} players{scoring ? ` / Round ${scoring.roundNumber}` : ""}</p>
        <p className={tapStyles.following}>Follow the scores. Know the story.</p>
      </header>
      {problem && <p className={tapStyles.notice} role="status">{problem}</p>}
    <GolfTripHome tripStats={tapInStats(trip)} spectator preview={draft} settingsHref="" previewMatch={previewMatch} competitionKey={savedTrip.trip.id}
      savedCompetitionType={types} savedTeamColors={values.teamColors as (string | null)[] | undefined} />
    </div>
  </SavedTripSetupProvider>;
}
