import { fmtPt } from "@/lib/data";
import { getPlayerDisplayName, getPlayerSlug } from "@/lib/data/players";
import { formatRoundLabel } from "@/lib/data/roundLabel";
import { matchRound } from "@/lib/data/roundIdentity";
import { tournamentRoundSequence } from "@/lib/data/tournamentRoundSequence";
import type { RealMatch, Tournament, VenueCourse } from "@/lib/data/types";
import { placementNumber } from "@/lib/leaderboard/placement";
import { matchLabel, matchLeader, matchStatus } from "@/components/leaderboard/matchUtils";
import type { Branding, Course, Match, Player, PlayStatus, ScheduleDay, Session, Standing, Team, TournamentSiteData, TournamentStatus } from "@/components/platform/tournament-site/types";
import type { PastTournament } from "./pastTournaments.ts";
import { formatDateRange } from "./publicSite.ts";
import { playPath, todayIn } from "./tournamentHome.ts";

/**
 * Read-only bridge from The Maroon Tournament's existing (legacy) data to the
 * platform's TournamentSiteData — the same shape every other tournament's
 * /play screens read (docs/maroon-legacy-migration-inventory.md, Phase 2).
 *
 * Pure: no I/O. maroonAdapterServer.ts gathers the inputs from the readers
 * the old site already uses (getSeasonTournament, the player name map, the
 * venue courses, live_round_state) and the platform rows C1 created. Nothing
 * here writes, and no old Maroon code is changed — it is only called.
 *
 * Rules: never invent a value. Points, results and standings appear only when
 * the legacy data has them; anything missing stays empty so the app shows its
 * normal holding states.
 */

/** The platform rows for this edition (tournaments + tournament_editions + edition_settings + edition_teams). */
export interface MaroonEditionRow {
  name: string;
  shortName: string;
  branding: Record<string, unknown>;
  seasonYear: number;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  scoring: { pointsForWin: number; pointsForHalve: number } | null;
  /** edition_teams keyed by legacy team key ('maroon' / 'white'). */
  teams: { key: string; name: string; color: string }[];
}

/** One live_round_state row (a live year only). Pass every row: matching a match to its round needs them all. */
export interface MaroonRoundRow {
  round: number;
  date: string | null;
  format: string | null;
  courseId: string | null;
  /** The host locked the course: the old home schedule's rule for showing a round publicly. */
  courseLocked: boolean;
}

export interface MaroonAdapterInput {
  edition: MaroonEditionRow;
  /** getSeasonTournament(year): static history for 2024–2026, Supabase for live years. */
  tournament: Tournament;
  /** Player slug → current display name (getPlayerNameMap). */
  names: Record<string, string>;
  /** Courses for the year (getVenueBySlugAsync). */
  courses: VenueCourse[];
  /** live_round_state rows for a live year; null for a static history year. */
  liveRounds: MaroonRoundRow[] | null;
}

export interface MaroonSite {
  site: TournamentSiteData;
  /** Match id → schedule session id, for TournamentHome.matchSessions. */
  matchSessions: Record<string, string>;
}

const LEGACY_TEAMS = ["maroon", "white"] as const;
type LegacyTeam = (typeof LEGACY_TEAMS)[number];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} · ${MONTHS[m - 1]} ${d}`;
}

const hex = (value: unknown, fallback: string) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);

/** "-3", "E", "+2". */
export function toParLabel(toPar: number): string {
  return toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : String(toPar);
}

/** "Maroon" from "Team Maroon", for result sentences the match card colors by team. */
function teamWord(name: string): string {
  return name.replace(/^Team\s+/i, "");
}

/**
 * The text under a match, built only from what the legacy match holds.
 * Final: "Maroon wins 3&2" / "White wins 1 UP" / "Halved", or just
 * "Maroon wins" when no margin was ever recorded. Live: "Maroon 2 UP" /
 * "All square". Scheduled: nothing.
 */
export function matchResult(match: RealMatch, teamName: (team: LegacyTeam) => string): string | undefined {
  const status = matchStatus(match);
  if (status === "scheduled") return undefined;
  const leader = matchLeader(match);
  if (status === "final") {
    if (leader === "tie") return "Halved";
    const winner = `${teamWord(teamName(leader))} wins`;
    return match.margin == null ? winner : `${winner} ${matchLabel(match)}`;
  }
  if (leader === "tie") return "All square";
  return match.margin == null ? undefined : `${teamWord(teamName(leader))} ${match.margin} UP`;
}

function sessionStatus(matches: RealMatch[]): PlayStatus {
  if (!matches.length) return "scheduled";
  const statuses = matches.map(matchStatus);
  if (statuses.includes("live")) return "live";
  if (statuses.every((s) => s === "final")) return "final";
  return statuses.includes("final") ? "live" : "scheduled";
}

/**
 * For a live year, the live_round_state round a match belongs to.
 * getSeasonTournament renumbers live matches: a dated round's `day` becomes
 * the index of its date and `session` is Morning for the first round that
 * date and Afternoon otherwise; an undated round keeps `day` = round. This
 * reverses that, and returns null when it can't be told apart (three or more
 * rounds on one date) rather than guessing.
 */
export function liveMatchRound(match: Pick<RealMatch, "day" | "session">, rounds: MaroonRoundRow[], dayDates: Record<number, string>): number | null {
  const date = dayDates[match.day];
  if (!date) return rounds.some((r) => r.round === match.day && !r.date) ? match.day : null;
  const sameDay = rounds.filter((r) => r.date === date).sort((a, b) => a.round - b.round);
  if (match.session === "Morning") return sameDay[0]?.round ?? null;
  return sameDay.length === 2 ? sameDay[1].round : null;
}

export function maroonSiteData(input: MaroonAdapterInput): MaroonSite {
  const { edition, tournament, names, liveRounds } = input;
  const year = edition.seasonYear;

  const teamRow = (key: LegacyTeam) => edition.teams.find((t) => t.key === key);
  const teamName = (key: LegacyTeam) => teamRow(key)?.name ?? key;
  const anyPlayed = tournament.matches.some((m) => matchStatus(m) !== "scheduled");
  const points: Record<LegacyTeam, number> = { maroon: tournament.maroonPts, white: tournament.whitePts };
  const teams: Team[] = LEGACY_TEAMS.flatMap((key) => {
    const row = teamRow(key);
    if (!row) return [];
    return [{ id: key, name: row.name, color: hex(row.color, key === "maroon" ? "#500001" : "#fbf8f1"), ...(anyPlayed ? { points: points[key] } : {}) }];
  });

  // Players: the year's roster, plus anyone who appears in a match but not on it.
  const slugTeam = new Map<string, LegacyTeam>();
  for (const key of LEGACY_TEAMS) for (const raw of tournament.roster[key]) slugTeam.set(getPlayerSlug(raw), key);
  for (const m of tournament.matches) {
    for (const raw of m.maroonPlayers) if (!slugTeam.has(getPlayerSlug(raw))) slugTeam.set(getPlayerSlug(raw), "maroon");
    for (const raw of m.whitePlayers) if (!slugTeam.has(getPlayerSlug(raw))) slugTeam.set(getPlayerSlug(raw), "white");
  }
  const players: Player[] = [...slugTeam].map(([slug, team]) => ({ id: slug, name: names[slug] ?? getPlayerDisplayName(slug), teamId: team }));

  // Rounds and which round each match belongs to.
  const matchSessions: Record<string, string> = {};
  const days: ScheduleDay[] = [];
  const addSession = (date: string, label: string, session: Session) => {
    let day = days.find((d) => d.date === date && d.label === label);
    if (!day) { day = { date, label, sessions: [] }; days.push(day); }
    day.sessions.push(session);
  };
  const teeTime = (matches: RealMatch[]) => matches.find((m) => m.teeTimeCst)?.teeTimeCst ?? "Time TBD";

  if (liveRounds === null) {
    for (const rep of tournamentRoundSequence(tournament)) {
      const round = matchRound(tournament, rep);
      if (round == null) continue;
      const inRound = tournament.matches.filter((m) => m.day === rep.day && m.session === rep.session);
      for (const m of inRound) matchSessions[m.id] = `r${round}`;
      const date = tournament.dayDates?.[rep.day];
      addSession(date ?? "tbd", date ? dayLabel(date) : `Day ${rep.day}`, {
        id: `r${round}`, label: formatRoundLabel(round), courseId: "", format: rep.format, teeTime: teeTime(inRound), status: sessionStatus(inRound),
      });
    }
  } else {
    const roundOf = new Map(tournament.matches.map((m) => [m.id, liveMatchRound(m, liveRounds, tournament.dayDates ?? {})]));
    for (const row of [...liveRounds].sort((a, b) => a.round - b.round)) {
      const inRound = tournament.matches.filter((m) => roundOf.get(m.id) === row.round);
      // Shown once the host locked its course (old home schedule rule) or it has matches posted.
      if (!row.courseLocked && !inRound.length) continue;
      for (const m of inRound) matchSessions[m.id] = `r${row.round}`;
      addSession(row.date ?? "tbd", row.date ? dayLabel(row.date) : "Date to be announced", {
        id: `r${row.round}`, label: formatRoundLabel(row.round), courseId: row.courseLocked ? row.courseId ?? "" : "",
        format: row.format ?? "Format to be announced", teeTime: teeTime(inRound), status: sessionStatus(inRound),
      });
    }
  }
  days.sort((a, b) => (a.date === "tbd" ? 1 : b.date === "tbd" ? -1 : a.date.localeCompare(b.date)));

  // archiveOnlyMatches are never read: like every old public page, only `matches`.
  const matches: Match[] = tournament.matches.map((m) => {
    const status = matchStatus(m);
    return {
      id: m.id,
      sideA: { teamId: "maroon", players: m.maroonPlayers.map(getPlayerSlug) },
      sideB: { teamId: "white", players: m.whitePlayers.map(getPlayerSlug) },
      format: m.format,
      teeTime: m.teeTimeCst ?? "Time TBD",
      status,
      ...(status === "live" && m.thru != null ? { progress: `Thru ${m.thru}` } : {}),
      ...(() => { const result = matchResult(m, teamName); return result ? { result } : {}; })(),
    };
  });

  const overall = sessionStatus(tournament.matches);
  const status: TournamentStatus = !tournament.matches.length ? "scheduled" : overall === "final" ? "final" : overall === "live" ? "live" : "scheduled";

  // Same order as the old leaderboard table (score only, stable), same tie places.
  const ranked = [...tournament.individualLeaderboard].sort((a, b) => a.toPar - b.toPar);
  const standingStatus: PlayStatus = status === "final" ? "final" : status === "live" ? "live" : "scheduled";
  const standings: Standing[] = ranked.map((s, index) => ({
    playerId: getPlayerSlug(s.player), position: placementNumber(ranked, index) ?? index + 1, score: toParLabel(s.toPar), status: standingStatus,
  }));

  const courses: Course[] = input.courses.map((c) => ({
    id: c.id, name: c.name, location: tournament.location || edition.destination || "Location to be announced",
    tee: "TBD", ...(c.par != null ? { par: c.par } : {}), ...(c.yards != null ? { yardage: c.yards } : {}),
  }));

  const venue = tournament.venue && tournament.venue !== "Venue pending" ? tournament.venue : edition.destination ?? "";
  const startDate = tournament.startDate || edition.startDate;
  const endDate = tournament.endDate || edition.endDate;
  const branding: Branding = {
    name: `${edition.name} ${year}`,
    shortName: edition.shortName,
    primary: hex(edition.branding.primary, "#500001"),
    secondary: hex(edition.branding.secondary, "#fbf8f1"),
    accent: hex(edition.branding.accent, "#b8945a"),
  };

  const information: TournamentSiteData["information"] = [
    { label: "Dates", value: formatDateRange(startDate || null, endDate || null) },
    { label: "Where", value: venue || "To be announced" },
    { label: "Field", value: `${players.length} player${players.length === 1 ? "" : "s"} · ${teams.length} teams` },
    { label: "Competition", value: `Team match play${teams.length === 2 ? ` · ${teams[0].name} vs ${teams[1].name}` : ""}` },
  ];
  if (edition.scoring) {
    const { pointsForWin: win, pointsForHalve: halve } = edition.scoring;
    information.push({ label: "Scoring", value: `${win} point${win === 1 ? "" : "s"} for a win · ${halve === 0.5 ? "½" : halve} for a halve` });
  }
  information.push({ label: "Times shown in", value: edition.timezone });

  let results: TournamentSiteData["results"];
  if (status === "final" && teams.length === 2) {
    const [a, b] = [points.maroon, points.white];
    const score = `${fmtPt(Math.max(a, b))}–${fmtPt(Math.min(a, b))}`;
    const headline = a === b ? `Tied ${score}` : `${teamName(a > b ? "maroon" : "white")} wins ${score}`;
    const champion = tournament.individualChampion ? names[getPlayerSlug(tournament.individualChampion)] ?? getPlayerDisplayName(tournament.individualChampion) : null;
    results = { headline, detail: champion ? `Individual champion: ${champion}` : "" };
  }

  return {
    matchSessions,
    site: {
      branding, status, competition: "teams",
      dates: formatDateRange(startDate || null, endDate || null),
      destination: venue, timezone: edition.timezone,
      description: `${edition.name} ${year}.`,
      teams, players, standings, matches, days, courses, information,
      ...(results ? { results } : {}),
      mediaLinks: [],
    },
  };
}

/** Inputs for the My Tournaments rows of The Maroon Tournament, all read live (Phase 3). */
export interface MaroonMembershipInput {
  slug: string;
  name: string;
  /** Years the viewer's claimed player is on the Admin Center roster (live_roster). */
  rosterYears: number[];
  /** The tournament's editions (tournament_editions). */
  editions: { seasonYear: number; destination: string | null; startDate: string | null; endDate: string | null; timezone: string; isTest: boolean }[];
  /** Admin Center's venue/dates per year (live_tournament_settings); only locked values count. */
  settings: { seasonYear: number; venueName: string | null; venueLocked: boolean; beginDate: string | null; endDate: string | null; datesLocked: boolean }[];
  now?: Date;
}

/**
 * The Maroon Tournament's My Tournaments rows: every unfinished, non-test year
 * the viewer plays in, each opening that year's /play home. A year with no
 * dates yet counts as upcoming (same rule as list_my_active_editions).
 */
export function maroonPlayingEditions(input: MaroonMembershipInput): PastTournament[] {
  const years = new Set(input.rosterYears);
  const rows: PastTournament[] = [];
  for (const edition of input.editions) {
    if (edition.isTest || !years.has(edition.seasonYear)) continue;
    const s = input.settings.find((row) => row.seasonYear === edition.seasonYear);
    const startDate = s?.datesLocked && s.beginDate ? s.beginDate : edition.startDate;
    const endDate = s?.datesLocked && s.endDate ? s.endDate : edition.endDate;
    const last = endDate ?? startDate;
    if (last && last < todayIn(edition.timezone, input.now)) continue;
    rows.push({
      name: input.name, year: edition.seasonYear,
      destination: s?.venueLocked && s.venueName ? s.venueName : edition.destination,
      startDate, endDate, href: playPath(input.slug, edition.seasonYear),
    });
  }
  return rows.sort((a, b) => a.year - b.year);
}

/** What decides whether a viewer may open The Maroon Tournament's /play home for one year. */
export interface MaroonAccessInput {
  /** profiles.is_host: an Admin Center host. */
  isHost: boolean;
  /** profiles.platform_role. */
  platformRole: string | null;
  /** tournament_members.role for this viewer on The Maroon Tournament, if any. */
  memberRole: string | null;
  /** Player slugs this viewer's account claimed (player_slots.claimed_by). */
  viewerSlugs: string[];
  /** That year's roster: the history file for 2024–2026, Admin Center's live_roster after. */
  rosterSlugs: string[];
}

/**
 * /play is the members' app, so it's limited to that year's roster players,
 * Admin Center hosts, the tournament's owners/organizers and platform admins.
 * Everyone else gets not found (the old public pages stay open to all).
 */
export function maroonCanEnter(input: MaroonAccessInput): boolean {
  if (input.isHost || input.platformRole === "admin") return true;
  if (input.memberRole === "owner" || input.memberRole === "organizer") return true;
  const roster = new Set(input.rosterSlugs);
  return input.viewerSlugs.some((slug) => roster.has(slug));
}
