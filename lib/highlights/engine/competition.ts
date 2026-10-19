import type { Eligibility, TripType } from "../metadata.ts";

/**
 * What competition a trip actually has, from its real setup (Settings → Competition and the round's match type) —
 * never from a display label. Pure. Spec: project_specs.md → "Highlights Phase H4.5 + H5A".
 */

/** The saved trip's competition setup (savedTripSetup.ts localCompetitionType + the round's Match Play / Stroke Play). */
export interface CompetitionSetup {
  individual: "Stroke Play" | "Points Based" | null;
  team: "2 Teams" | "Pairs" | "3-Ball" | "4-Ball" | null;
  /** The round's match type; matches only exist when it is Match Play. Unset = Match Play (the default). */
  roundMatchType?: "Match Play" | "Stroke Play" | null;
}

export interface CompetitionProfile {
  /** An individual leaderboard (Stroke Play / Points Based). */
  individual: boolean;
  /** Match-play matches (a team format, played as Match Play). */
  match: boolean;
  /** An overall team competition (2 Teams: team points, team standings). */
  teamCompetition: boolean;
  /** Any competition at all. */
  tournament: boolean;
  tripType: TripType;
}

export function competitionProfile(setup: CompetitionSetup): CompetitionProfile {
  const individual = setup.individual !== null;
  const match = setup.team !== null && setup.roundMatchType !== "Stroke Play";
  const teamCompetition = setup.team === "2 Teams";
  const tripType: TripType = match && individual ? "match+individual" : match ? "match-only" : individual ? "individual-only" : "noncompetitive";
  return { individual, match, teamCompetition, tournament: individual || match || teamCompetition, tripType };
}

/** The setup a simulator / test picks by trip type, with or without an overall team competition. */
export function setupFor(tripType: TripType, teamCompetition: boolean): CompetitionSetup {
  const team = teamCompetition ? "2 Teams" : "Pairs";
  if (tripType === "match+individual") return { individual: "Stroke Play", team, roundMatchType: "Match Play" };
  if (tripType === "match-only") return { individual: null, team, roundMatchType: "Match Play" };
  if (tripType === "individual-only") return { individual: "Stroke Play", team: null };
  return { individual: null, team: null };
}

/** Does this trip have what the rule needs? `reason` explains a "no" in plain words. */
export function eligibleForTrip(eligibility: Eligibility, profile: CompetitionProfile): { ok: boolean; reason: string } {
  if (!eligibility.tripTypes.includes(profile.tripType)) {
    return { ok: false, reason: `Not for ${profile.tripType === "noncompetitive" ? "noncompetitive trips" : `${label(profile.tripType)} trips`} (rule: ${eligibility.tripTypes.map(label).join(", ")}).` };
  }
  if (eligibility.requiresTeamCompetition && !profile.teamCompetition) return { ok: false, reason: "Needs an overall team competition, and this trip has none." };
  if (eligibility.requiresTournament && !profile.tournament) return { ok: false, reason: "Needs a competition set up, and this trip has none." };
  return { ok: true, reason: `Trip is ${label(profile.tripType)}${profile.teamCompetition ? " with a team competition" : ""}.` };
}

const label = (type: TripType) => ({ "match+individual": "Match + Individual", "match-only": "Match Only", "individual-only": "Individual Only", noncompetitive: "Noncompetitive" })[type];
