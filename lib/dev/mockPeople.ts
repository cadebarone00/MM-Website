import type { GolfTripSummary } from "@/lib/platform/golfTripCreate";
import type { MyLeague } from "@/lib/platform/leagues";
import type { MyCodeTournament } from "@/lib/platform/codeTournaments";
import type { PastTournament } from "@/lib/platform/pastTournaments";
import type { TourneysHomeData } from "@/lib/platform/tourneyScreensData";
import { DEFAULT_SAMPLE_PROFILE, SAMPLE_GOLFERS, type ProfilePreview, type SampleProfileEdits } from "./sampleProfile";

/**
 * DEV ONLY: 5 pretend people for the simulator's "Mock people" group (project_specs.md "Mock people"). Each one has their
 * own trips, tourneys, leagues, friends and profile, handed to the REAL tab screens. Nothing is saved anywhere.
 * Dates are counted from today, so "upcoming" stays upcoming whenever you look.
 */
export const MOCK_PERSON_IDS = ["cade", "jake", "mike", "alex", "sam"] as const;
export type MockPersonId = (typeof MOCK_PERSON_IDS)[number];
export const DEFAULT_MOCK_PERSON: MockPersonId = "cade";

export interface MockPerson {
  id: MockPersonId;
  /** Shown in the simulator: "Signed in as Cade Barone (heavy user)". */
  label: string;
  name: string;
  username: string;
  bio: string;
  /** How many sample rounds their own profile shows (lib/dev/sampleProfile.ts). */
  profilePreview: Extract<ProfilePreview, "sample" | "few" | "none">;
  /** Usernames of sample golfers (SAMPLE_GOLFERS), so tapping a friend opens their sample profile. */
  friends: string[];
  trips: GolfTripSummary[];
  tourneys: TourneysHomeData;
  leagues: MyLeague[];
}

/** "YYYY-MM-DD", `days` from today (negative = in the past). */
export function daysFromToday(days: number, today = new Date()): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, 12);
  return date.toLocaleDateString("en-CA");
}

let tripCount = 0;
function trip(name: string, destination: string, startIn: number, length: number, players: number, role: GolfTripSummary["role"], today: Date): GolfTripSummary {
  tripCount += 1;
  return { id: `mock-trip-${tripCount}`, name, destination, startDate: daysFromToday(startIn, today), endDate: daysFromToday(startIn + length - 1, today), status: "active", expectedTravelerCount: players, memberCount: players, role };
}
function past(name: string, destination: string, daysAgo: number): PastTournament {
  const start = daysFromToday(-daysAgo);
  return { name, year: Number(start.slice(0, 4)), destination, startDate: start, endDate: daysFromToday(-daysAgo + 2), href: "/tournaments/join" };
}
function coded(id: string, name: string, status: MyCodeTournament["status"], startIn: number, course: string): MyCodeTournament {
  return { id, name, status, firstDate: daysFromToday(startIn), lastDate: daysFromToday(startIn + 1), course };
}
function league(id: string, name: string, status: MyLeague["status"], dayIn: number, course: string, playerCount: number): MyLeague {
  return { id, name, status, date: daysFromToday(dayIn), course, playerCount };
}
const signedIn = (tournaments: PastTournament[]): TourneysHomeData["past"] => ({ signedIn: true, ok: true, tournaments });

/** Builds all 5 people for `today` (fresh each time so the dates follow the calendar). */
export function mockPeople(today = new Date()): MockPerson[] {
  tripCount = 0;
  return [
    {
      id: "cade", label: "Cade Barone (heavy user)", name: "Cade Barone", username: "cadebarone",
      bio: "Organizer of too many golf trips. Dallas. Will drive the green on any par 4 under 320.", profilePreview: "sample",
      friends: ["jakeparker", "mikechen", "sarahlopez", "tomreed", "chrispatel", "benwalker", "drewmorgan", "lukekerr"],
      trips: [
        trip("Scottsdale Spring Swing", "Scottsdale, AZ", 12, 4, 12, "organizer", today),
        trip("Bandon Dunes Bucket List Trip With The Whole College Crew", "Bandon, OR", 64, 5, 16, "member", today),
        trip("The Maroon Masters 2026", "Hot Springs, AR", -40, 4, 16, "organizer", today),
        trip("Pinehurst Long Weekend", "Pinehurst, NC", -120, 3, 8, "member", today),
        trip("Myrtle Beach Bachelor Party", "Myrtle Beach, SC", -210, 4, 12, "member", today),
        trip("Kiawah Fall Classic", "Kiawah Island, SC", -330, 3, 8, "organizer", today),
      ],
      tourneys: {
        past: signedIn([past("Texas Cup", "Austin, TX", 90), past("Member-Guest Invitational", "Dallas, TX", 160), past("Turkey Shoot", "Fort Worth, TX", 365)]),
        codeTournaments: [coded("mock-tourney-1", "Saturday Skins Showdown", "live", 0, "Cowboys Golf Club"), coded("mock-tourney-2", "Office Scramble", "live", -1, "TPC Craig Ranch")],
      },
      leagues: [
        league("mock-league-1", "Thursday Night League", "live", 0, "Stevens Park", 24),
        league("mock-league-2", "Weekend Warriors", "live", 9, "Tenison Highlands", 16),
        league("mock-league-3", "Summer Twilight Series", "ended", -70, "Cedar Crest", 20),
      ],
    },
    {
      id: "jake", label: "Jake Parker (organizer)", name: "Jake Parker", username: "jakeparker",
      bio: "Plays fast, putts slow. I make the spreadsheets.", profilePreview: "sample",
      friends: ["mikechen", "sarahlopez", "benwalker", "kylebrooks"],
      trips: [
        trip("Lake Tahoe Golf + Ski", "Lake Tahoe, NV", 30, 4, 8, "organizer", today),
        trip("Hill Country Getaway", "Horseshoe Bay, TX", -95, 3, 8, "organizer", today),
      ],
      tourneys: {
        past: signedIn([past("Club Championship", "Plano, TX", 140)]),
        codeTournaments: [coded("mock-tourney-3", "Jake's Fall Invitational", "live", 2, "The Tribute")],
      },
      leagues: [league("mock-league-4", "Tuesday Dawn Patrol", "live", 4, "Keeton Park", 12)],
    },
    {
      id: "mike", label: "Mike Chen (casual)", name: "Mike Chen", username: "mikechen",
      bio: "Scratch-ish on a good day. Keeping it casual.", profilePreview: "few",
      friends: ["jakeparker", "tomreed", "ryanhughes"],
      trips: [trip("Branson Buddies Trip", "Branson, MO", -60, 3, 6, "member", today)],
      tourneys: { past: signedIn([]), codeTournaments: [coded("mock-tourney-4", "Charity Scramble", "ended", -20, "Timarron CC")] },
      leagues: [],
    },
    {
      id: "alex", label: "Alex Rivera (just invited)", name: "Alex Rivera", username: "alexrivera",
      bio: "", profilePreview: "few",
      friends: ["sarahlopez"],
      trips: [trip("Sarah's 30th Birthday Golf Trip", "Palm Springs, CA", 21, 3, 8, "member", today)],
      tourneys: { past: signedIn([]), codeTournaments: [] },
      leagues: [],
    },
    {
      id: "sam", label: "Sam Taylor (brand new)", name: "Sam Taylor", username: "samtaylor",
      bio: "", profilePreview: "none",
      friends: [],
      trips: [],
      tourneys: { past: signedIn([]), codeTournaments: [] },
      leagues: [],
    },
  ];
}

/** One person by id (unknown / missing → Cade). */
export function mockPerson(id: string | null | undefined, today = new Date()): MockPerson {
  const people = mockPeople(today);
  return people.find((person) => person.id === id) ?? people[0];
}

export const isMockPersonId = (value: unknown): value is MockPersonId => MOCK_PERSON_IDS.includes(value as MockPersonId);

/** Their own profile, in the shape the sample profile screens use (no photo, no socials unless set here). */
export function mockPersonProfile(person: MockPerson): SampleProfileEdits {
  return { ...DEFAULT_SAMPLE_PROFILE, displayName: person.name, username: person.username, bio: person.bio, links: [] };
}

/** Their friends as sample golfers (only ones that exist in SAMPLE_GOLFERS). */
export const mockPersonFriends = (person: MockPerson) => SAMPLE_GOLFERS.filter((golfer) => person.friends.includes(golfer.username));
