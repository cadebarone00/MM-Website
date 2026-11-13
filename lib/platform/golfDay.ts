import { normalizeCompetitor, type GolfMatchPreview } from "./golfTripPreviewFixture";
import { plannedRounds, type GolfTripDraft } from "./golfTripDraft";
import { getPlayerDisplayName } from "@/lib/data/players";
import { rankLeaderboard } from "./golfLeaderboardOrder";
import { resolveGolfFormat } from "./formats";
import { teamPoints } from "./teamPoints";
import type { CompetitionStructure } from "./golfTripNavigation";
import { ordinal } from "./teamDraft";

/** Use the round's calendar date without shifting it into the browser's time zone. */
export function golfDayDateLabel(value?: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date not set";
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "Date not set";
  const parts = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("weekday")}, ${part("month")} ${ordinal(Number(part("day")))}, ${part("year")}`;
}

/** Current cumulative standings and earned team-match points; no new scoring engine. */
export function golfDaySummary(match: GolfMatchPreview | undefined, viewerName: string | null | undefined, structure: CompetitionStructure, spectator = false) {
  if (!structure.individual || spectator) return null;
  const same = (name: string) => !!viewerName?.trim() && name.trim().toLowerCase() === viewerName.trim().toLowerCase();
  const net = match?.scoring === "Net";
  const ranked = match ? rankLeaderboard(match.leaderboard, { net, stableford: resolveGolfFormat(match.formatDef?.key ?? match.format).scoringMethod === "stableford" }) : [];
  const player = ranked.find(row => same(row.golfer.name));
  const raw = player ? (net ? player.netTotal : player.total).trim() : "";
  const value = raw === "E" ? 0 : raw ? Number(raw) : NaN;
  const total = Number.isFinite(value) ? value > 0 ? `+${value}` : value === 0 ? "E" : String(value) : "—";
  let points: number | null = null;
  if (structure.team && match && viewerName?.trim()) {
    for (const pairing of match.matches) {
      if ((pairing.round ?? match.round) > match.round) continue;
      const sides = [normalizeCompetitor(pairing.left), pairing.right ? normalizeCompetitor(pairing.right) : undefined];
      const side = sides.findIndex(team => team?.golfers.some(g => same(g.name)));
      if (side < 0) continue;
      points = (points ?? 0) + (teamPoints({ ...match, matches: [pairing] })?.points[side] ?? 0);
    }
  }
  return { total, position: player && player.position !== "—" ? `${player.position} / ${ranked.length}` : "—", points: structure.team ? points : undefined };
}

export function golfDayMatchNames(match: GolfMatchPreview, viewerName?: string | null, spectator = false): string {
  const { ownSide, sides, player } = golfDayAssignment(match, viewerName, spectator);
  if (!ownSide || !player) return "No match assigned";
  const surname = (name: string) => getPlayerDisplayName(name).trim().split(/\s+/).at(-1) ?? name;
  const teammates = ownSide.golfers.filter(g => g.name !== player.name).map(g => surname(g.name));
  const opponents = sides.filter(side => side && side !== ownSide).flatMap(side => side!.golfers).map(g => surname(g.name));
  const format = match.format || "Format not set";
  return teammates.length || opponents.length > 1
    ? `${format}${teammates.length ? ` w/ ${teammates.join(" & ")}` : ""} vs ${opponents.join(" & ") || "TBD"}`
    : `${format} vs ${opponents.join(" & ") || "TBD"}`;
}

/** Resolve each scheduled round of the same day without borrowing another round's seat. */
export function golfDayRounds(match?: GolfMatchPreview, schedule?: GolfTripDraft): GolfMatchPreview[] {
  if (!match) return [];
  const planned = schedule ? plannedRounds(schedule) : [];
  const current = planned.find(r => r.number === match.round);
  const sameDay = current ? planned.filter(r => r.dayNumber === current.dayNumber) : [];
  if (!sameDay.length) return [match];
  return sameDay.map(round => {
    if (round.number === match.round) return match;
    const snapshot = match.roundStandings?.find(r => r.round === round.number && (r.standingsRound === undefined || r.standingsRound === round.number));
    return { ...match, round: round.number, roundDate: round.date,
      course: schedule?.[`round${round.number}Course`] || "Course not set",
      format: schedule?.[`round${round.number}Format`] || "Format not set", formatDef: undefined,
      matches: match.matches.filter(p => p.round === round.number), leaderboard: snapshot?.leaderboard ?? [],
    };
  });
}

/** Personal presentation only; never treats the first golfer as the signed-in viewer. */
export function golfDayAssignment(match?: GolfMatchPreview, viewerName?: string | null, spectator = false) {
  const same = (name: string) => !spectator && !!viewerName?.trim() && name.trim().toLowerCase() === viewerName.trim().toLowerCase();
  const player = match?.leaderboard.find(row => same(row.golfer.name))?.golfer;
  const pairing = match?.matches.find(pair => (pair.round ?? match.round) === match.round
    && [pair.left, pair.right].some(side => side && normalizeCompetitor(side).golfers.some(g => same(g.name))));
  const sides = pairing ? [normalizeCompetitor(pairing.left), pairing.right ? normalizeCompetitor(pairing.right) : undefined] : [];
  const ownSide = sides.find(side => side?.golfers.some(g => same(g.name)));
  return { player: player ?? ownSide?.golfers.find(g => same(g.name)), pairing, ownSide, sides };
}
