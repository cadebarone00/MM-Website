import { COURSE_SHORT_NAME_MAX } from "./courseShortName";
import { draftScheduleError } from "./draftSchedule";
import type { SavedGolfTrip } from "./golfTripCreate";

export type SetupValues = Record<string, unknown>;
export type SetupBasis = { startDate: string; endDate: string; rounds: SavedGolfTrip["rounds"] };
export type TripSetupSnapshot = { values: SetupValues; revision: number; basis: SetupBasis; available: boolean };
export function setupForViewer(snapshot: TripSetupSnapshot, organizer: boolean): TripSetupSnapshot {
  if (organizer) return snapshot;
  const values = Object.fromEntries(Object.entries(snapshot.values).filter(([key]) => !["pastTrips", "yardageCorrections"].includes(key)));
  return { ...snapshot, values };
}
export const setupEncode = (_key: string, value: unknown) => value instanceof Set ? { $set: [...value] } : value;
export const setupDecode = (_key: string, value: unknown) => value && typeof value === "object" && Array.isArray((value as { $set?: unknown }).$set) ? new Set((value as { $set: unknown[] }).$set) : value;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
export const datePlus = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const dayDifference = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
const fields = new Set("pastTrips scoringFieldsOff playerTotal localCompetitionType lockedComp teamChoiceSaved typePlayers teamNames teamColors teamPicks teamTotalChoice unevenTeams unevenSizes teamTie teamSelection draftDate draftTime draftType draftMethod submittedTeams gameSettings dayCount roundsPerDay arrivalShift pickedCourses yardageCorrections roundTees compRounds skinsOn skinsRounds skinsPlayers compFormats teeTimes matchSelections matchPerRound allRoundsMatch teePlayers teeMatches slotCourseNames courseShortNames golfOnArrival golfOnDeparture playerStats inAppScoring predictSettings".split(" "));
const bools = new Set("teamChoiceSaved unevenTeams skinsOn matchPerRound golfOnArrival golfOnDeparture playerStats inAppScoring".split(" "));
const arrays = new Set("pastTrips teamNames teamColors unevenSizes".split(" "));
const records = new Set("scoringFieldsOff typePlayers teamPicks lockedComp roundsPerDay pickedCourses yardageCorrections roundTees compRounds skinsRounds skinsPlayers compFormats teeTimes matchSelections allRoundsMatch teePlayers teeMatches slotCourseNames courseShortNames gameSettings predictSettings".split(" "));
const enums: Record<string, readonly unknown[]> = {
  teamTie: ["Retain", "Teams Tie", "Playoff"], teamSelection: [null, "Manual", "Draft", "Random"], draftType: ["Snake", "Straight"], draftMethod: ["Captain's Picks", "Duck Race"],
};
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length <= max;
const int = (value: unknown, min = 0, max = 64): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const mapOf = (value: unknown, check: (value: unknown) => boolean) => object(value) && Object.values(value).every(check);
const setOf = (value: unknown, check: (value: unknown) => boolean) => object(value) && Array.isArray(value.$set) && value.$set.every(check);
const formatNames = ["Singles", "Fourball", "Alternate Shot", "Chapman", "Scramble", "Shamble", "Stroke Play", "Stableford"];
const matchChoice = (value: unknown) => object(value) && [null, "Manual", "Match Draft"].includes(value.method as never) && [null, "Response", "Ranks", "Randomized"].includes(value.draftType as never) && text(value.date, 10) && text(value.time, 5) && ["rankMinutes","putForwardMinutes","responseMinutes"].every(key=>value[key]===undefined || int(value[key],1,120));
const roundFormat = (value: unknown) => object(value) && int(value.players) && typeof value.pointsPerMatch === "number" && value.pointsPerMatch >= 0 && value.pointsPerMatch <= 1000 && ["Match Play", "Stroke Play"].includes(String(value.matchType)) && typeof value.nassau === "boolean" && ["Gross", "Net", "Both"].includes(String(value.scoring)) && formatNames.includes(String(value.format));
const tees = (value: unknown) => object(value) && (value.tee === null || text(value.tee)) && typeof value.perHole === "boolean" && mapOf(value.holeTees, entry => text(entry));
const nestedChecks: Record<string, (value: unknown) => boolean> = {
  teamNames: value => Array.isArray(value) && value.every(item => text(item, 120)),
  teamColors: value => Array.isArray(value) && value.every(item => item === null || text(item, 80)),
  unevenSizes: value => Array.isArray(value) && value.length === 2 && value.every(item => int(item, 1)),
  scoringFieldsOff: value => setOf(value, item => ["Opponent's score", "Putts", "Fairway", "Greens in regulation"].includes(String(item))),
  typePlayers: value => object(value) && setOf(value.individual, item => int(item, 0, 63)) && setOf(value.team, item => int(item, 0, 63)),
  lockedComp: value => object(value) && typeof value.individual === "boolean" && typeof value.team === "boolean",
  teamPicks: value => mapOf(value, item => int(item, 0, 63)),
  teeTimes: value => mapOf(value, item => Array.isArray(item) && item.every(time => time === "" || typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))),
  slotCourseNames: value => mapOf(value, item => text(item)),
  // Organizer short names for lock screens / Live Activities, by full course name: non-blank, at most
  // COURSE_SHORT_NAME_MAX letters, for at most 64 courses with names up to 200.
  courseShortNames: value => object(value) && Object.keys(value).length <= 64 && Object.keys(value).every(name => name.length <= 200) && Object.values(value).every(item => text(item, COURSE_SHORT_NAME_MAX) && item.trim() !== ""),
  compRounds: value => mapOf(value, item => typeof item === "boolean"),
  skinsRounds: value => mapOf(value, item => typeof item === "boolean"),
  skinsPlayers: value => mapOf(value, item => setOf(item, player => int(player, 0, 63))),
  compFormats: value => mapOf(value, roundFormat),
  matchSelections: value => mapOf(value, matchChoice), allRoundsMatch: matchChoice,
  roundTees: value => mapOf(value, tees),
  pickedCourses: value => mapOf(value, item => object(item) && text(item.name) && (item.ref === undefined || text(item.ref, 300)) && (item.place === undefined || text(item.place))),
  teePlayers: value => mapOf(value, groups => mapOf(groups, players => Array.isArray(players) && players.length <= 4 && players.every(player => int(player, 0, 63)))),
  teeMatches: value => mapOf(value, groups => mapOf(groups, match => object(match) && [match.a, match.b].every(side => Array.isArray(side) && side.length <= 4 && side.every(player => player === null || int(player, 0, 63))))),
  pastTrips: value => Array.isArray(value) && value.every(trip => object(trip) && text(trip.id) && text(trip.name) && text(trip.place) && text(trip.arrival, 10) && text(trip.departure, 10) && Array.isArray(trip.players) && trip.players.every(player => text(player, 120)) && Array.isArray(trip.rounds) && trip.rounds.every(round => object(round) && text(round.id) && int(round.number, 1, 62) && (round.date === null || text(round.date, 10)) && object(round.course) && text(round.course.name) && text(round.course.place) && mapOf(round.scores, score => int(score, 1, 500)))),
  yardageCorrections: value => mapOf(value, entries => Array.isArray(entries) && entries.every(entry => object(entry) && text(entry.at) && text(entry.reason, 2000) && tees(entry.before) && tees(entry.after) && Array.isArray(entry.affectedCards) && entry.affectedCards.every(card => text(card)))),
  predictSettings: value => object(value) && typeof value.on === "boolean" && Array.isArray(value.off) && value.off.every(item => text(item, 80)),
};
function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 4000;
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1_000_000;
  if (Array.isArray(value)) return value.length <= 2000 && value.every(item => safeJson(item, depth + 1));
  return object(value) && Object.keys(value).length <= 2000 && Object.entries(value).every(([key, item]) => !["__proto__", "constructor", "prototype"].includes(key) && safeJson(item, depth + 1));
}
/** Bounded, whitelisted presentation configuration. Never accepts profile/member IDs or score overrides. */
export function validSetup(value: unknown): value is SetupValues {
  if (!object(value) || JSON.stringify(value).length > 262144 || !safeJson(value)) return false;
  for (const [key, item] of Object.entries(value)) {
    if (nestedChecks[key] && !nestedChecks[key](item)) return false;
    if (!fields.has(key) || (bools.has(key) && typeof item !== "boolean") || (arrays.has(key) && !Array.isArray(item)) || (records.has(key) && !object(item))) return false;
    if (key in enums && !enums[key].includes(item)) return false;
    if (["draftDate", "draftTime"].includes(key) && typeof item !== "string") return false;
    if (key === "draftDate" && item !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(item))) return false;
    if (key === "draftTime" && item !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(item))) return false;
    if (["playerTotal", "dayCount", "arrivalShift"].includes(key) && !Number.isInteger(item)) return false;
    if (key === "playerTotal" && (Number(item) < 1 || Number(item) > 64)) return false;
    if (key === "dayCount" && (Number(item) < 1 || Number(item) > 31)) return false;
    if (key === "arrivalShift" && Math.abs(Number(item)) > 3660) return false;
    if (key === "localCompetitionType" && (!object(item) || ![null, "Stroke Play", "Points Based"].includes(item.individual as never) || ![null, "2 Teams", "Pairs", "3-Ball", "4-Ball"].includes(item.team as never))) return false;
    if (key === "submittedTeams" && item !== null && (!Array.isArray(item) || !item.every(team => Array.isArray(team) && team.every(player => Number.isInteger(player) && player >= 0 && player < 64)))) return false;
    if (key === "teamTotalChoice" && item !== null && (!Number.isInteger(item) || Number(item) < 1 || Number(item) > 64)) return false;
    if (key === "roundsPerDay" && !Object.entries(item as SetupValues).every(([day, count]) => /^-?\d+$/.test(day) && [0, 1, 2].includes(count as number))) return false;
  }
  return !draftScheduleError(value);
}
export function initialSetup(trip: SavedGolfTrip): TripSetupSnapshot {
  const count = dayDifference(trip.trip.start_date, trip.trip.end_date) + 1;
  return { available: false, revision: 0, basis: { startDate: trip.trip.start_date, endDate: trip.trip.end_date, rounds: trip.rounds }, values: {
    dayCount: count, arrivalShift: 0, golfOnArrival: true, golfOnDeparture: true,
    roundsPerDay: Object.fromEntries(Array.from({ length: count }, (_, index) => [index, trip.rounds.filter(round => round.playDate === datePlus(trip.trip.start_date, index)).length])),
    playerTotal: Math.min(64, Math.max(1, trip.trip.expected_traveler_count ?? 1, trip.members.filter(member => member.invitationStatus === "accepted").length)),
    localCompetitionType: { individual: trip.trip.includes_tournament === "yes" ? "Stroke Play" : null, team: null },
    pastTrips: [],
  } };
}
/** Build canonical round changes from the same slot/date rules as the shared settings screen. */
export function setupPlan(trip: SavedGolfTrip, basis: SetupBasis, values: SetupValues) {
  if (!validSetup(values)) throw new Error("Invalid trip settings.");
  const capacity = Number(values.playerTotal ?? trip.trip.expected_traveler_count ?? 1);
  if (capacity < trip.members.filter(member => member.invitationStatus === "accepted").length) throw new Error("Remove a joined player before lowering the player count.");
  const arrival = datePlus(basis.startDate, Number(values.arrivalShift ?? 0));
  const dayCount = Number(values.dayCount ?? dayDifference(basis.startDate, basis.endDate) + 1);
  const departure = datePlus(arrival, dayCount - 1);
  const start = values.golfOnArrival === false ? 1 : 0;
  const days = Math.max(0, dayCount - start - (values.golfOnDeparture === false ? 1 : 0));
  const counts = values.roundsPerDay as Record<string, number> | undefined;
  const picks = values.pickedCourses as Record<string, { name?: string }> | undefined;
  const names = values.slotCourseNames as Record<string, string> | undefined;
  const rounds: SavedGolfTrip["rounds"] = [];
  for (let day = 0; day < days; day++) {
    const playDate = datePlus(arrival, day + start);
    const source = basis.rounds.filter(round => round.playDate === playDate);
    for (let slot = 0; slot < (counts?.[day] ?? source.length); slot++) {
      const key = `${day}-${slot}`;
      const courseName = picks?.[key]?.name ?? names?.[key] ?? source[slot]?.courseName ?? null;
      if (courseName !== null && (typeof courseName !== "string" || courseName.length > 200)) throw new Error("Keep course names under 200 characters.");
      rounds.push({ roundNumber: rounds.length + 1, dayNumber: day + start + 1, playDate, courseName: courseName === "Course TBD" ? null : courseName });
    }
  }
  if (rounds.length > 62) throw new Error("A trip can have at most 62 rounds.");
  return { arrival, departure, capacity, rounds };
}
