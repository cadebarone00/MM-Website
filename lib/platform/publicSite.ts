import { FORMATS, isFormatKey } from "./formats.ts";
import { SITE_SECTIONS, type SiteSections } from "./setup.ts";
import type { Branding, Course, Player, ScheduleDay, SiteLinks, SitePage, Team, TournamentSiteData, TournamentStatus } from "@/components/platform/tournament-site/types";

/**
 * The public tournament site's adapter (spec §9): turns the visitor-safe
 * result of get_public_tournament_site (supabase/platform_public_site.sql)
 * into the public UI kit's TournamentSiteData, decides which pages exist,
 * and builds their links under /t/[tournament]/[year]. It never reads live
 * scoring: until C4, scoring pages show a plain "not available yet" notice.
 */
export interface PublicTournament {
  tournament: { slug: string; name: string; shortName: string; description: string | null; visibility: "public" | "unlisted" | "private"; branding: Record<string, unknown> };
  edition: { seasonYear: number; destination: string | null; startDate: string | null; endDate: string | null; timezone: string; status: string };
  competitionType: "teams" | "individual";
  scoring: { mode: string; pointsForWin: number; pointsForHalve: number; handicap: string; allowancePercent: number } | null;
  site: Partial<SiteSections>;
  media: { mode: "none" | "device_external"; links: { label: string; url: string }[] };
  teams: { ref: string; name: string; color: string }[];
  players: { ref: string; name: string; teamRef: string | null; captain: boolean }[];
  courses: { ref: string; name: string; city: string | null; state: string | null; teeName: string | null; par: number | null; yards: number | null }[];
  rounds: { number: number; day: number | null; label: string | null; format: string | null; courseRef: string | null; playDate: string | null; startType: string | null; startTime: string | null }[];
}

export const SCORING_NOTICE = "Scores, matches and results will appear here once live scoring opens for this tournament.";

/** Pages a visitor can open: Home and Info always; the rest follow the organizer's Website settings. */
export function publicPages(site: Partial<SiteSections>): SitePage[] {
  const on = (key: (typeof SITE_SECTIONS)[number]) => site[key] !== false;
  const pages: SitePage[] = ["home"];
  for (const page of ["schedule", "teams", "players", "courses", "leaderboard", "matches", "results"] as const) if (on(page)) pages.push(page);
  pages.push("information");
  return pages;
}

export function isPublicPage(value: string, site: Partial<SiteSections>): value is SitePage {
  return value !== "home" && (publicPages(site) as string[]).includes(value);
}

/** The public address visitors use once the edition is published. */
export function publicBasePath(slug: string, year: number): string {
  return `/t/${encodeURIComponent(slug)}/${year}`;
}

/** The organizer-only preview of the same site (Tournament Dashboard → Preview Website). */
export function previewBasePath(slug: string, year: number): string {
  return `/tournaments/${encodeURIComponent(slug)}/${year}/preview`;
}

/** Site navigation. The preview passes its own base so browsing stays inside the preview. */
export function publicSiteLinks(slug: string, year: number, pages: SitePage[], base = publicBasePath(slug, year)): SiteLinks {
  const links: SiteLinks = { home: base };
  for (const page of pages) if (page !== "home") links[page] = `${base}/${page}`;
  return links;
}

/** Search engines may index public tournaments only. */
export function robotsFor(visibility: PublicTournament["tournament"]["visibility"]) {
  return visibility === "public" ? { index: true, follow: true } : { index: false, follow: false };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });

export function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Dates to be announced";
  const a = parts(start);
  const b = parts(end ?? start);
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? `${MONTHS[a.m]} ${a.d}, ${a.y}` : `${MONTHS[a.m]} ${a.d}–${b.d}, ${a.y}`;
  if (a.y === b.y) return `${MONTHS[a.m]} ${a.d} – ${MONTHS[b.m]} ${b.d}, ${a.y}`;
  return `${MONTHS[a.m]} ${a.d}, ${a.y} – ${MONTHS[b.m]} ${b.d}, ${b.y}`;
}

function formatTime(hhmm: string | null, startType: string | null): string {
  if (!hhmm) return "Time TBD";
  const [h, m] = hhmm.split(":").map(Number);
  const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return startType === "shotgun" ? `Shotgun · ${time}` : time;
}

function dayLabel(iso: string): string {
  const { y, m, d } = parts(iso);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(Date.UTC(y, m, d)).getUTCDay()];
  return `${weekday} · ${MONTHS[m]} ${d}`;
}

const STATUS: Record<string, TournamentStatus> = { scheduled: "scheduled", live: "live", completed: "final", archived: "archived" };

/** Kit data for one edition. Sections the organizer turned off are left empty, not just unlinked. */
export function toSiteData(p: PublicTournament): TournamentSiteData {
  const on = (key: (typeof SITE_SECTIONS)[number]) => p.site[key] !== false;
  const hex = (value: unknown, fallback: string) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);
  const branding: Branding = {
    name: `${p.tournament.name} ${p.edition.seasonYear}`,
    shortName: p.tournament.shortName,
    primary: hex(p.tournament.branding.primary, "#1f2937"),
    secondary: hex(p.tournament.branding.secondary, "#f7f7f4"),
    accent: hex(p.tournament.branding.accent, "#9ca3af"),
    // The kit only renders root-relative or https images; nothing is uploaded or hosted for commercial tournaments.
    logo: typeof p.tournament.branding.logoUrl === "string" ? p.tournament.branding.logoUrl : undefined,
    heroImage: typeof p.tournament.branding.heroImageUrl === "string" ? p.tournament.branding.heroImageUrl : undefined,
  };
  const teams: Team[] = p.competitionType === "teams" ? p.teams.map((team) => ({ id: team.ref, name: team.name, color: team.color })) : [];
  const players: Player[] = on("players") ? p.players.map((player) => ({ id: player.ref, name: player.name, teamId: player.teamRef ?? undefined, captain: player.captain })) : [];
  const courses: Course[] = on("courses") ? p.courses.map((course) => ({
    id: course.ref, name: course.name, location: [course.city, course.state].filter(Boolean).join(", ") || "Location to be announced",
    tee: course.teeName ?? "TBD", par: course.par ?? undefined, yardage: course.yards ?? undefined,
  })) : [];

  const days: ScheduleDay[] = [];
  if (on("schedule")) {
    for (const round of p.rounds) {
      const key = round.playDate ?? "tbd";
      let day = days.find((d) => d.date === key);
      if (!day) { day = { date: key, label: round.playDate ? dayLabel(round.playDate) : "Date to be announced", sessions: [] }; days.push(day); }
      day.sessions.push({
        id: `r${round.number}`, label: round.label ? `Round ${round.number} · ${round.label}` : `Round ${round.number}`, courseId: round.courseRef ?? "",
        format: round.format && isFormatKey(round.format) ? FORMATS[round.format].label : "Format to be announced", teeTime: formatTime(round.startTime, round.startType), status: "scheduled",
      });
    }
    days.sort((a, b) => (a.date === "tbd" ? 1 : b.date === "tbd" ? -1 : a.date.localeCompare(b.date)));
  }

  const information: TournamentSiteData["information"] = [
    { label: "Dates", value: formatDateRange(p.edition.startDate, p.edition.endDate) },
    { label: "Where", value: p.edition.destination ?? "To be announced" },
    { label: "Field", value: `${p.players.length} player${p.players.length === 1 ? "" : "s"}${teams.length ? ` · ${teams.length} teams` : ""}` },
    { label: "Competition", value: p.competitionType === "teams" ? `Team match play${teams.length === 2 ? ` · ${teams[0].name} vs ${teams[1].name}` : ""}` : "Individual" },
  ];
  if (p.scoring) {
    information.push({ label: "Scoring", value: `${p.scoring.pointsForWin} point${p.scoring.pointsForWin === 1 ? "" : "s"} for a win · ${p.scoring.pointsForHalve === 0.5 ? "½" : p.scoring.pointsForHalve} for a halve` });
    information.push({ label: "Handicaps", value: p.scoring.handicap === "net" ? `Net · ${p.scoring.allowancePercent}% allowance` : "Gross" });
  }
  information.push({ label: "Times shown in", value: p.edition.timezone });

  return {
    branding,
    status: STATUS[p.edition.status] ?? "scheduled",
    competition: p.competitionType,
    dates: formatDateRange(p.edition.startDate, p.edition.endDate),
    destination: p.edition.destination ?? "",
    timezone: p.edition.timezone,
    description: p.tournament.description ?? `${p.tournament.name} ${p.edition.seasonYear}.`,
    teams, players, courses, days, information,
    standings: [],
    matches: [],
    scoringNotice: SCORING_NOTICE,
    mediaLinks: on("media") && p.media.mode === "device_external" ? p.media.links : [],
  };
}
