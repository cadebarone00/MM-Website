import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import type { ProfileSocial } from "@/lib/profile/profileSocials";

/**
 * The parts of a profile (server: lib/profile/profileReadModel.ts ProfileReadModel) the app's Profile screens show.
 * Written out here because the server's file also pulls in website-only screen code.
 */
export type Section<T> = { status: "ok"; value: T } | { status: "unavailable" } | { status: "hidden" };
export type ProfileTrip = { name: string; destination: string | null; startDate: string | null; endDate: string | null; role: "organizer" | "member"; playerCount: number; href: string };
export type ProfileTournament = { name: string; year: number; href: string; team: { name: string; color: string } | null; isCaptain: boolean };
export type TeamHistoryEntry = { year: number; tournament: string; team: string; source: "profile" | "legacy" };

export type ProfileModel = {
  isOwner: boolean;
  access: "owner" | "public" | "private";
  identity: { displayName: string; username: string; avatarSrc: string | null; bio: string | null; canEditBio: boolean; links: ProfileSocial[] };
  rounds: Section<ProfileHistoryRound[]>;
  trips: Section<{ current: ProfileTrip[]; past: ProfileTrip[] }>;
  tournaments: Section<ProfileTournament[]>;
  teamHistory: TeamHistoryEntry[];
  modernStats: { handicapIndex: number | null; roundsPlayed: number } | null;
};

/** What GET /api/app/profile (view=profile) sends: the page and my Friends count. */
export type MyProfileReply = { page?: { status: "ok"; profile: ProfileModel } | { status: "no-profile"; displayName: string } | { status: "signed-out" }; friends?: number | null };

export type { ProfileHistoryRound };
