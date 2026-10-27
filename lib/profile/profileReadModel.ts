import type { ArchivedHandicapRound, HandicapSummary } from "../handicap/types";
import { calculateHandicapIndex } from "../handicap/whs";
import type { PlayerScorecard, Team, Tournament } from "../data/types";
import type { ProfileHistoryRound } from "../platform/playerRoundsRows";
import { DEFAULT_ROUNDS_VISIBILITY, type RoundsVisibility } from "../platform/playerRoundsPrivacy";
import { playPath } from "../platform/tournamentHome";
import type { ProfileId } from "./profileIdentity";
import { initialsFor, memberSinceLabel, profileDisplayName } from "./myProfile";

/**
 * Profile read model: one golfer's Maroon identity, assembled in one place for /profile (and, later, other people's
 * public profiles). Always two people: the VIEWER (from the session) and the SUBJECT (whose profile it is) — on
 * /profile today they are the same person. Privacy decides what the viewer gets.
 *
 *   identity       name, initials, member since, photo / bio (legacy Maroon players), privacy setting
 *   rounds         every modern finished round (player_rounds via list_profile_rounds): trip, tournament, personal, past trip
 *   trips          golf trips actually joined (accepted, profile-backed), split current / past
 *   tournaments    editions actually played (tournament_players → edition_roster), with that year's team and captaincy
 *   teamHistory    per-year teams, derived from editions (never a profile team)
 *   legacy         LEGACY HISTORY: original Maroon golf data found through profiles.player_slug (archive years with that
 *                  year's team, the old handicap history, the latest scorecard) — kept separate, only loaded when the
 *                  subject has a slug. Never profile data: the old name, bio, photo and player details are retired;
 *                  the profile is only what the golfer sets now. The slug is a migration bridge, not identity.
 *
 * V1 privacy (project_specs.md, "Profile V1"): the owner gets everything. Anyone else gets `access: "private"` (name,
 * username, initials, profile photo, and the headline numbers — rounds played and handicap index, owner request 2026-10-26 — but never
 * the rounds themselves) unless the subject's profile is Public; then `access: "public"`: identity, bio, rounds by
 * their own rules, public tournaments' published years, the legacy archive years — never golf trips, never the legacy
 * handicap or scorecard.
 *
 * No emails, profile / auth ids or invite data are in the model: it is safe to hand to client components.
 * This file is pure (the data sources are passed in); lib/profile/profileReadModelServer.ts wires them to Supabase.
 */

export interface ProfileTrip { name: string; destination: string | null; startDate: string | null; endDate: string | null; role: "organizer" | "member"; playerCount: number; href: string }
export interface ProfileTournamentEdition {
  name: string; year: number; label: string; destination: string | null; startDate: string | null; endDate: string | null;
  team: { name: string; color: string } | null; isCaptain: boolean; href: string;
}
export interface TeamHistoryEntry { year: number; tournament: string; team: string; color: string | null; isCaptain: boolean | null; source: "profile" | "legacy" }

export interface LegacyMaroonYear { year: number; team: Team; destination: string | null; href: string }
export interface LegacyMaroonProfile {
  /** The old Maroon player slot (a public URL slug), only for finding legacy golf data. */
  playerSlug: string;
  years: LegacyMaroonYear[];
  handicap: { summary: HandicapSummary; archivedRounds: ArchivedHandicapRound[] } | null;
  latestScorecard: { tournament: Tournament; scorecard: PlayerScorecard; team: Team; shotVideos: Record<number, Record<number, Record<number, string>>> } | null;
}

export interface ProfileIdentityView {
  displayName: string; username: string; initials: string; memberSince: string | null;
  avatarSrc: string | null; bio: string | null; canEditBio: boolean; roundsVisibility: RoundsVisibility;
}

/** Stats the modern rounds can honestly support today; null when there are no rounds to count. */
export interface ModernStats { roundsPlayed: number; eighteenHoleRounds: number; average18: number | null; best18: number | null; handicapIndex: number | null; countingRounds: number }

/** ok = loaded; unavailable = couldn't be read (e.g. SQL not run yet); hidden = not for this viewer. */
export type ProfileSection<T> = { status: "ok"; value: T } | { status: "unavailable" } | { status: "hidden" };

export interface ProfileReadModel {
  isOwner: boolean;
  /** owner = it's you; public / private = someone else looking at a Public / Private profile. */
  access: "owner" | "public" | "private";
  identity: ProfileIdentityView;
  rounds: ProfileSection<ProfileHistoryRound[]>;
  trips: ProfileSection<{ current: ProfileTrip[]; past: ProfileTrip[] }>;
  tournaments: ProfileSection<ProfileTournamentEdition[]>;
  teamHistory: TeamHistoryEntry[];
  modernStats: ModernStats | null;
  legacy: LegacyMaroonProfile | null;
}

/** The subject's own profiles row, as the server reads it (never the email). */
export interface ProfileSubjectRow { id: ProfileId; displayName: string; username: string; createdAt: string | null; legacyMaroonPlayerSlug: string | null; roundsVisibility: RoundsVisibility; bio: string | null; /** Settings → Profile photo (profile_photos.sql). */ avatarUrl?: string | null }

export interface ProfileSources {
  subject(subjectId: ProfileId): Promise<ProfileSubjectRow | null>;
  /** get_profile_history's JSON, or null when it can't be read. */
  history(viewerId: ProfileId | null, subjectId: ProfileId): Promise<unknown>;
  /** list_profile_rounds, already privacy-filtered; null when it can't be read. */
  rounds(viewerId: ProfileId | null, subjectId: ProfileId): Promise<ProfileHistoryRound[] | null>;
  /**
   * Only called for a subject with a legacy Maroon slug. "full" (the owner) includes the handicap history and latest
   * scorecard; "public" (others, Public profile) is the archive years only.
   */
  legacy(playerSlug: string, detail: "full" | "public"): Promise<LegacyMaroonProfile>;
  /** Tournaments a legacy adapter serves: their platform rows are dropped (the legacy section covers them). */
  isLegacyTournament(slug: string): boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => typeof v === "string" && v.trim() ? v : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function profileTripsFromJson(raw: unknown): ProfileTrip[] {
  return (Array.isArray(raw) ? raw : []).flatMap((row): ProfileTrip[] => {
    if (!isObject(row) || typeof row.id !== "string" || !UUID.test(row.id) || !text(row.name)) return [];
    return [{
      name: text(row.name) as string, destination: text(row.destination), startDate: text(row.startDate), endDate: text(row.endDate),
      role: row.role === "organizer" ? "organizer" : "member", playerCount: typeof row.playerCount === "number" ? row.playerCount : 0,
      href: `/golf-trips/${row.id}`,
    }];
  });
}

export function profileTournamentsFromJson(raw: unknown, isLegacyTournament: (slug: string) => boolean): ProfileTournamentEdition[] {
  return (Array.isArray(raw) ? raw : []).flatMap((row): ProfileTournamentEdition[] => {
    if (!isObject(row)) return [];
    const [slug, name] = [text(row.slug), text(row.name)];
    if (!slug || !name || !Number.isInteger(row.year) || isLegacyTournament(slug)) return [];
    const team = isObject(row.team) && text(row.team.name) ? { name: text(row.team.name) as string, color: text(row.team.color) ?? "#500001" } : null;
    return [{
      name, year: row.year as number, label: text(row.label) ?? String(row.year), destination: text(row.destination),
      startDate: text(row.startDate), endDate: text(row.endDate), team, isCaptain: row.isCaptain === true, href: playPath(slug, row.year as number),
    }];
  });
}

/** Current = not finished yet (last day today or later, or no dates); past = finished. Past newest first, current soonest first. */
export function splitTrips(trips: ProfileTrip[], today: string): { current: ProfileTrip[]; past: ProfileTrip[] } {
  const lastDay = (t: ProfileTrip) => t.endDate ?? t.startDate;
  const past = trips.filter((t) => { const d = lastDay(t); return d !== null && d < today; });
  const current = trips.filter((t) => !past.includes(t)).sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  return { current, past: past.sort((a, b) => (lastDay(b) ?? "").localeCompare(lastDay(a) ?? "")) };
}

const LEGACY_TEAM: Record<Team, string> = { maroon: "Team Maroon", white: "Team White" };
export const LEGACY_TOURNAMENT_NAME = "The Maroon Tournament";

/** Year-by-year teams: platform editions with a team, then legacy Maroon years; newest first. */
export function teamHistory(tournaments: ProfileTournamentEdition[], legacyYears: LegacyMaroonYear[]): TeamHistoryEntry[] {
  return [
    ...tournaments.flatMap((t): TeamHistoryEntry[] => t.team ? [{ year: t.year, tournament: t.name, team: t.team.name, color: t.team.color, isCaptain: t.isCaptain, source: "profile" }] : []),
    ...legacyYears.map((y): TeamHistoryEntry => ({ year: y.year, tournament: LEGACY_TOURNAMENT_NAME, team: LEGACY_TEAM[y.team], color: null, isCaptain: null, source: "legacy" })),
  ].sort((a, b) => b.year - a.year || a.tournament.localeCompare(b.tournament));
}

/** Rounds played, 18-hole average and best, and the handicap index once enough rounds count. */
export function modernStats(rounds: ProfileHistoryRound[]): ModernStats | null {
  if (!rounds.length) return null;
  const eighteens = rounds.filter((r) => r.holesPlayed === 18).map((r) => r.total);
  const counting = rounds.filter((r) => r.countsForHandicap && r.differential !== null)
    .sort((a, b) => b.datePlayed.localeCompare(a.datePlayed) || b.id.localeCompare(a.id)).map((r) => r.differential as number);
  return {
    roundsPlayed: rounds.length, eighteenHoleRounds: eighteens.length,
    average18: eighteens.length ? Math.round((eighteens.reduce((a, b) => a + b, 0) / eighteens.length) * 10) / 10 : null,
    best18: eighteens.length ? Math.min(...eighteens) : null,
    handicapIndex: calculateHandicapIndex(counting.slice(0, 20)), countingRounds: counting.length,
  };
}

/** What the sources returned for one subject; null = that source couldn't be read. */
export interface ProfileData { history: unknown; rounds: ProfileHistoryRound[] | null; legacy: LegacyMaroonProfile | null }

const accessFor = (viewerId: ProfileId | null, subject: ProfileSubjectRow): ProfileReadModel["access"] =>
  viewerId === subject.id ? "owner" : subject.roundsVisibility === "public" ? "public" : "private";

/**
 * Assembles the subject's profile for this viewer, or null when the subject has no profile. Sources run in parallel;
 * a source that fails leaves its section "unavailable" — a profile with nothing in it is still a whole profile.
 */
export async function assembleProfileReadModel(viewerId: ProfileId | null, subjectId: ProfileId, sources: ProfileSources, today: string): Promise<ProfileReadModel | null> {
  const subject = await sources.subject(subjectId);
  if (!subject) return null;
  // Someone else, Private profile: the profile row, plus their rounds read as theirs only to count them (rounds played
  // and handicap index show; the rounds themselves never leave this function).
  if (accessFor(viewerId, subject) === "private") {
    const all = await sources.rounds(subject.id, subject.id).catch(() => null);
    return buildProfileReadModel(viewerId, subject, { history: null, rounds: all, legacy: null }, sources.isLegacyTournament, today);
  }
  const slug = subject.legacyMaroonPlayerSlug;
  const [history, rounds, legacy] = await Promise.all([
    sources.history(viewerId, subject.id).catch(() => null),
    sources.rounds(viewerId, subject.id).catch(() => null),
    slug ? sources.legacy(slug, viewerId === subject.id ? "full" : "public").catch(() => null) : Promise.resolve(null),
  ]);
  return buildProfileReadModel(viewerId, subject, { history, rounds, legacy }, sources.isLegacyTournament, today);
}

/**
 * The profile read model from already-loaded data (the privacy rules live here). assembleProfileReadModel feeds it
 * from Supabase; the dev profile preview (lib/dev/sampleProfile.ts) feeds it sample data, so both follow the same rules.
 */
export function buildProfileReadModel(viewerId: ProfileId | null, subject: ProfileSubjectRow, data: ProfileData, isLegacyTournament: (slug: string) => boolean, today: string): ProfileReadModel {
  const isOwner = viewerId === subject.id;
  const access = accessFor(viewerId, subject);
  if (access === "private") {
    // Someone else, Private profile: who it is and their headline numbers (from `data.rounds`, counted only), nothing else.
    const name = profileDisplayName({ displayName: subject.displayName, username: subject.username });
    const totals = data.rounds ? modernStats(data.rounds) : null;
    return {
      isOwner, access,
      // The profile photo shows whatever the privacy (owner request 2026-10-26), like the name.
      identity: { displayName: name, username: subject.username, initials: initialsFor(name), memberSince: null, avatarSrc: subject.avatarUrl ?? null, bio: null, canEditBio: false, roundsVisibility: "private" },
      rounds: { status: "hidden" }, trips: { status: "hidden" }, tournaments: { status: "hidden" }, teamHistory: [], legacy: null,
      // Only the counts: rounds played and handicap index (no averages, bests or anything from a round).
      modernStats: totals && { roundsPlayed: totals.roundsPlayed, eighteenHoleRounds: 0, average18: null, best18: null, handicapIndex: totals.handicapIndex, countingRounds: 0 },
    };
  }
  const { history, rounds, legacy } = data;
  const historyOk = isObject(history) && history.restricted === false;
  const tournaments = historyOk ? profileTournamentsFromJson(history.tournaments, isLegacyTournament) : [];
  // The profile is only what the golfer sets now — nothing from the old Maroon player page.
  const name = profileDisplayName({ displayName: subject.displayName, username: subject.username });
  const section = <T,>(value: T): ProfileSection<T> => historyOk ? { status: "ok", value } : { status: "unavailable" };
  return {
    isOwner, access,
    identity: {
      displayName: name, username: subject.username, initials: initialsFor(name), memberSince: memberSinceLabel(subject.createdAt),
      avatarSrc: subject.avatarUrl ?? null, bio: subject.bio?.trim() || null, canEditBio: isOwner,
      roundsVisibility: subject.roundsVisibility ?? DEFAULT_ROUNDS_VISIBILITY,
    },
    rounds: rounds ? { status: "ok", value: rounds } : { status: "unavailable" },
    // Golf trips are only ever the owner's to see.
    trips: isOwner ? section(splitTrips(historyOk ? profileTripsFromJson(history.trips) : [], today)) : { status: "hidden" },
    tournaments: section(tournaments),
    teamHistory: teamHistory(tournaments, legacy?.years ?? []),
    modernStats: rounds ? modernStats(rounds) : null,
    legacy,
  };
}
