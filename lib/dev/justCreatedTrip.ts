/**
 * Dev "Just created" trip: turns what's been set up in Settings (saved by lib/dev/justCreatedStore) into the trip the rest
 * of the app reads, so a setup made in Settings shows everywhere:
 * - Golf Schedule (trip dates, golf on arrival / departure day, rounds per day, course picks, round moves) → the trip's
 *   days, rounds and courses (Home's rounds, the countdown, the Mom section's next round).
 * - Tee times and who's in each group → tee times on my Itinerary (groups I'm in) and in the Mom section.
 * - Competition → Format (each competition round's format) → the round's format; round 1's drives the Golf tab.
 * - Players (count, removed) and teams (names, who's on which) → the Golf leaderboard and matches.
 * Pure: never changes the inputs.
 */
import type { GolfTripDraft } from "@/lib/platform/golfTripDraft";
import { plannedRounds } from "@/lib/platform/golfTripDraft";
import { GOLF_MATCH_PREVIEW, GOLF_MATCH_PREVIEWS, type GolfLeaderboardEntry, type GolfMatchGolfer, type GolfMatchPairing, type GolfMatchSide } from "@/lib/platform/golfTripPreviewFixture";
import { defaultRoundComp, matchesPerTeeTime, type RoundCompSettings } from "@/lib/platform/roundCompetition";
import type { PickedCourse } from "@/components/platform/TripScheduleCoursePicker";
import type { TravelItem, TripTravel } from "@/lib/platform/tripTravel";
import type { SimulatorTripData } from "./golfTripSimulatorData";

/** What Settings saves on the Just created trip (field names = its state names). */
export type JustCreatedSetup = {
  roundsPerDay?: Record<number, 0 | 1 | 2>; dayCount?: number; arrivalShift?: number; golfOnArrival?: boolean; golfOnDeparture?: boolean;
  pickedCourses?: Record<string, PickedCourse>; slotCourseNames?: Record<string, string>;
  teeTimes?: Record<string, string[]>; teePlayers?: Record<string, Record<number, number[]>>;
  teeMatches?: Record<string, Record<number, { a: (number | null)[]; b: (number | null)[] }>>;
  compRounds?: Record<string, boolean>; compFormats?: Record<string, RoundCompSettings>;
  playerTotal?: number; removedPlayers?: Set<string>;
  teamNames?: string[]; teamPicks?: Record<number, number>; submittedTeams?: number[][] | null;
  travel?: TripTravel;
};

/** Settings' format names → the Golf tab's format previews. */
const FORMAT_PREVIEW: Record<string, string> = {
  Singles: "singles", Fourball: "fourball", "Alternate Shot": "foursome", Chapman: "chapman", Scramble: "scramble", Shamble: "shamble", "Stroke Play": "singlesstroke", Stableford: "stableford",
};

const shiftDay = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function applyJustCreatedSetup(base: SimulatorTripData, saved: JustCreatedSetup): SimulatorTripData {
  const original = base.preview ?? {};
  // The same reading of the onboarding rounds that Settings starts from.
  const onboardingRounds = plannedRounds(original).filter(round => round.date);
  const days = Array.from(new Set(onboardingRounds.map(round => round.date))).sort();
  if (!days.length) return base;
  const firstRoundDay = days[0];
  const roundsPerDay: Record<number, number> = saved.roundsPerDay ?? Object.fromEntries(days.map((date, index) => [index, Math.min(2, onboardingRounds.filter(round => round.date === date).length)]));
  const dayCount = saved.dayCount ?? Math.max(1, days.length);
  const golfStart = saved.golfOnArrival === false ? 1 : 0;
  const golfDays = Math.max(0, dayCount - golfStart - (saved.golfOnDeparture === false ? 1 : 0));
  const tripDay = (index: number) => shiftDay(firstRoundDay, (saved.arrivalShift ?? 0) + index);

  // Trip days, rounds, courses and formats.
  const draft: GolfTripDraft = Object.fromEntries(Object.entries(original).filter(([key]) => !/^(day\d+(Date|Rounds)|round\d+(Course|Format))$/.test(key)));
  // Arrival / departure: onboarding's, unless they were changed in Golf Schedule.
  const datesChanged = saved.arrivalShift !== undefined || saved.dayCount !== undefined;
  draft.startDate = datesChanged ? tripDay(0) : original.startDate ?? tripDay(0);
  draft.endDate = datesChanged ? tripDay(dayCount - 1) : original.endDate ?? tripDay(dayCount - 1);
  draft.golfDays = String(golfDays);
  const slots: { key: string; date: string; number: number; course: string }[] = [];
  for (let day = 0; day < golfDays; day++) {
    const perDay = Math.min(2, roundsPerDay[day] ?? 1);
    const date = tripDay(day + golfStart);
    draft[`day${day + 1}Date`] = date;
    draft[`day${day + 1}Rounds`] = String(Math.max(1, perDay));
    for (let slot = 0; slot < perDay; slot++) {
      const key = `${day}-${slot}`, number = slots.length + 1;
      // Same order as Settings: a picked course, a name carried by a moved round, then the onboarding course for that slot.
      const onboarding = onboardingRounds.filter(round => round.date === days[day])[slot];
      const course = saved.pickedCourses?.[key]?.name ?? saved.slotCourseNames?.[key] ?? (onboarding ? original[`round${onboarding.number}Course`] : undefined) ?? "Course TBD";
      draft[`round${number}Course`] = course;
      const comp = saved.compRounds?.[key] === false ? undefined : saved.compFormats?.[key];
      if (comp?.format) draft[`round${number}Format`] = comp.format;
      if (comp?.scoring) draft[`round${number}Scoring`] = comp.scoring;
      slots.push({ key, date, number, course });
    }
  }

  // Players: slot 0 is the organizer (or whoever joined), the rest open spots, like Settings → Players.
  const travel = saved.travel ?? base.travel;
  const joined = (travel?.members ?? []).map((member, index) => ({ name: member.name, key: `${index}:${member.name}` })).filter(player => !saved.removedPlayers?.has(player.key));
  const playerTotal = saved.playerTotal ?? Math.max(1, Number(original.playerCount) || 0, joined.length);
  const playerName = (index: number) => joined[index]?.name ?? `Player ${index + 1}`;

  // Tee times: one per group I'm in (I'm slot 0), on my itinerary.
  const meId = travel?.meId;
  const meIndex=Math.max(0,travel?.members.findIndex(member=>member.id===meId)??0);
  const teeItems: TravelItem[] = [];
  for (const { key, date, number, course } of slots) {
    // Matches rounds put me in a tee time through a match: match m plays in tee time ⌊m ÷ matches per tee time⌋.
    const perGroup = matchesPerTeeTime((saved.compFormats?.[key] ?? defaultRoundComp(0)).format);
    const inMatch = (group: number) => Object.entries(saved.teeMatches?.[key] ?? {}).some(([match, sides]) =>
      Math.floor(Number(match) / perGroup) === group && [...sides.a, ...sides.b].includes(meIndex));
    (saved.teeTimes?.[key] ?? []).forEach((time, group) => {
      if (!time || !((saved.teePlayers?.[key]?.[group] ?? []).includes(meIndex) || inMatch(group))) return;
      teeItems.push({ id: `jc-tee-${key}-${group}`, kind: "teeTime", details: { name: course, note: `Round ${number} · Group ${group + 1}` }, startsAt: `${date}T${time}`,
        createdBy: meId ?? "organizer", source: "organizer", joinPolicy: "none", optOutAllowed: false });
    });
  }
  const tripTravel = travel && {
    ...travel,
    items: [...travel.items.filter(item => !item.id.startsWith("jc-tee-")), ...teeItems],
    participants: [...travel.participants.filter(p => !p.itemId.startsWith("jc-tee-")), ...teeItems.map(item => ({ itemId: item.id, memberId: meId ?? "organizer", status: "going" as const }))],
  };

  // Golf: round 1's format, every player (no scores yet), and matches from the teams.
  const sample = GOLF_MATCH_PREVIEWS[FORMAT_PREVIEW[draft.round1Format ?? ""] ?? ""] ?? base.previewMatch ?? GOLF_MATCH_PREVIEW;
  const golfer = (index: number): GolfMatchGolfer => ({ name: playerName(index), hcp: 0, thru: "—", score: "—", teeTime: "", course: draft.round1Course ?? "" });
  const leaderboard: GolfLeaderboardEntry[] = Array.from({ length: playerTotal }, (_, index) => ({
    position: String(index + 1), golfer: golfer(index), total: "—", thru: "—", today: "—", netTotal: "—", netToday: "—", holes: Array<null>(18).fill(null),
  }));
  const teams = saved.submittedTeams ?? (saved.teamPicks ? Object.entries(saved.teamPicks).reduce<number[][]>((all, [player, team]) => {
    (all[team] ??= []).push(Number(player));
    return all;
  }, []) : []);
  const label = (team: number) => saved.teamNames?.[team]?.trim() || `Team ${String.fromCharCode(65 + team)}`;
  // Round 1's matchups built in Golf Schedule win; otherwise two teams play player against player down the lineup, and
  // more teams (pairs, 3- / 4-balls) team against team.
  // Each match plays in its Golf Schedule tee time (match m → tee time ⌊m ÷ matches per tee time⌋), shown in the middle
  // of its row before the round.
  const roundOnePerGroup = matchesPerTeeTime((saved.compFormats?.["0-0"] ?? defaultRoundComp(0)).format);
  const clock = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  };
  const built = Object.entries(saved.teeMatches?.["0-0"] ?? {}).sort(([x], [y]) => Number(x) - Number(y))
    .map(([match, sides]) => {
      const time = saved.teeTimes?.["0-0"]?.[Math.floor(Number(match) / roundOnePerGroup)];
      return { teeTime: time ? clock(time) : "", a: sides.a.filter((player): player is number => player !== null), b: sides.b.filter((player): player is number => player !== null) };
    })
    .filter(sides => sides.a.length || sides.b.length);
  const matches: GolfMatchPairing[] = built.length
    ? built.map(sides => ({ left: { name: label(0), teeTime: sides.teeTime, golfers: sides.a.map(golfer) }, right: { name: label(1), teeTime: sides.teeTime, golfers: sides.b.map(golfer) }, gross: null, net: null }))
    : teams.length === 2
    ? Array.from({ length: Math.max(teams[0]?.length ?? 0, teams[1]?.length ?? 0) }, (_, index) => ({
      left: { name: label(0), golfers: teams[0]?.[index] !== undefined ? [golfer(teams[0][index])] : [] },
      right: teams[1]?.[index] !== undefined ? { name: label(1), golfers: [golfer(teams[1][index])] } : undefined, gross: null, net: null }))
    : Array.from({ length: Math.ceil(teams.length / 2) }, (_, index) => ({
      left: { name: label(index * 2), golfers: (teams[index * 2] ?? []).map(golfer) },
      right: teams[index * 2 + 1] ? { name: label(index * 2 + 1), golfers: teams[index * 2 + 1].map(golfer) } : undefined, gross: null, net: null }));
  const previewMatch = base.previewMatch && {
    ...base.previewMatch, format: sample.format, formatDef: sample.formatDef, course: draft.round1Course ?? base.previewMatch.course,
    // Round 1's Handicap setting (Gross / Net / Both) once it's been set.
    ...(draft.round1Scoring ? { scoring: draft.round1Scoring as "Gross" | "Net" | "Both", handicap: draft.round1Scoring !== "Gross" } : {}),
    roundDate: draft.day1Date ?? base.previewMatch.roundDate, round: 1, roundCount: Math.max(1, slots.length), leaderboard, matches,
    sides: [{ ...base.previewMatch.sides[0], name: label(0) }, { ...base.previewMatch.sides[1], name: label(1) }] as [GolfMatchSide, GolfMatchSide],
  };
  return { ...base, preview: draft, travel: tripTravel, previewMatch };
}
