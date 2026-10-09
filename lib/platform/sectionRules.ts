import { isFormatKey } from "./formats.ts";
import { hasEntitlement } from "./entitlements.ts";
import { SITE_SECTIONS, type TournamentSetup } from "./setup.ts";
import { LIMITS, isEmail, isHexColor, isRealDate, isTimezone, normalizeScoring, type ConfigError } from "./tournamentConfig.ts";

/**
 * Field rules for each Tournament Dashboard section (COMPLETE). A section may
 * be saved half-finished: these rules only reject values that are wrong, not
 * values that are missing. What's still missing is the readiness engine's
 * job (lib/platform/readiness.ts). The server runs these before
 * save_tournament_section; the UI shows the errors it gets back.
 */
export const SECTIONS = ["basics", "players", "teams", "courses", "rounds", "schedule", "rules", "branding", "website", "media"] as const;
export type SectionKey = (typeof SECTIONS)[number];

export function isSectionKey(value: unknown): value is SectionKey {
  return typeof value === "string" && (SECTIONS as readonly string[]).includes(value);
}

export type SectionResult = { ok: true; data: Record<string, unknown> } | { ok: false; errors: ConfigError[] };

type Fields = Record<string, unknown>;
const obj = (value: unknown): Fields => (value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {});
const list = (value: unknown): Fields[] => (Array.isArray(value) ? value.map(obj) : []);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const optionalText = (value: unknown) => text(value) || null;
const optionalNumber = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

export function validateSection(section: SectionKey, input: unknown, setup: TournamentSetup): SectionResult {
  const errors: ConfigError[] = [];
  const fail = (field: string, message: string) => errors.push({ field, message });
  const raw = obj(input);
  let data: Record<string, unknown> = {};

  switch (section) {
    case "basics": {
      const name = text(raw.name);
      const shortName = text(raw.shortName) || name.slice(0, 24).trim();
      const description = optionalText(raw.description);
      const destination = optionalText(raw.destination);
      const startDate = text(raw.startDate);
      const endDate = text(raw.endDate);
      const timezone = text(raw.timezone);
      const visibility = text(raw.visibility);
      if (name.length < 1 || name.length > LIMITS.nameLength) fail("name", "Tournament name must be 1-80 characters.");
      if (shortName.length < 1 || shortName.length > 24) fail("shortName", "Short name must be 1-24 characters.");
      if (description && description.length > 2000) fail("description", "Description must be 2000 characters or fewer.");
      if (destination && destination.length > 120) fail("destination", "Destination must be 120 characters or fewer.");
      if ((startDate || endDate) && !(isRealDate(startDate) && isRealDate(endDate))) fail("startDate", "Enter both dates, or leave both blank for now.");
      if (isRealDate(startDate) && isRealDate(endDate)) {
        const days = daysInclusive(startDate, endDate);
        if (days < 1) fail("endDate", "End date can't be before the start date.");
        else if (days > LIMITS.days) fail("endDate", `A tournament can last at most ${LIMITS.days} days.`);
        if (Number(startDate.slice(0, 4)) !== setup.edition.seasonYear) fail("startDate", `This is the ${setup.edition.seasonYear} tournament, so it must start in ${setup.edition.seasonYear}.`);
      }
      if (!isTimezone(timezone)) fail("timezone", "Pick a valid time zone.");
      if (!["public", "unlisted", "private"].includes(visibility)) fail("visibility", "Choose who can see the tournament.");
      data = { name, shortName, description, destination, startDate: startDate || null, endDate: endDate || null, timezone, visibility };
      break;
    }

    case "teams": {
      const competitionType = raw.competitionType === "teams" ? "teams" : raw.competitionType === "individual" ? "individual" : null;
      if (!competitionType) fail("competitionType", "Choose a team or individual competition.");
      const teams = list(raw.teams).map((team, index) => {
        const id = optionalText(team.id);
        const name = text(team.name);
        const color = text(team.color);
        const captainPlayerId = optionalText(team.captainPlayerId);
        if (id && !setup.teams.some((existing) => existing.id === id)) fail(`teams.${index}`, "That team no longer exists. Reload the page.");
        if (name.length < 1 || name.length > LIMITS.teamNameLength) fail(`teams.${index}.name`, "Team name must be 1-40 characters.");
        if (!isHexColor(color)) fail(`teams.${index}.color`, "Team color must be a hex code like #1f4e9c.");
        const teamKey = id ? setup.teams.find((existing) => existing.id === id)?.key : null;
        if (captainPlayerId && !setup.players.some((player) => player.id === captainPlayerId && player.teamKey === teamKey)) {
          fail(`teams.${index}.captainPlayerId`, `${name || "This team"}'s captain must be a player on that team.`);
        }
        return { id, name, color, captainPlayerId };
      });
      if (competitionType === "individual" && teams.length > 0) fail("teams", "An individual tournament has no teams.");
      if (competitionType === "teams" && (teams.length < 2 || teams.length > LIMITS.teams)) fail("teams", `A team tournament needs 2-${LIMITS.teams} teams.`);
      if (new Set(teams.map((team) => team.name.toLowerCase())).size !== teams.length) fail("teams", "Two teams can't share a name.");
      data = { competitionType, teams };
      break;
    }

    case "players": {
      const expectedPlayerCount = optionalNumber(raw.expectedPlayerCount);
      if (expectedPlayerCount !== null && !(Number.isInteger(expectedPlayerCount) && expectedPlayerCount >= 2 && expectedPlayerCount <= LIMITS.players)) {
        fail("expectedPlayerCount", `Plan for 2-${LIMITS.players} players.`);
      }
      const rawPlayers = list(raw.players);
      if (rawPlayers.length > LIMITS.players) fail("players", `At most ${LIMITS.players} players.`);
      const players = rawPlayers.map((player, index) => {
        const id = optionalText(player.id);
        const name = text(player.name);
        const email = optionalText(player.email);
        const handicap = optionalNumber(player.handicap);
        const teamKey = optionalText(player.teamKey);
        // An id is this edition's player OR an existing player of this tournament being brought back (the database
        // refuses anyone else's: "Unknown player."). Rows without an id are new people, never matched by name.
        if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) fail(`players.${index}`, "That player no longer exists. Reload the page.");
        if (name.length < 1 || name.length > LIMITS.nameLength) fail(`players.${index}.name`, "Player name must be 1-80 characters.");
        if (email && !isEmail(email)) fail(`players.${index}.email`, `${name || "A player"}'s email doesn't look right.`);
        if (handicap !== null && !(Number.isFinite(handicap) && handicap >= LIMITS.handicapMin && handicap <= LIMITS.handicapMax)) {
          fail(`players.${index}.handicap`, "Handicap must be between -10 and 54.");
        }
        if (teamKey && !setup.teams.some((team) => team.key === teamKey)) fail(`players.${index}.teamKey`, `Pick one of this tournament's teams for ${name || "this player"}.`);
        return { id, name, email, handicap, teamKey };
      });
      if (new Set(players.map((player) => player.name.toLowerCase())).size !== players.length) fail("players", "Two players can't share a name.");
      data = { ...(expectedPlayerCount !== null ? { expectedPlayerCount } : {}), players };
      break;
    }

    case "courses": {
      const rawCourses = list(raw.courses);
      if (rawCourses.length > LIMITS.rounds) fail("courses", `At most ${LIMITS.rounds} courses.`);
      const range = (value: number | null, min: number, max: number) => value === null || (Number.isFinite(value) && value >= min && value <= max);
      const courses = rawCourses.map((course, index) => {
        const id = optionalText(course.id);
        const name = text(course.name);
        const par = optionalNumber(course.par);
        const yards = optionalNumber(course.yards);
        const rating = optionalNumber(course.rating);
        const slope = optionalNumber(course.slope);
        if (id && !setup.courses.some((existing) => existing.id === id)) fail(`courses.${index}`, "That course no longer exists. Reload the page.");
        if (name.length < 1 || name.length > 80) fail(`courses.${index}.name`, "Course name must be 1-80 characters.");
        if (!range(par, 27, 80) || (par !== null && !Number.isInteger(par))) fail(`courses.${index}.par`, "Par must be a whole number from 27 to 80.");
        if (!range(yards, 1000, 9000) || (yards !== null && !Number.isInteger(yards))) fail(`courses.${index}.yards`, "Yardage must be 1,000-9,000.");
        if (!range(rating, 50, 90)) fail(`courses.${index}.rating`, "Course rating must be 50-90.");
        if (!range(slope, 55, 155) || (slope !== null && !Number.isInteger(slope))) fail(`courses.${index}.slope`, "Slope must be a whole number from 55 to 155.");
        return { id, name, city: optionalText(course.city), state: optionalText(course.state), teeName: optionalText(course.teeName), par, yards, rating, slope };
      });
      data = { courses };
      break;
    }

    case "rounds": {
      const rawRounds = list(raw.rounds);
      if (rawRounds.length < 1 || rawRounds.length > LIMITS.rounds) fail("rounds", `Plan 1-${LIMITS.rounds} rounds.`);
      const maxDay = setup.edition.startDate && setup.edition.endDate ? daysInclusive(setup.edition.startDate, setup.edition.endDate) : LIMITS.days;
      const rounds = rawRounds.map((round, index) => {
        const day = optionalNumber(round.day);
        const format = round.format === null || round.format === "" || round.format === undefined ? null : round.format;
        const courseId = optionalText(round.courseId);
        if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= maxDay)) fail(`rounds.${index}.day`, `Round ${index + 1} must be on day 1-${maxDay}.`);
        if (format !== null && !isFormatKey(format)) fail(`rounds.${index}.format`, `Pick a format for round ${index + 1}, or leave it TBD.`);
        if (format !== null && setup.competitionType === "individual") fail(`rounds.${index}.format`, "Individual rounds stay TBD until individual scoring is supported.");
        if (courseId && !setup.courses.some((course) => course.id === courseId)) fail(`rounds.${index}.courseId`, `Round ${index + 1}'s course isn't one of this tournament's courses.`);
        const label = optionalText(round.label);
        if (label && label.length > 40) fail(`rounds.${index}.label`, "Round label must be 40 characters or fewer.");
        return { day, label, format, courseId };
      });
      data = { rounds };
      break;
    }

    case "schedule": {
      const { startDate, endDate } = setup.edition;
      const rounds = list(raw.rounds).map((round, index) => {
        const number = Number(round.number);
        const playDate = optionalText(round.playDate);
        const startType = round.startType === "tee_times" || round.startType === "shotgun" ? round.startType : null;
        const startTime = optionalText(round.startTime);
        if (!setup.rounds.some((existing) => existing.number === number)) fail(`rounds.${index}`, "That round no longer exists. Reload the page.");
        if (playDate) {
          if (!isRealDate(playDate)) fail(`rounds.${index}.playDate`, `Round ${number}'s date isn't a real date.`);
          else if (!startDate || !endDate) fail(`rounds.${index}.playDate`, "Set the tournament's dates in Basics first.");
          else if (playDate < startDate || playDate > endDate) fail(`rounds.${index}.playDate`, `Round ${number} must be played between ${startDate} and ${endDate}.`);
        }
        if (startTime && !TIME.test(startTime)) fail(`rounds.${index}.startTime`, `Round ${number}'s start time must look like 08:30.`);
        return { number, playDate, startType, startTime };
      });
      data = { rounds };
      break;
    }

    case "rules": {
      const scoring = normalizeScoring(raw);
      errors.push(...scoring.errors);
      data = { ...scoring.value };
      break;
    }

    case "branding": {
      for (const key of ["primary", "secondary", "accent"] as const) {
        if (!isHexColor(text(raw[key]))) fail(`branding.${key}`, "Colors must be hex codes like #500001.");
      }
      // No logo uploads in commercial V1 (no hosted media).
      data = { primary: text(raw.primary), secondary: text(raw.secondary), accent: text(raw.accent), logoUrl: null };
      break;
    }

    case "website": {
      data = Object.fromEntries(SITE_SECTIONS.map((key) => [key, raw[key] !== false]));
      break;
    }

    case "media": {
      const mode = raw.mode === "device_external" || raw.mode === "maroon_hosted" || raw.mode === "none" ? raw.mode : null;
      if (!mode) fail("mode", "Choose how this tournament handles media.");
      if (mode === "maroon_hosted" && !hasEntitlement(setup.entitlements, "hosted_media")) fail("mode", "Hosted uploads aren't included for this tournament. Use no media or linked media.");
      const links = mode === "device_external" ? list(raw.links).map((link, index) => {
        const label = text(link.label);
        const url = text(link.url);
        if (label.length < 1 || label.length > 60) fail(`links.${index}.label`, "Each link needs a short name (1-60 characters).");
        let valid = false;
        try { valid = new URL(url).protocol === "https:"; } catch { valid = false; }
        if (!valid) fail(`links.${index}.url`, "Links must be full https:// addresses.");
        return { label, url };
      }) : [];
      if (links.length > 10) fail("links", "At most 10 links.");
      data = { mode, links };
      break;
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, data };
}
