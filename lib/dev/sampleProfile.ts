import type { RoundsVisibility } from "../platform/playerRoundsPrivacy";
import type { Gender } from "../profile/profileEdit";
import type { ProfileSocial } from "../profile/profileSocials";
import { DEFAULT_PREFERENCES, type Preferences } from "../profile/preferences";
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
export interface SampleProfileEdits { displayName: string; username: string; bio: string; photoUrl: string | null; visibility: RoundsVisibility; gender: Gender | ""; links: ProfileSocial[]; preferences: Preferences }
export const DEFAULT_SAMPLE_PROFILE: SampleProfileEdits = {
  displayName: "Sample Golfer", username: "samplegolfer", bio: "Weekend golfer chasing a single-digit handicap. Dallas based, always down for 36 on a Saturday. Fades everything, buys the first round.", photoUrl: null, visibility: "private",
  preferences: DEFAULT_PREFERENCES, gender: "", links: [{ platform: "instagram", title: "samplegolfer", url: "https://instagram.com/samplegolfer" }, { platform: "tiktok", title: "samplegolfer", url: "https://tiktok.com/@samplegolfer" }, { platform: "youtube", title: "samplegolfs", url: "https://youtube.com/@samplegolfs" }],
};
export const SAMPLE_FRIENDS = 6;

const ME = "00000000-0000-4000-8000-000000000001";
const ROUNDS: Record<"sample" | "few" | "none", number> = { sample: 25, few: 2, none: 0 };
const ig = (name: string) => ({ platform: "instagram" as const, title: name, url: `https://instagram.com/${name}` });
const golferId = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
/**
 * Sample golfers for the dev Search page and their profiles (?user=<username>). Jake Parker / Mike Chen are also the
 * simulator's "Someone else's Public / Private profile". `mutuals` = sample "mutual friends" for Suggested for you.
 */
export const SAMPLE_GOLFERS = [
  { id: "00000000-0000-4000-8000-000000000002", displayName: "Jake Parker", username: "jakeparker", roundsVisibility: "public", bio: "Plays fast, putts slow.", links: [ig("jakeparker"), { platform: "x", title: "jakeparker", url: "https://x.com/jakeparker" }], rounds: 18, skill: 2, mutuals: 3 },
  { id: "00000000-0000-4000-8000-000000000003", displayName: "Mike Chen", username: "mikechen", roundsVisibility: "private", bio: "Scratch-ish on a good day. Keeps his rounds to himself.", links: [ig("mikechen")], rounds: 12, skill: -2, mutuals: 2 },
  { id: golferId(1), displayName: "Sarah Lopez", username: "sarahlopez", roundsVisibility: "public", bio: "Lefty. Muni golf lover. Always walking.", links: [ig("sarahlopez"), { platform: "tiktok", title: "sarahswings", url: "https://tiktok.com/@sarahswings" }], rounds: 22, skill: 1, mutuals: 2 },
  { id: golferId(2), displayName: "Tom Reed", username: "tomreed", roundsVisibility: "private", bio: "Weekend hacker.", links: [], rounds: 6, skill: 6, mutuals: 1 },
  { id: golferId(3), displayName: "Chris Patel", username: "chrispatel", roundsVisibility: "public", bio: "Chasing my first eagle.", links: [ig("chrispatel")], rounds: 9, skill: 5, mutuals: 1 },
  { id: golferId(4), displayName: "Ben Walker", username: "benwalker", roundsVisibility: "public", bio: "Houston. Course rater on weekends.", links: [{ platform: "linkedin", title: "ben-walker", url: "https://linkedin.com/in/ben-walker" }], rounds: 30, skill: 0, mutuals: 0 },
  { id: golferId(5), displayName: "Kyle Brooks", username: "kylebrooks", roundsVisibility: "private", bio: "", links: [], rounds: 4, skill: 8, mutuals: 0 },
  { id: golferId(6), displayName: "Drew Morgan", username: "drewmorgan", roundsVisibility: "public", bio: "Fairways and greens. Mostly greens.", links: [{ platform: "youtube", title: "drewgolfs", url: "https://youtube.com/@drewgolfs" }], rounds: 15, skill: 3, mutuals: 0 },
  { id: golferId(7), displayName: "Luke Kerr", username: "lukekerr", roundsVisibility: "public", bio: "Scotland born, Texas based.", links: [ig("lukekerr")], rounds: 27, skill: -1, mutuals: 0 },
  { id: golferId(8), displayName: "Ryan Hughes", username: "ryanhughes", roundsVisibility: "private", bio: "Here for the 19th hole.", links: [], rounds: 3, skill: 9, mutuals: 0 },
] satisfies (Omit<ProfileSubjectRow, "createdAt" | "legacyMaroonPlayerSlug" | "avatarUrl"> & { rounds: number; skill: number; mutuals: number })[];
export type SampleGolfer = (typeof SAMPLE_GOLFERS)[number];
export const sampleGolfer = (username: string | null | undefined) => SAMPLE_GOLFERS.find((g) => g.username === username) ?? null;
const PREVIEW_GOLFER = { public: "jakeparker", private: "mikechen" } as const;

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

/** The sample profile for this preview (or a sample golfer by username), as the viewer (always "me") would see it. */
export function sampleProfileReadModel(preview: ProfilePreview, mine: SampleProfileEdits, today: string, username?: string | null): ProfileReadModel {
  const other = sampleGolfer(username) ?? (preview === "public" || preview === "private" ? sampleGolfer(PREVIEW_GOLFER[preview]) : null);
  if (other) {
    const { rounds: count, skill, mutuals: _mutuals, ...row } = other;
    void _mutuals;
    const subject: ProfileSubjectRow = { ...row, roundsVisibility: row.roundsVisibility as ProfileSubjectRow["roundsVisibility"], bio: row.bio || null, createdAt: "2025-02-14T12:00:00Z", legacyMaroonPlayerSlug: null, avatarUrl: null };
    return buildProfileReadModel(ME, subject, { history: HISTORY, rounds: sampleProfileRounds(count, skill, 31 + SAMPLE_GOLFERS.indexOf(other)), legacy: null }, () => false, today);
  }
  const subject: ProfileSubjectRow = { id: ME, displayName: mine.displayName, username: mine.username, createdAt: "2025-04-02T12:00:00Z", legacyMaroonPlayerSlug: null, roundsVisibility: mine.visibility, bio: mine.bio, avatarUrl: mine.photoUrl, links: mine.links };
  const rounds = sampleProfileRounds(ROUNDS[preview as keyof typeof ROUNDS], 0, 7);
  return buildProfileReadModel(ME, subject, { history: HISTORY, rounds, legacy: null }, () => false, today);
}
