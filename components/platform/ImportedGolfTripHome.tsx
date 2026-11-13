"use client";

import Link from "next/link";
import { ChevronLeft, Settings, Trophy, Users } from "lucide-react";
import { GolfTripHome } from "./GolfTripHome";
import { SavedTripSetupProvider } from "./SavedTripSetupProvider";
import { savedTripAsDraft, golfTripUrl, type SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import type { ImportedTripView } from "@/lib/platform/importedTripPresentation";
import type { GolfTripNavigation } from "@/lib/platform/golfTripNavigation";
import { EditImportedResults, type ImportedEditing } from "./EditImportedResults";
import styles from "./ImportedGolfTripHome.module.css";

/** A team-only trip opens on Match: its Overview is the tee sheet for a round still to play. One fixed object, since a new
 *  navigation object resets the Golf tab. */
const OPEN_ON_MATCHES: GolfTripNavigation = { tab: "Golf", golfSection: "Competition" };

/**
 * An imported past trip (Golf Trips → Import past trip): the trip's final result on top, then the same Golf tab a live
 * trip has — leaderboard, matches and scorecards — read only, like a watch link. Nothing to score, plan or book: the
 * trip is over. Settings → Members is where the organizer sends each player their invite link. `view` is worked out on
 * the server (importedTripView), so the spreadsheet reader never reaches the phone. The app simulator's sample passes its
 * own `backHref` and no settings (`settingsHref` null).
 */
export function ImportedGolfTripHome({ savedTrip, view, backHref = "/golf-trips", settingsHref, editing }: { savedTrip: SavedGolfTrip; view: ImportedTripView; backHref?: string; settingsHref?: string | null; editing?: ImportedEditing }) {
  const tripId = savedTrip.trip.id;
  const settings = settingsHref === undefined ? golfTripUrl(tripId, "settings") : settingsHref;
  const snapshot = { values: { localCompetitionType: view.competitionType, ...(view.teamNames ? { teamNames: view.teamNames } : {}) }, revision: 0,
    basis: { startDate: savedTrip.trip.start_date, endDate: savedTrip.trip.end_date, rounds: savedTrip.rounds }, available: false };
  return <>
    <div className={styles.bar}>
      <Link href={backHref} className={styles.link}><ChevronLeft size={18} aria-hidden="true" />Golf Trips</Link>
      <span className={styles.badge}>Past trip</span>
      {settings ? <Link href={settings} className={styles.link} aria-label="Trip settings"><Settings size={18} aria-hidden="true" /></Link> : <span className={styles.link} />}
    </div>
    {(view.headline.team || view.headline.champion || editing) && <div className={styles.result}>
      {view.headline.team && <p><Users size={16} aria-hidden="true" />{view.headline.team}</p>}
      {view.headline.champion && <p><Trophy size={16} aria-hidden="true" />Champion: {view.headline.champion}</p>}
      {editing && <div className={styles.edit}><EditImportedResults editing={editing} /></div>}
    </div>}
    <SavedTripSetupProvider tripId={tripId} snapshot={snapshot} editable={false}>
      <GolfTripHome spectator preview={{ ...savedTripAsDraft(savedTrip), ...view.roundFormats }} settingsHref={settings ?? ""}
        previewMatch={view.previewMatch} competitionKey={tripId} savedCompetitionType={view.competitionType} tripStats={view.tripStats ?? undefined}
        navigation={view.competitionType.individual ? undefined : OPEN_ON_MATCHES} />
    </SavedTripSetupProvider>
  </>;
}
