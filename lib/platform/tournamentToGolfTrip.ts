import type { Tournament, RealMatch } from "../data/types";
import { getPlayerDisplayName } from "../data/players";
import type { GolfTripDraft } from "./golfTripDraft";
import type { PastTrip } from "./golfTripHistory";
import { shortPlace } from "./placeLabel.ts";
import type { GolfMatchPreview, GolfMatchCompetitor, GolfLeaderboardEntry } from "./golfTripPreviewFixture";
const DEFAULT_PAR = [4,5,3,4,4,4,3,5,4,4,4,3,5,4,4,3,4,5];

/**
 * Convert a real Tournament object into the lightweight GolfTripDraft questionnaire
 * shape the existing Golf Trip UI consumes. Also returns a simple list of fields
 * that weren't assigned a direct UI destination (dev-only inspector).
 */
export function adaptTournamentToDraft(tournament: Tournament): { draft: GolfTripDraft; unmapped: Record<string, unknown> } {
  const draft: GolfTripDraft = {};

  // Home / top-level
  draft.tripName = tournament.editionLabel || "";
  draft.destination = tournament.location || "";
  draft.startDate = tournament.startDate || "";
  draft.endDate = tournament.endDate || "";
  draft.dateLabel = tournament.dateLabel || "";
  draft.notes = tournament.notes || "";
  draft.individualChampion = tournament.individualChampion || "";
  draft.includesTournament = "yes";

  // Players / counts
  const maroonCount = (tournament.roster?.maroon?.length ?? 0);
  const whiteCount = (tournament.roster?.white?.length ?? 0);
  draft.playerCount = String(maroonCount + whiteCount);

  // Rounds / golf days: derive simple day/rounds + course assignments when possible
  // Use dayDates (mapping day number -> YYYY-MM-DD) when present, otherwise infer from matches
  const dayDates = tournament.dayDates ?? {};

  // Determine number of days
  const uniqueDays = new Set<number>();
  for (const m of tournament.matches || []) uniqueDays.add(m.day);
  for (const k of Object.keys(dayDates)) {
    const n = Number(k);
    if (!Number.isNaN(n)) uniqueDays.add(n);
  }
  const dayNumbers = Array.from(uniqueDays).sort((a, b) => a - b);
  const golfDays = Math.max(1, dayNumbers.length || 1);
  draft.golfDays = String(golfDays);

  // Fill dayXDate and round courses in a simple sequence. If there are multiple rounds per day we only put one course value per day for now.
  for (let i = 1; i <= golfDays; i++) {
    draft[`day${i}Date`] = dayDates[i] ?? "";
    draft[`day${i}Rounds`] = "1";
    // try to find a match assigned to this day and use its venue/course if available
    const matchForDay = (tournament.matches || []).find((m) => m.day === i);
    if (matchForDay) {
      draft[`round${i}Course`] = matchForDay.format ? `${matchForDay.format} · ${tournament.venue || ""}` : tournament.venue || "";
    } else {
      draft[`round${i}Course`] = tournament.venue || "";
    }
  }

  // Basic competition metadata that the trip UI may read
  draft.maroonPts = String(tournament.maroonPts ?? "");
  draft.whitePts = String(tournament.whitePts ?? "");
  draft.pointsAvailable = String(tournament.pointsAvailable ?? "");
  draft.pointsToWin = String(tournament.pointsToWin ?? "");

  // Expose roster as comma-separated fields the existing UI can parse if needed
  draft.rosterMaroon = (tournament.roster?.maroon ?? []).join(", ");
  draft.rosterWhite = (tournament.roster?.white ?? []).join(", ");

  // Raw JSON dumps for dev inspection (do not show to end users)
  draft._tournament_matches_json = JSON.stringify(tournament.matches ?? [], null, 2);
  draft._tournament_leaderboard_json = JSON.stringify(tournament.individualLeaderboard ?? [], null, 2);
  draft._tournament_scorecards_json = JSON.stringify(tournament.scorecards ?? [], null, 2);

  // Build unmapped summary: list tournament keys that are not directly placed into draft above
  const mappedKeys = new Set([
    "editionLabel",
    "location",
    "startDate",
    "endDate",
    "dateLabel",
    "notes",
    "individualChampion",
    "roster",
    "maroonPts",
    "whitePts",
    "pointsAvailable",
    "pointsToWin",
    "matches",
    "dayDates",
    "individualLeaderboard",
    "scorecards",
    "archiveOnlyMatches",
    "venue",
    "slug",
    "year",
    "individualChampionPhoto",
  ]);

  const unmapped: Record<string, unknown> = {};
  const tRecord = tournament as unknown as Record<string, unknown>;
  for (const key of Object.keys(tRecord)) {
    if (!mappedKeys.has(key)) {
      unmapped[key] = tRecord[key];
    }
  }

  // Also report any mapped-but-not-assigned-items so the dev inspector can show them
  unmapped._summary = {
    mapped: Array.from(mappedKeys).filter((k) => tRecord[k] !== undefined),
    mappedToDraft: {
      tripName: draft.tripName,
      destination: draft.destination,
      startDate: draft.startDate,
      endDate: draft.endDate,
      golfDays: draft.golfDays,
      rosterMaroon: draft.rosterMaroon,
      rosterWhite: draft.rosterWhite,
    },
  } as unknown;

  return { draft, unmapped };
}

/**
 * Create a minimal GolfMatchPreview that re-uses tournament match and leaderboard
 * data where possible so the Golf Trip "Golf" slides can show real content.
 * This is intentionally lightweight and only fills fields the preview components
 * use — it avoids inventing missing data.
 */
export function adaptTournamentToPreviewMatch(tournament: Tournament): GolfMatchPreview {
  const par = DEFAULT_PAR.slice();
  const roundCount = 4;
  const sides: [any, any] = [
    { name: "Maroon", winPct: 0, fairwayPct: "", greenPct: "", putts: "", score: "" },
    { name: "White", winPct: 0, fairwayPct: "", greenPct: "", putts: "", score: "" },
  ];

  const maroonPts = tournament.maroonPts ?? 0;
  const whitePts = tournament.whitePts ?? 0;
  const total = Math.max(1, (maroonPts + whitePts));
  sides[0].winPct = Math.round((maroonPts / total) * 100);
  sides[1].winPct = Math.round((whitePts / total) * 100);

  const matches = (tournament.matches || []).map((m: RealMatch) => {
    const left: GolfMatchCompetitor = { golfers: (m.maroonPlayers || []).map((p) => ({ name: getPlayerDisplayName(p), hcp: 0, thru: "", score: "", teeTime: "", course: tournament.venue })), points: undefined, totalScore: undefined, thru: undefined, teeTime: undefined, course: tournament.venue } as any;
    const right: GolfMatchCompetitor | undefined = m.whitePlayers && m.whitePlayers.length > 0 ? { golfers: (m.whitePlayers || []).map((p) => ({ name: getPlayerDisplayName(p), hcp: 0, thru: "", score: "", teeTime: "", course: tournament.venue })), points: undefined, totalScore: undefined, thru: undefined, teeTime: undefined, course: tournament.venue } as any : undefined;
    const gross = m.leader === undefined ? null : (m.leader === "maroon" ? { leader: "left", up: Math.abs(m.margin ?? 0) } : m.leader === "white" ? { leader: "right", up: Math.abs(m.margin ?? 0) } : { leader: null, up: 0 });
    const net = gross;
    return { left, right, gross, net, round: m.day } as any;
  });

  const leaderboard: GolfLeaderboardEntry[] = (tournament.individualLeaderboard || []).map((s, i) => ({
    position: String(i + 1),
    total: `${s.toPar}`,
    thru: "F",
    netTotal: `${s.toPar}`,
    netToday: `${s.toPar}`,
    today: `${s.toPar}`,
    holes: Array(18).fill(null),
    golfer: { name: getPlayerDisplayName(s.player), hcp: 0, thru: "F", score: `${s.toPar}`, teeTime: "", course: tournament.venue },
  }));

  const preview: GolfMatchPreview = {
    round: 1,
    roundCount,
    course: tournament.venue || "",
    roundDate: tournament.startDate || "",
    format: "Tournament",
    formatDef: undefined,
    handicap: false,
    par,
    sides: [sides[0], sides[1]],
    matches: matches as any,
    leaderboard,
  };

  return preview;
}

/**
 * A past Maroon tournament as a Settings → History entry: its name, dates, place, roster and champion. The old data has no
 * per-player round totals (only standings to par), so no rounds are made up — the champion comes from the tournament.
 */
export function adaptTournamentToPastTrip(tournament: Tournament): PastTrip {
  return {
    id: tournament.slug, arrival: tournament.startDate, departure: tournament.endDate, name: tournament.editionLabel,
    place: shortPlace(tournament.location),
    players: [...tournament.roster.maroon, ...tournament.roster.white].map(getPlayerDisplayName),
    rounds: [],
    championOverride: tournament.individualChampion ? getPlayerDisplayName(tournament.individualChampion) : null,
  };
}
