"use client";

import { useCallback, useEffect, useState } from "react";
import { GolfTripHome } from "./GolfTripHome";
import { CodeTournamentHome } from "./CodeTournamentHome";
import { SavedTripSetupProvider } from "./SavedTripSetupProvider";
import { savedTripPresentation } from "@/lib/platform/savedTripPresentation";
import { roundScoringFrom } from "@/lib/platform/teamPoints";
import type { RoundCompSettings } from "@/lib/platform/roundCompetition";
import type { SpectatorTrip, WatchView } from "@/lib/platform/watchView";
import homeStyles from "./GolfTripHome.module.css";
import styles from "./CodeTournament.module.css";

/** How often a watched trip checks for new scores (a watched tournament refreshes itself). */
const POLL_MS = 10_000;

/**
 * Watch with a code (/watch/<code>), no sign-in: a tournament's header and leaderboard, or a golf trip's Golf tab
 * (Leaderboard, Matches, Stats), read only and refreshing on their own. Everything private was removed on the server.
 */
export function WatchPage({ code }: { code: string }) {
  const [view, setView] = useState<WatchView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(async () => {
    const reply = await fetch(`/api/watch/${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; code?: string } & Partial<WatchView>>).catch(() => null);
    if (reply?.ok && reply.kind) { setView(reply as WatchView); setProblem(null); return; }
    setProblem(reply === null ? "No connection. Scores will refresh when you're back online."
      : reply.code === "missing" ? "This event isn't available." : "Couldn't load this event. Trying again…");
  }, [code]);
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    // A watched tournament refreshes itself; a trip reloads here.
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && view?.kind !== "tournament") void load(); }, POLL_MS);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load, view?.kind]);

  if (view?.kind === "tournament") return <CodeTournamentHome id="" meId={null} watchCode={code} />;
  if (view?.kind === "trip") return <SpectatorTrip trip={view.trip} />;
  return <main className={homeStyles.page}><p className={styles.status} role={problem ? "alert" : undefined}>{problem ?? "Loading…"}</p></main>;
}

/** A trip's Golf tab for spectators: the same leaderboard and matches members see, built the same way. */
function SpectatorTrip({ trip }: { trip: SpectatorTrip }) {
  const { savedTrip, scoring, setup, draft } = trip;
  const values = setup.values;
  const types = values.localCompetitionType as { individual: string | null; team: string | null } | undefined;
  const previewMatch = { ...savedTripPresentation(savedTrip, scoring),
    roundScoring: roundScoringFrom(savedTrip.rounds.map((r) => ({ number: r.roundNumber, dayNumber: r.dayNumber })), values.compFormats as Record<string, RoundCompSettings> | undefined,
      values.compRounds as Record<string, boolean> | undefined, Number(values.playerTotal) || savedTrip.members.length) };
  return <SavedTripSetupProvider tripId={savedTrip.trip.id} snapshot={setup} editable={false}>
    <GolfTripHome spectator preview={draft} settingsHref="" previewMatch={previewMatch} competitionKey={savedTrip.trip.id}
      savedCompetitionType={types} savedTeamColors={values.teamColors as (string | null)[] | undefined} />
  </SavedTripSetupProvider>;
}
