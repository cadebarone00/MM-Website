"use client";

import { useMemo } from "react";
import { useSimulator } from "@/components/dev/SimulatorBridge";
import { PlatformHome } from "@/components/platform/PlatformHome";
import { GolfTripsView } from "@/components/platform/GolfTripsView";
import { JoinTournamentPage } from "@/components/platform/JoinTournamentPage";
import { LeaguesHome } from "@/components/platform/Leagues";
import { roundStats } from "@/lib/profile/roundStats";
import { ProfileView } from "@/components/profile/ProfileView";
import { mockPerson, mockPersonFriends, mockPersonHistory, mockPersonProfile, type MockPerson } from "@/lib/dev/mockPeople";
import { sampleProfileReadModel } from "@/lib/dev/sampleProfile";
import tourneyStyles from "@/app/tournaments/join/page.module.css";
import profileStyles from "@/app/profile/page.module.css";

/**
 * DEV ONLY: the real Play, Golf Trips, Tourneys, Leagues and Profile screens for one of the 5 pretend people
 * (lib/dev/mockPeople.ts). The simulator's "Signed in as …" conditional picks who; outside the simulator it's Cade.
 */
function useMockPerson(): MockPerson {
  const id = useSimulator()?.state.mockPerson;
  return useMemo(() => mockPerson(id), [id]);
}

export function MockPlay() {
  const person = useMockPerson();
  const profile = sampleProfileReadModel(person.profilePreview, mockPersonProfile(person), new Date().toLocaleDateString("en-CA"), null, mockPersonHistory(person));
  return <PlatformHome key={person.id} signedIn preview={{ displayName: person.name, username: person.username, handicapIndex: profile.modernStats?.handicapIndex, average18: profile.modernStats?.average18, adjustedAverage18: profile.rounds.status === "ok" ? roundStats(profile.rounds.value)?.adjustedAverage18 : null, profileHref: "/dev/people/profile" }} />;
}

export function MockGolfTrips() {
  const person = useMockPerson();
  return <GolfTripsView key={person.id} result={{ status: "ok", trips: person.trips }} />;
}

export function MockTourneys() {
  const person = useMockPerson();
  return <div className={tourneyStyles.pageHeader}><JoinTournamentPage key={person.id} {...person.tourneys} /></div>;
}

export function MockLeagues() {
  const person = useMockPerson();
  return <LeaguesHome key={person.id} preview={person.leagues} />;
}

const PROFILE_LINKS = { settings: "/dev/profile/settings", edit: "/dev/profile/edit", search: "/dev/profile/search", profile: "/dev/people/profile",
  friends: "/dev/profile/search?tab=friends", friendsOf: "/dev/profile/friends?user={username}" };

export function MockProfile() {
  const person = useMockPerson();
  const profile = useMemo(() => sampleProfileReadModel(person.profilePreview, mockPersonProfile(person), new Date().toISOString().slice(0, 10), null, mockPersonHistory(person)), [person]);
  return <div className={profileStyles.page}>
    <ProfileView key={person.id} profile={profile} friendsCount={mockPersonFriends(person).length} links={PROFILE_LINKS} compare={null} />
  </div>;
}
