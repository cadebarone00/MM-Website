import { FORMATS, matchesPerRound } from "./formats.ts";
import type { TournamentSetup } from "./setup.ts";
import { validateTournamentConfig } from "./tournamentConfig.ts";

/**
 * The one readiness engine (THE_MAROON_PRODUCT_SPEC.md §5.1). Given a saved
 * setup it decides every section's status, what's missing, the completion
 * percentage, the lifecycle stage, and whether Publish and Play are
 * unlocked. The dashboard only renders this; the publish route enforces it.
 *
 * Two gates:
 *   publish — enough for a public tournament site to make sense.
 *   play    — everything live scoring needs (and the tournament published).
 */
export type Stage = "Created" | "Setup Incomplete" | "Ready to Publish" | "Published" | "Ready to Play" | "Blocked";
export type SectionName = "Basics" | "Players" | "Teams" | "Courses" | "Rounds" | "Schedule" | "Rules" | "Branding" | "Website" | "Media" | "Publish";
export type SectionStatus = "Complete" | "Needs Attention" | "Not Started" | "Optional" | "Ready" | "Locked";
export type Gate = "publish" | "play";

export interface Requirement { section: SectionName; gate: Gate; label: string; met: boolean }

export interface SectionReadiness {
  name: SectionName;
  /** publish/play = required before that gate; optional = never blocks. */
  requiredFor: Gate | "optional";
  status: SectionStatus;
  missing: string[];
  detail: string;
}

export interface Readiness {
  stage: Stage;
  percent: number;
  sections: SectionReadiness[];
  publishReady: boolean;
  published: boolean;
  playReady: boolean;
  publishMissing: string[];
  playMissing: string[];
  /** Set when setup is done but something outside the organizer's control stops play. */
  blockedReason: string | null;
}

const ORDER: SectionName[] = ["Basics", "Players", "Teams", "Courses", "Rounds", "Schedule", "Rules", "Branding", "Website", "Media", "Publish"];

export function assessReadiness(setup: TournamentSetup, options: { liveScoringAvailable: boolean }): Readiness {
  const requirements: Requirement[] = [];
  const need = (section: SectionName, gate: Gate, label: string, met: boolean) => requirements.push({ section, gate, label, met });
  const { edition, teams, players, courses, rounds, scoring } = setup;
  const isTeams = setup.competitionType === "teams";

  // --- Publish gate --------------------------------------------------------
  need("Basics", "publish", "Add the tournament's start and end dates", Boolean(edition.startDate && edition.endDate));
  need("Teams", "publish", "Choose a two-team competition (V1 plays two-team match play)", isTeams);
  if (isTeams) need("Teams", "publish", "Set up exactly 2 teams", teams.length === 2);
  need("Rules", "publish", "Choose the scoring rules", scoring !== null);
  need("Rounds", "publish", "Plan at least one round", rounds.length > 0);
  if (rounds.length) need("Rounds", "publish", "Choose a format for every round", rounds.every((round) => round.format !== null));

  // --- Play gate -----------------------------------------------------------
  need("Players", "play", "Add at least 2 players", players.length >= 2);
  if (isTeams && players.length) need("Players", "play", "Put every player on a team", players.every((player) => player.teamKey !== null));
  if (isTeams && teams.length === 2) {
    const smallest = Math.min(...teams.map((team) => players.filter((player) => player.teamKey === team.key).length));
    const needed = rounds.filter((round) => round.format).reduce((most, round) => Math.max(most, FORMATS[round.format!].playersPerSide), 1);
    need("Players", "play", `Give each team at least ${needed} player${needed === 1 ? "" : "s"} for the planned formats`,
      rounds.every((round) => !round.format || matchesPerRound(round.format, smallest) >= 1) && smallest >= needed);
  }
  need("Courses", "play", "Add at least one course", courses.length > 0);
  if (rounds.length) need("Courses", "play", "Pick a course for every round", rounds.every((round) => round.courseId !== null));
  if (rounds.length) {
    need("Schedule", "play", "Give every round a date", rounds.every((round) => round.playDate !== null));
    need("Schedule", "play", "Give every round a tee time or shotgun start", rounds.every((round) => round.startType !== null && round.startTime !== null));
  }
  const published = edition.publishedAt !== null;
  need("Publish", "play", "Publish the tournament", published);

  const publishMissing = requirements.filter((r) => r.gate === "publish" && !r.met).map((r) => r.label);
  const publishReady = publishMissing.length === 0;

  // The shared rulebook has the final say before play (catches anything the
  // checklist above doesn't spell out). Only consulted once the checklist is
  // otherwise complete, so its messages never duplicate the checklist's.
  const organizerPlayMissing = requirements.filter((r) => !r.met && r.section !== "Publish").map((r) => r.label);
  if (organizerPlayMissing.length === 0) {
    const config = validateTournamentConfig(setupToConfig(setup));
    if (!config.ok) for (const error of config.errors) need(sectionForField(error.field), "play", error.message, false);
  }
  const playMissing = requirements.filter((r) => !r.met).map((r) => r.label);
  const playRequirementsMet = playMissing.length === 0;
  const blockedReason = playRequirementsMet && !options.liveScoringAvailable
    ? "Setup is complete, but live scoring for new tournaments isn't switched on yet. It arrives in a platform update."
    : null;
  const playReady = playRequirementsMet && options.liveScoringAvailable;

  const met = requirements.filter((r) => r.met).length;
  const percent = requirements.length ? Math.round((met / requirements.length) * 100) : 100;

  const started: Record<SectionName, boolean> = {
    Basics: true, Players: players.length > 0, Teams: teams.length > 0 || isTeams, Courses: courses.length > 0, Rounds: rounds.length > 0,
    Schedule: rounds.some((round) => round.playDate || round.startTime), Rules: scoring !== null, Branding: setup.tournament.branding !== null,
    Website: true, Media: setup.media.mode !== "none", Publish: published,
  };

  const sections: SectionReadiness[] = ORDER.map((name) => {
    const own = requirements.filter((r) => r.section === name);
    const missing = own.filter((r) => !r.met).map((r) => r.label);
    if (name === "Publish") {
      if (published) return { name, requiredFor: "play", status: "Complete", missing: [], detail: "Published. Unpublish any time before play." };
      return publishReady
        ? { name, requiredFor: "play", status: "Ready", missing: [], detail: "Everything a public site needs is set. Publish when you're ready." }
        : { name, requiredFor: "play", status: "Locked", missing: publishMissing, detail: `Finish ${publishMissing.length} more item${publishMissing.length === 1 ? "" : "s"} to unlock publishing.` };
    }
    if (name === "Branding") return optional(name, started.Branding, "Tournament colors set.", "Add colors whenever you like. Never required.");
    if (name === "Website") return optional(name, false, "", describeSite(setup));
    if (name === "Media") return optional(name, started.Media, `Linked media: ${setup.media.links.length} link${setup.media.links.length === 1 ? "" : "s"}.`, "No media. Players can keep photos and videos on their phones.");
    const requiredFor: Gate = own.some((r) => r.gate === "publish") ? "publish" : "play";
    if (!own.length && name === "Teams") return { name, requiredFor, status: "Complete", missing: [], detail: "No teams needed." };
    const status: SectionStatus = missing.length === 0 ? "Complete" : started[name] ? "Needs Attention" : "Not Started";
    return { name, requiredFor, status, missing, detail: missing.length ? missing[0] + "." : describeComplete(name, setup) };
  });

  const createdOnly = !players.length && !courses.length && scoring === null && !edition.startDate && rounds.every((round) => !round.format);
  const stage: Stage = !published
    ? publishReady ? "Ready to Publish" : createdOnly ? "Created" : "Setup Incomplete"
    : !playRequirementsMet ? "Published" : blockedReason ? "Blocked" : "Ready to Play";

  return { stage, percent, sections, publishReady, published, playReady, publishMissing, playMissing, blockedReason };
}

function optional(name: SectionName, set: boolean, setDetail: string, emptyDetail: string): SectionReadiness {
  return { name, requiredFor: "optional", status: set ? "Complete" : "Optional", missing: [], detail: set ? setDetail : emptyDetail };
}

function describeSite(setup: TournamentSetup): string {
  const shown = Object.values(setup.site).filter(Boolean).length;
  return `Public site sections: ${shown} of ${Object.keys(setup.site).length} shown. The site opens at /t/${setup.tournament.slug}/${setup.edition.seasonYear} when published.`;
}

function describeComplete(name: SectionName, setup: TournamentSetup): string {
  switch (name) {
    case "Basics": return `${setup.edition.startDate} – ${setup.edition.endDate} · ${setup.edition.timezone}.`;
    case "Players": return `${setup.players.length} players on the roster.`;
    case "Teams": return setup.teams.map((team) => team.name).join(" vs ") + ".";
    case "Courses": return `${setup.courses.length} course${setup.courses.length === 1 ? "" : "s"} planned.`;
    case "Rounds": return `${setup.rounds.length} rounds, all formats chosen.`;
    case "Schedule": return "Every round has a date and a start time.";
    case "Rules": return `Match play · ${setup.scoring?.pointsForWin} point per win · ${setup.scoring?.handicap}.`;
    default: return "";
  }
}

function sectionForField(field: string): SectionName {
  if (field.startsWith("basics")) return "Basics";
  if (field.startsWith("players")) return "Players";
  if (field.startsWith("teams")) return "Teams";
  if (field.startsWith("rounds")) return "Rounds";
  if (field.startsWith("scoring")) return "Rules";
  return "Basics";
}

/** The saved setup as the shared rulebook's TournamentConfig input. */
export function setupToConfig(setup: TournamentSetup) {
  const days = (date: string | null) => date && setup.edition.startDate
    ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${setup.edition.startDate}T00:00:00Z`)) / 86_400_000) + 1 : null;
  return {
    basics: {
      name: setup.tournament.name, shortName: setup.tournament.shortName, slug: setup.tournament.slug, description: setup.tournament.description,
      destination: setup.edition.destination, startDate: setup.edition.startDate, endDate: setup.edition.endDate, timezone: setup.edition.timezone,
      visibility: setup.tournament.visibility,
    },
    // Branding is optional on the dashboard; the rulebook needs colors, so use neutral ones.
    branding: setup.tournament.branding ?? { primary: "#1f2937", secondary: "#ffffff", accent: "#9ca3af", logoUrl: null },
    teams: setup.teams.map((team) => ({ key: team.key, name: team.name, color: team.color, captainPlayerKey: team.captainPlayerId })),
    players: setup.players.map((player) => ({ key: player.id, name: player.name, email: player.email, handicap: player.handicap, teamKey: player.teamKey })),
    rounds: setup.rounds.map((round) => ({ day: round.day ?? days(round.playDate) ?? 1, label: round.label, format: round.format, courseId: round.courseId })),
    scoring: setup.scoring ?? {},
  };
}
