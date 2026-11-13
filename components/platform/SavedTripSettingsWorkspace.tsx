"use client";
import Link from "next/link";
import { golfTripUrl, type SavedGolfTrip } from "@/lib/platform/golfTripCreate";
import type { TripSetupSnapshot } from "@/lib/platform/savedTripSetup";
import { GolfTripSettingsPreview } from "./GolfTripSettingsPreview";
import { SavedTripSetupProvider } from "./SavedTripSetupProvider";
import { GolfTripMembers, LeaveGolfTrip } from "./GolfTripMembers";
import { SavedTripScorecards } from "./SavedTripScorecards";
import { GolfTripCorrections } from "./GolfTripCorrections";
import { GolfTripCompetitionPreviewProvider } from "./GolfTripCompetitionPreviewProvider";
import { WatchCodeChip } from "./WatchCodeChip";

export function SavedTripSettingsWorkspace({ trip, snapshot, viewer }: { trip: SavedGolfTrip; snapshot: TripSetupSnapshot; viewer: { isOrganizer: boolean; memberId: string; profileId: string } }) {
  const tripId = trip.trip.id;
  const members = <>{trip.trip.watch_code && <WatchCodeChip code={trip.trip.watch_code} name={trip.trip.name} />}<GolfTripMembers tripId={tripId} tripName={trip.trip.name} members={trip.members} viewerMemberId={viewer.memberId} manage={viewer.isOrganizer} />{!viewer.isOrganizer && <LeaveGolfTrip tripId={tripId} />}</>;
  return <SavedTripSetupProvider tripId={tripId} snapshot={snapshot} editable={viewer.isOrganizer}>
    <GolfTripCompetitionPreviewProvider initialRounds={[]}>
    <GolfTripSettingsPreview tripName={trip.trip.name} backHref={golfTripUrl(tripId)} dataKey={tripId} persistenceScope={tripId} scoringTripId={tripId}
      scheduleBaseDate={snapshot.basis.startDate} playerCount={trip.trip.expected_traveler_count ?? 1} players={trip.members.filter(member => member.invitationStatus === "accepted").map(member => member.displayName)} pastTrips={[]}
      tripRounds={snapshot.basis.rounds.map(round => ({ id: `round-${round.roundNumber}`, number: round.roundNumber, date: round.playDate ?? "", course: round.courseName || "Course TBD", format: "Singles", nassau: false, handicap: false, status: "scheduled" }))}
      livePanels={{ members, tripId, profileId: viewer.profileId, scorecards: <SavedTripScorecards trip={trip} />, isOrganizer: viewer.isOrganizer, deleteHref: golfTripUrl(tripId, "settings/delete"),
        scoring: <><Link href={golfTripUrl(tripId)}>Open trip scoring</Link><GolfTripCorrections tripId={tripId} profileId={viewer.profileId} /></> }} />
    </GolfTripCompetitionPreviewProvider>
  </SavedTripSetupProvider>;
}
