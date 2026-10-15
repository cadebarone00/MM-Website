import type { RoundsVisibility } from "../platform/playerRoundsPrivacy";
import { buildProfileReadModel, type ProfileReadModel, type ProfileSubjectRow } from "../profile/profileReadModel";
import { sampleProfileRounds } from "./sampleProfileRounds";

/**
 * DEV ONLY: the sample profile behind the simulator's Profile preview (/dev/profile, its Settings and Edit profile).
 * Built with the real buildProfileReadModel, so Public / Private follow the same rules as the live app. Nothing here
 * reads or writes a real account.
 */

/** sample = my profile, 25 rounds; few = 2 rounds (not enough for a handicap); none = no rounds; public / private = someone else's. */
export const PROFILE_PREVIEWS = ["sample", "few", "none", "public", "private"] as const;
export type ProfilePreview = (typeof PROFILE_PREVIEWS)[number];

/** The parts of my sample profile Settings and Edit profile can change. */
export interface SampleProfileEdits { displayName: string; username: string; bio: string; photoUrl: string | null; visibility: RoundsVisibility }
export const DEFAULT_SAMPLE_PROFILE: SampleProfileEdits = {
  displayName: "Sample Golfer", username: "samplegolfer", bio: "Weekend golfer chasing a single-digit handicap.", photoUrl: null, visibility: "private",
};
export const SAMPLE_FRIENDS = 6;

const ME = "00000000-0000-4000-8000-000000000001";
const ROUNDS: Record<ProfilePreview, number> = { sample: 25, few: 2, none: 0, public: 18, private: 0 };
const OTHERS: Record<"public" | "private", Omit<ProfileSubjectRow, "createdAt" | "legacyMaroonPlayerSlug" | "avatarUrl">> = {
  public: { id: "00000000-0000-4000-8000-000000000002", displayName: "Jake Parker", username: "jakeparker", roundsVisibility: "public", bio: "Plays fast, putts slow." },
  private: { id: "00000000-0000-4000-8000-000000000003", displayName: "Mike Chen", username: "mikechen", roundsVisibility: "private", bio: "Hidden from you: this profile is Private." },
};
/** The same shape get_profile_history returns. */
const HISTORY = {
  restricted: false,
  trips: [
    { id: "00000000-0000-4000-8000-000000000011", name: "Pinehurst Weekend", destination: "Pinehurst, NC", startDate: "2026-11-06", endDate: "2026-11-09", role: "organizer", playerCount: 8 },
    { id: "00000000-0000-4000-8000-000000000012", name: "Austin Golf Trip", destination: "Austin, TX", startDate: "2026-03-12", endDate: "2026-03-15", role: "member", playerCount: 12 },
  ],
  tournaments: [
    { slug: "sample-invitational", name: "Sample Invitational", year: 2026, label: "2026", destination: "Dallas, TX", startDate: "2026-05-01", endDate: "2026-05-03", team: { name: "Team Maroon", color: "#500001" }, isCaptain: true },
    { slug: "sample-invitational", name: "Sample Invitational", year: 2025, label: "2025", destination: "Austin, TX", startDate: "2025-05-02", endDate: "2025-05-04", team: { name: "Team White", color: "#f4efe6" }, isCaptain: false },
  ],
};

/** The sample profile for this preview, as the viewer (always "me") would see it. */
export function sampleProfileReadModel(preview: ProfilePreview, mine: SampleProfileEdits, today: string): ProfileReadModel {
  const other = preview === "public" || preview === "private" ? OTHERS[preview] : null;
  const subject: ProfileSubjectRow = other
    ? { ...other, createdAt: "2025-02-14T12:00:00Z", legacyMaroonPlayerSlug: null, avatarUrl: null }
    : { id: ME, displayName: mine.displayName, username: mine.username, createdAt: "2025-04-02T12:00:00Z", legacyMaroonPlayerSlug: null, roundsVisibility: mine.visibility, bio: mine.bio, avatarUrl: mine.photoUrl };
  const rounds = sampleProfileRounds(ROUNDS[preview], other ? 2 : 0, other ? 31 : 7);
  return buildProfileReadModel(ME, subject, { history: HISTORY, rounds, legacy: null }, () => false, today);
}
