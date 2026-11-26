import "server-only";
import { getCurrentProfile } from "@/lib/profile/currentProfile";
import { loadProfileReadModel } from "@/lib/profile/profileReadModelServer";
import type { ProfileTournamentEdition, ProfileTrip } from "@/lib/profile/profileReadModel";
import type { ProfileHistoryRound } from "@/lib/platform/playerRoundsRows";
import { sampleInsightsRounds } from "@/lib/dev/sampleInsightsRounds";

/**
 * Website → Stats, History and the dashboard (project_specs.md "Connected dashboard"): the signed-in golfer's own
 * rounds, trips and tournaments, read on the server for the owner only. `sample` (local dev server only) = a made-up
 * golfer, for checking the look. Each part says whether it could be read ("connected") so the page never guesses.
 */
export type Part<T> = { connected: true; value: T } | { connected: false };
export interface WebsiteGolf {
  displayName: string;
  rounds: Part<ProfileHistoryRound[]>;
  trips: Part<{ current: ProfileTrip[]; past: ProfileTrip[] }>;
  tournaments: Part<ProfileTournamentEdition[]>;
}

const part = <T,>(section: { status: string; value?: T }): Part<T> => section.status === "ok" ? { connected: true, value: section.value as T } : { connected: false };

/** "signed-out" = the page sends them to sign in; "unfinished" = signed in, account setup not finished (done in the app). */
export async function loadWebsiteGolf(sample = false): Promise<WebsiteGolf | "signed-out" | "unfinished"> {
  if (sample && process.env.NODE_ENV === "development") return SAMPLE;
  const current = await getCurrentProfile();
  if (current.status === "signed-out") return "signed-out";
  if (current.status !== "ok") return "unfinished";
  const me = current.profile.profileId;
  const model = await loadProfileReadModel(me, me);
  if (!model) return { displayName: current.profile.displayName, rounds: { connected: false }, trips: { connected: false }, tournaments: { connected: false } };
  return { displayName: current.profile.displayName, rounds: part(model.rounds), trips: part(model.trips), tournaments: part(model.tournaments) };
}

const SAMPLE: WebsiteGolf = {
  displayName: "Sample Golfer",
  rounds: { connected: true, value: sampleInsightsRounds() },
  trips: { connected: true, value: {
    current: [{ name: "Palm Springs 2027", destination: "Palm Springs, CA", startDate: "2027-04-22", endDate: "2027-04-25", role: "member", playerCount: 12, href: "#" }],
    past: [{ name: "Scottsdale Guys Trip", destination: "Scottsdale, AZ", startDate: "2026-03-12", endDate: "2026-03-15", role: "organizer", playerCount: 8, href: "#" }],
  } },
  tournaments: { connected: true, value: [{ name: "The Maroon Tournament", year: 2026, label: "2026 · Palm Springs", destination: "Palm Springs, CA", startDate: "2026-01-07", endDate: "2026-01-10", team: { name: "Team Maroon", color: "#500001" }, isCaptain: false, href: "#" }] },
};
