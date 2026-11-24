"use client";

import { useMemo } from "react";
import { useSimulator } from "./SimulatorBridge";
import { MaroonLiveDirectory } from "@/components/tap-in/MaroonLiveDirectory";
import { LiveEventPage } from "@/components/tap-in/LiveEventPage";
import { TripLiveSettings } from "@/components/platform/TripLiveSettings";
import { sampleLiveEvents, sampleLiveLeague, sampleLiveSavedTrip, sampleLiveTournament, sampleLiveTrip } from "@/lib/dev/sampleLive";
import type { LivePreview, LiveSurface } from "@/lib/dev/livePreviews";
import homeStyles from "@/components/platform/GolfTripHome.module.css";
import tourney from "@/components/platform/CodeTournament.module.css";

/**
 * DEV ONLY: The Maroon Live screens (project_specs.md, "Feature: The Maroon Live") on made-up data; the simulator's
 * Conditionals pick the state. The real components, nothing loaded or saved.
 */
const usePreview = (fallback: LivePreview) => (useSimulator()?.state.livePreview as LivePreview | undefined) ?? fallback;
/** The simulator's Website desktop / Website mobile / App toggle. */
const useSurface = () => (useSimulator()?.state.liveSurface as LiveSurface | undefined) ?? "app";

/** The directory (/tap-in, and Golf Trips → The Maroon Live in the app). */
export function DevLiveDirectory() {
  const preview = usePreview("dir-events");
  const surface = useSurface();
  const sample = useMemo(() => preview === "dir-empty" ? [] : preview === "dir-unavailable" ? "unavailable" as const : sampleLiveEvents(), [preview]);
  return <MaroonLiveDirectory key={preview} surface={surface === "app" ? "app" : "website"} sample={sample} />;
}

/** One event's live page (/tap-in/<code>): what a watcher sees for a trip, tournament or league. */
export function DevLiveEvent() {
  const preview = usePreview("event-trip");
  const sample = useMemo(() => preview === "event-tournament" ? sampleLiveTournament() : preview === "event-league" ? sampleLiveLeague()
    : preview === "event-missing" ? "missing" as const : sampleLiveTrip(), [preview]);
  // Desktop = TV (2026-11-23): the simulator's Desktop / TV view shows the TV board; phones keep the live page.
  const surface = useSurface();
  const state = useSimulator()?.state;
  const start = { mode: state?.liveMode ?? "board", statsOpen: state?.liveStats === "open", full: state?.liveFull === "on" };
  return <LiveEventPage key={`${preview}-${surface}-${start.mode}-${start.statsOpen}-${start.full}`} code="W4K9PZ" sample={sample} wide={surface === "desktop"} start={start} />;
}

/** Trip Settings → Members → The Maroon Live: the organizer's picker, or what a player sees. */
export function DevLiveSettings() {
  const preview = usePreview("watch-organizer-link");
  const setup = useMemo(() => sampleLiveSavedTrip(
    preview === "watch-organizer-public" ? { visibility: "public", playersCanShare: true, organizer: true }
    : preview === "watch-organizer-private" ? { visibility: "private", playersCanShare: true, organizer: true }
    : preview === "watch-player-share" ? { visibility: "link", playersCanShare: true, organizer: false }
    : preview === "watch-player-no-share" ? { visibility: "link", playersCanShare: false, organizer: false }
    : { visibility: "link", playersCanShare: true, organizer: true }), [preview]);
  const playerHidden = !setup.isOrganizer && !setup.trip.trip.watch_code;
  return <main className={homeStyles.page} style={{ paddingTop: "calc(var(--app-top-clearance, 48px) + 8px)" }}>
    <h1 className={tourney.name}>Trip Settings · Members</h1>
    <TripLiveSettings key={preview} trip={setup.trip} isOrganizer={setup.isOrganizer} sample />
    {playerHidden && <p className={tourney.status}>(Dev note) Players see nothing here: the organizer turned off &ldquo;Players can share the link.&rdquo;</p>}
    <p className={tourney.status}>Tournament and League settings have the same &ldquo;Who can watch&rdquo; card: Tourneys → Organizer, and Leagues (sample) → settings wheel.</p>
  </main>;
}
