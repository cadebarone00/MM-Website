import type { Match, Player, ScheduleDay, Standing, Team } from "@/components/platform/tournament-site/types";
import { activitySummary, type ActivityType, type ActivityVisibility, type TournamentActivityItem } from "./activity.ts";
import { PLAY_DEMO_BASE } from "./playDemo.ts";
import type { TournamentHome } from "./tournamentHome.ts";

/**
 * FIXTURE DATA — LOCAL DEV DEMO ONLY (/dev/play, see playDemo.ts).
 * A fictional mid-tournament snapshot of "Maroon Masters 2027" so every
 * /play screen can be reviewed in its populated states. Never imported by a
 * production loader; the scores, pairings and announcements here are made up.
 * Same shapes the real screens consume (TournamentHome / TournamentSiteData).
 */

const MAROON = "maroon";
const WHITE = "white";

const teams: Team[] = [
  { id: MAROON, name: "Team Maroon", color: "#500001", points: 4.5 },
  { id: WHITE, name: "Team White", color: "#f3ead8", points: 2.5 },
];

const roster: [id: string, name: string, team: string, handicap: number, captain?: boolean][] = [
  ["cade", "Cade Barone", MAROON, 4.2, true], ["cam", "Cam Latto", MAROON, 7.8], ["kyle", "Kyle Schnabel", MAROON, 9.1],
  ["nate", "Nate Wojciechowski", MAROON, 11.4], ["collin", "Collin Ross", MAROON, 6.5], ["dalton", "Dalton Spriggs", MAROON, 13.0],
  ["drew", "Drew Weisser", WHITE, 3.9, true], ["hugo", "Hugo Moebel", WHITE, 8.6], ["jackson", "Jackson Collins", WHITE, 10.2],
  ["luke", "Luke Sherrell", WHITE, 12.7], ["pete", "Pete Peabody", WHITE, 5.4], ["quez", "Quez Currier", WHITE, 15.1],
];
const players: Player[] = roster.map(([id, name, teamId, value, captain]) => ({ id, name, teamId, captain, handicap: { public: true, value } }));

const days: ScheduleDay[] = [
  { date: "2027-04-15", label: "Thursday · April 15", sessions: [
    { id: "r1", label: "Round 1 · Morning", courseId: "pine-needles", format: "Fourball", teeTime: "8:00 AM", status: "final" },
    { id: "r2", label: "Round 2 · Afternoon", courseId: "pine-needles", format: "Alternate Shot", teeTime: "1:30 PM", status: "final" },
  ] },
  { date: "2027-04-16", label: "Friday · April 16", sessions: [
    { id: "r3", label: "Round 3 · Morning", courseId: "mid-pines", format: "Fourball", teeTime: "8:10 AM", status: "live" },
    { id: "r4", label: "Round 4 · Afternoon", courseId: "mid-pines", format: "Alternate Shot", teeTime: "1:40 PM", status: "scheduled" },
  ] },
  { date: "2027-04-17", label: "Saturday · April 17", sessions: [
    { id: "r5", label: "Round 5 · Final Day", courseId: "pine-needles", format: "Singles", teeTime: "9:00 AM", status: "scheduled" },
  ] },
];

const match = (id: string, session: string, a: string[], b: string[], format: string, teeTime: string, status: Match["status"], result?: string, progress?: string): [Match, string] =>
  [{ id, sideA: { teamId: MAROON, players: a }, sideB: { teamId: WHITE, players: b }, format, teeTime, status, result, progress }, session];

const matchList: [Match, string][] = [
  match("m1", "r1", ["cade", "cam"], ["drew", "hugo"], "Fourball", "8:00 AM", "final", "Maroon wins 3&2"),
  match("m2", "r1", ["kyle", "nate"], ["jackson", "luke"], "Fourball", "8:10 AM", "final", "White wins 1 Up"),
  match("m3", "r1", ["collin", "dalton"], ["pete", "quez"], "Fourball", "8:20 AM", "final", "Halved · All Square"),
  match("m4", "r2", ["cade", "kyle"], ["jackson", "pete"], "Alternate Shot", "1:30 PM", "final", "Maroon wins 2&1"),
  match("m5", "r2", ["cam", "collin"], ["drew", "quez"], "Alternate Shot", "1:40 PM", "final", "White wins 4&3"),
  match("m6", "r2", ["nate", "dalton"], ["hugo", "luke"], "Alternate Shot", "1:50 PM", "final", "Maroon wins 1 Up"),
  match("m7", "r3", ["cade", "nate"], ["drew", "luke"], "Fourball", "8:10 AM", "live", "Maroon 2 Up", "Thru 12"),
  match("m8", "r3", ["cam", "dalton"], ["hugo", "pete"], "Fourball", "8:20 AM", "live", "Maroon 1 Down", "Thru 10"),
  match("m9", "r3", ["kyle", "collin"], ["jackson", "quez"], "Fourball", "8:30 AM", "live", "All Square", "Thru 11"),
  match("m10", "r4", ["cade", "collin"], ["hugo", "jackson"], "Alternate Shot", "1:40 PM", "scheduled"),
  match("m11", "r4", ["cam", "kyle"], ["drew", "pete"], "Alternate Shot", "1:50 PM", "scheduled"),
  match("m12", "r5", ["cade"], ["drew"], "Singles", "9:00 AM", "scheduled"),
  match("m13", "r5", ["kyle"], ["luke"], "Singles", "9:10 AM", "scheduled"),
];

const standings: Standing[] = [
  { playerId: "cade", position: 1, score: "-4", status: "live", progress: "Thru 12" },
  { playerId: "drew", position: 2, score: "-3", status: "live", progress: "Thru 12" },
  { playerId: "pete", position: 3, score: "-1", status: "live", progress: "Thru 10" },
  { playerId: "collin", position: 3, score: "-1", status: "live", progress: "Thru 11" },
  { playerId: "cam", position: 5, score: "E", status: "live", progress: "Thru 10" },
  { playerId: "hugo", position: 5, score: "E", status: "final" },
  { playerId: "kyle", position: 7, score: "+1", status: "live", progress: "Thru 11" },
  { playerId: "jackson", position: 8, score: "+2", status: "final" },
  { playerId: "nate", position: 9, score: "+3", status: "live", progress: "Thru 12" },
  { playerId: "luke", position: 10, score: "+4", status: "live", progress: "Thru 12" },
  { playerId: "quez", position: 11, score: "+6", status: "final" },
  { playerId: "dalton", position: 12, score: "+7", status: "live", progress: "Thru 10" },
];

let refs = 0;
const item = (type: ActivityType, createdAt: string, fields: { title?: string; body?: string; visibility?: ActivityVisibility; metadata?: Record<string, number> } = {}): TournamentActivityItem => {
  const metadata = fields.metadata ?? {};
  return { ref: `a${++refs}`, type, visibility: fields.visibility ?? "everyone", title: fields.title ?? null, body: fields.body ?? null, metadata, createdAt,
    authorName: type === "commissioner_announcement" ? "Cade Barone" : null, summary: type === "commissioner_announcement" ? null : activitySummary(type, metadata) };
};

export function buildPlayDemo(): TournamentHome {
  refs = 0;
  const activity = [
    item("commissioner_announcement", "2027-04-16T14:05:00Z", { title: "Round 3 is underway", body: "Mid Pines is playing firm and fast. Pace of play is 4:15 per group — keep it moving." }),
    item("commissioner_announcement", "2027-04-16T12:30:00Z", { title: "Team dinner tonight", body: "Players only: dinner at the Pine Needles Lodge, 7:30 PM. Captains, bring your Singles lineups.", visibility: "players_only" }),
    item("schedule_updated", "2027-04-16T11:00:00Z", { metadata: { roundsRescheduled: 1 } }),
    item("teams_updated", "2027-04-14T18:20:00Z", { metadata: { playersMoved: 1 } }),
    item("commissioner_announcement", "2027-04-14T16:00:00Z", { title: "Welcome to Maroon Masters 2027", body: "Pine Needles and Mid Pines, three days, twelve players. Practice round Wednesday at 2 PM." }),
    item("players_updated", "2027-04-10T15:45:00Z", { metadata: { added: 2 } }),
    item("tournament_published", "2027-03-01T17:00:00Z"),
  ];
  return {
    slug: "maroon-masters-demo",
    year: 2027,
    site: {
      branding: { name: "Maroon Masters 2027", shortName: "Maroon Masters", primary: "#500001", secondary: "#f3ead8", accent: "#c9a86e" },
      status: "live",
      competition: "teams",
      dates: "April 15–17, 2027",
      destination: "Southern Pines, NC",
      timezone: "America/New_York",
      description: "Maroon Masters 2027 at Pine Needles and Mid Pines. Demo fixture data.",
      teams, players, standings, days,
      matches: matchList.map(([m]) => m),
      courses: [
        { id: "pine-needles", name: "Pine Needles Lodge & GC", location: "Southern Pines, NC", tee: "Blue", par: 71, yardage: 6618 },
        { id: "mid-pines", name: "Mid Pines Inn & GC", location: "Southern Pines, NC", tee: "Blue", par: 72, yardage: 6515 },
      ],
      information: [
        { label: "Dates", value: "April 15–17, 2027" },
        { label: "Where", value: "Southern Pines, NC" },
        { label: "Field", value: "12 players · 2 teams" },
        { label: "Competition", value: "Team match play · Team Maroon vs Team White" },
        { label: "Scoring", value: "1 point for a win · ½ for a halve" },
        { label: "Handicaps", value: "Net · 90% allowance" },
        { label: "Times shown in", value: "America/New_York" },
      ],
    },
    colors: { primary: "#500001", accent: "#c9a86e" },
    feed: { published: true, viewer: { signedIn: true, role: "owner", isPlatformAdmin: false, canPostAnnouncement: true, canSeePlayersOnly: true }, activity },
    basePath: PLAY_DEMO_BASE,
    announcementsUrl: null,
    links: { website: null, commissioner: null, allTournaments: PLAY_DEMO_BASE },
    moreLinks: [],
    pastSeasons: [],
    yourMatch: { matchId: "m7", playerId: "cade" },
    matchSessions: Object.fromEntries(matchList.map(([m, session]) => [m.id, session])),
    demo: true,
  };
}
