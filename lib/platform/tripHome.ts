import { bigBoardScore, upcomingSlides, type BigBoardScore } from "./bigBoard";
import { flightCounts, flightTime, type FlightSummary } from "./golfTripFlights";
import { savedTripAsDraft, type SavedGolfTrip } from "./golfTripCreate";
import { plannedRounds, type GolfTripDraft } from "./golfTripDraft";
import { ITINERARY_KIND_LABEL, itineraryDay, itineraryTime, withGolfRounds, type ItineraryItem, type ItineraryKind } from "./golfTripItinerary";
import { normalizeCompetitor } from "./golfTripPreviewFixture";
import { homeCompetitionSummary, teamGroups, yourTeam, type HomeCompetitionSummary } from "./homeCompetition";
import { homeMatchRounds } from "./homeDraft";
import { homeTeamRoster, type HomeRosterPlayer, type HomeRosterTeam } from "./homeRoster";
import { homeRosterFull } from "./tapIn";
import type { MomRound } from "./momNotifications";
import type { RoundCompSettings } from "./roundCompetition";
import type { GameId } from "./roundGames";
import { savedTripPresentation } from "./savedTripPresentation";
import { skinsRoundsFrom } from "./tripSkins";
import type { GolfMatchPreview } from "./golfTripPreviewFixture";
import type { CompetitionStructure } from "./golfTripNavigation";
import type { TripSetupSnapshot } from "./savedTripSetup";
import type { SavedTravelSnapshot } from "./savedTripTravel";
import { tapInPath } from "./tapIn";
import { roundScoringFrom } from "./teamPoints";
import type { TripCorrections } from "./tripCorrections";
import type { TripRoundScoring } from "./tripScoring";
import { goingOnly, itineraryFor, type TripTravel } from "./tripTravel";
import type { MomentumEvent } from "./tripPush";
import { getPlayerDisplayName } from "../data/players";
import { placesToRate, RATE_WITHIN_DAYS } from "./venuePlaces";
import { itineraryWeekday } from "./golfTripItinerary";
import { homeDrafts, savedTeamDraft, type HomeDrafts } from "./tripHomeDrafts";

/**
 * Trip Home (project_specs.md Golf Trips part 2c): everything the Home tab shows for a saved trip, worked out from the
 * trip page data, the same way for the website (components/platform/GolfTripHome.tsx) and the app (mobile/). Plain data
 * only: each screen draws it in its own look.
 */

/** "Jan 7 – Jan 10, 2026": the year once, on the second date (on both if the trip crosses a year); one date if only one is set. */
export function dateRangeLabel(start: string | undefined, end: string | undefined): string {
  const format = (day: string, withYear: boolean) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  const from = validDay(start) ? start! : null, to = validDay(end) ? end! : null;
  if (from && to) return `${format(from, from.slice(0, 4) !== to.slice(0, 4))} – ${format(to, true)}`;
  return from || to ? format((from ?? to)!, true) : "";
}

/** A saved trip date (YYYY-MM-DD) that can be shown. */
export const validDay = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** One slide in the Big Board's bottom half. `opens`: what a tap opens. */
export type HomeSlide = { key: string; title: string; ariaLabel: string; kind: string; icon: ItineraryKind | "flights" | "itinerary";
  status?: string; live: boolean; when: string; detail?: string; opens: "itinerary" | "flights" };

/** The Flights slide (trips without an itinerary): the next flight, or what to do. */
export function flightsSlide(summary: FlightSummary | undefined): HomeSlide {
  const next = summary?.next;
  const counts = summary ? flightCounts(summary) : "";
  const when = next ? flightTime(next.departureLocal) : counts ? "No upcoming flights" : "Add your flights";
  return { key: "flights", title: next ? `${next.flightNumber} · ${next.departureAirport} → ${next.arrivalAirport}` : "Flights", icon: "flights",
    ariaLabel: `Flights: ${next ? `next ${next.flightNumber}` : counts || "add your flights"}`,
    kind: "Flights", status: next ? "NEXT" : undefined, live: false, when, detail: counts || undefined, opens: "flights" };
}

/** The Big Board's bottom half: every upcoming plan (LIVE / NOW / NEXT / UPCOMING); "Nothing else coming up"; or Flights. */
export function homeSlides(itinerary: ItineraryItem[] | undefined, now: string, liveRound: ItineraryItem | undefined, flights: FlightSummary | undefined): HomeSlide[] {
  if (!itinerary) return [flightsSlide(flights)];
  const boxes = upcomingSlides(itinerary, now, liveRound);
  if (!boxes.length) return [{ key: "nothing", title: "Itinerary", icon: "itinerary", ariaLabel: "Nothing else coming up. Open the itinerary",
    kind: "Itinerary", live: false, when: "Nothing else coming up", detail: "See the full itinerary", opens: "itinerary" }];
  return boxes.map(({ status, item }) => {
    const live = status === "LIVE";
    const when = live ? "In play now" : `${itineraryDay(item.startsAt)} · ${itineraryTime(item.startsAt)}`;
    const kind = live ? "Golf" : ITINERARY_KIND_LABEL[item.kind];
    return { key: item.id, title: item.title, icon: item.kind, kind, status, live, when, detail: item.detail, opens: "itinerary",
      ariaLabel: `${status}: ${kind}: ${item.title}, ${when}${item.detail ? `, ${item.detail}` : ""}. Open the itinerary` };
  });
}

/** The trip page data the Home tab needs (lib/platform/tripPageData.ts, status "live"). */
export type TripHomeData = {
  savedTrip: SavedGolfTrip; viewer: { profileId: string; isOrganizer: boolean };
  setupSnapshot: TripSetupSnapshot; planSnapshot: SavedTravelSnapshot; flightSummary: FlightSummary;
  /** corrections: requests + submission history for the round (null until golf_trip_scoring_corrections.sql is installed). */
  scoring: { profileId: string; scoring: TripRoundScoring; corrections?: TripCorrections | null } | null;
};

export type TripHomeView = {
  tripName: string; destination: string | null; dateRange: string;
  isOrganizer: boolean; competitive: boolean;
  /** Settings → Competition's Individual / Team choices (null = no competition). */
  competitionTypes: { individual: string | null; team: string | null } | null;
  /** Big Board top half: the scores (competition trips, once a round is on or done), else Momentum. */
  score: BigBoardScore | null; highlights: MomentumEvent[];
  slides: HomeSlide[];
  /** The Mom section (countdown / notes / next round). */
  mom: { travel?: TripTravel; arrivalDay?: string; plans: { startsAt: string }[]; rounds: MomRound[]; afterRound: number };
  /** The Maroon Live link's path, or null when the trip has no watch code. */
  livePath: string | null;
  roster: { players: HomeRosterPlayer[]; teams: HomeRosterTeam[] | null; allotted: number | null; showInvite: boolean };
  competition: HomeCompetitionSummary | null; competitionNote: string;
  /** Drafts (trips with a team or individual competition): Team Draft / Match Selection cards; null = no Drafts section. */
  drafts: HomeDrafts | null;
  /** "How was yesterday?": my recent going plans at Venue places, to rate (the server drops ones already rated or skipped). */
  rateVisits: { placeId: string; name: string; when: string; visitedOn: string }[];
  draft: GolfTripDraft; rounds: MomRound[];
  /** The Golf tab (part 2d): the trip's scores and matches, which competition it has, who I am, and whether today's round is live. */
  match: GolfMatchPreview; structure: CompetitionStructure; viewerName: string | null; roundLive: boolean;
  /** Golf → Games: me, my group (today's scoring group, else everyone who accepted) and the organizer's games per round. */
  games: { tripId: string; meId: string; group: { profileId: string; name: string }[]; organizerGames: Record<string, GameId[]> | undefined };
  /** Organizer → Predict (saved on the trip): shown or not, and the bets switched off. */
  predict: { on: boolean; off: string[] };
};

/** Golf → Games' group: the players in my scoring group today; before groups exist, everyone who accepted (website and app). */
export function tripGamesGroup(members: SavedGolfTrip["members"], groups: { players: { profileId: string | null }[] }[] | undefined, meId: string) {
  const accepted = members.filter((m) => m.profileId && m.invitationStatus === "accepted");
  const mine = groups?.find((g) => g.players.some((p) => p.profileId === meId))?.players.map((p) => p.profileId);
  return accepted.filter((m) => !mine || mine.includes(m.profileId)).map((m) => ({ profileId: m.profileId as string, name: m.displayName }));
}

/** Organizer → Predict from the trip's saved settings: on unless switched off. */
export function predictSettingsFrom(setup: Record<string, unknown>): { on: boolean; off: string[] } {
  const value = setup.predictSettings as { on?: unknown; off?: unknown } | undefined;
  return { on: value?.on !== false, off: Array.isArray(value?.off) ? value!.off.filter((id): id is string => typeof id === "string") : [] };
}

/** Everything on Home, from the trip page data. `now` = "YYYY-MM-DDTHH:mm" (device local, read once when Home opens). */
export function tripHomeView(data: TripHomeData, now: string, momentum: MomentumEvent[]): TripHomeView {
  const { savedTrip, viewer } = data;
  const draft = savedTripAsDraft(savedTrip);
  const setup = data.setupSnapshot.values as Record<string, unknown>;
  const live = data.scoring?.scoring ?? null;
  const accepted = savedTrip.members.filter((m) => m.profileId && m.invitationStatus === "accepted");
  const tripRoundNumbers = savedTrip.rounds.map((r) => ({ number: r.roundNumber, dayNumber: r.dayNumber }));
  const match = { ...savedTripPresentation(savedTrip, live), roundScoring: roundScoringFrom(tripRoundNumbers, setup.compFormats as Record<string, RoundCompSettings> | undefined,
    setup.compRounds as Record<string, boolean> | undefined, Number(setup.playerTotal) || accepted.length),
    skins: skinsRoundsFrom(tripRoundNumbers, setup, accepted.map((m) => m.displayName)) };
  const types = setup.localCompetitionType as { individual: string | null; team: string | null } | undefined;
  const competitive = draft.includesTournament === "yes";
  const scoringMethod = match.formatDef?.scoringMethod;
  const structure = !competitive ? { individual: false, team: false }
    : types ? { individual: Boolean(types.individual), team: Boolean(types.team) }
    : scoringMethod === "match_play" ? { individual: false, team: true } : scoringMethod ? { individual: true, team: false } : { individual: true, team: true };
  const competitionTypes = structure.individual || structure.team
    ? { individual: types?.individual ?? (structure.individual ? "Stroke Play" : null), team: types?.team ?? (structure.team ? "2 Teams" : null) } : null;

  // Travel and the itinerary: golf rounds always show (my tee times, "Tee time TBD" otherwise); Home only gets what I'm going on.
  const travel = data.planSnapshot.available ? data.planSnapshot.travel : undefined;
  const tripRounds = plannedRounds(draft).map((round) => ({ number: round.number, date: round.date, course: draft[`round${round.number}Course`] || "Course TBD" }));
  const itinerary = travel || tripRounds.length ? withGolfRounds(travel ? itineraryFor(travel) : [], tripRounds) : undefined;
  const going = itinerary && goingOnly(itinerary);

  // A round is live while its scoring is up (today's round, this golfer seated in a group).
  const roundLive = !!live && !!data.scoring && live.groups.some((g) => g.players.some((p) => p.profileId === data.scoring!.profileId));
  const liveRound: ItineraryItem | undefined = roundLive ? { id: `round-${match.round}`, kind: "teeTime", title: `Round ${match.round} · ${match.course}`, startsAt: "" } as ItineraryItem : undefined;
  const afterRound = roundLive || match.leaderboard.some((row) => row.holes.every((strokes) => strokes !== null)) ? match.round : match.round - 1;
  const rounds: MomRound[] = plannedRounds(draft).map((round) => ({ number: round.number, date: round.date, course: draft[`round${round.number}Course`] || "Course TBD",
    format: draft[`round${round.number}Format`] || (round.number === match.round ? match.formatDef?.label : undefined) }));

  const viewerName = accepted.find((m) => m.profileId === viewer.profileId)?.displayName ?? null;
  const score = competitive ? bigBoardScore(match, roundLive || afterRound > 0, !!(competitionTypes?.individual && competitionTypes?.team), viewerName) : null;

  // Players: everyone who's joined (the Golf leaderboard's players); teams once they're set.
  const players: HomeRosterPlayer[] = match.leaderboard.map((row) => ({ name: row.golfer.name, avatarUrl: row.golfer.avatarUrl, username: row.golfer.username }));
  const draftPlayers = match.leaderboard.map((row) => {
    const name = getPlayerDisplayName(row.golfer.name);
    const team = match.matches.flatMap((pairing) => (["left", "right"] as const).flatMap((side, index) => pairing[side]
      ? normalizeCompetitor(pairing[side]!).golfers.map((golfer) => ({ name: getPlayerDisplayName(golfer.name), team: index === 0 ? "A" as const : "B" as const })) : [])).find((item) => item.name === name)?.team;
    return { name, handicap: row.golfer.hcp, team };
  });
  const rosterNames = draftPlayers.map((player) => player.name);
  const allotted = Number.parseInt(draft.playerCount ?? "", 10) > 0 ? Number.parseInt(draft.playerCount ?? "", 10) : null;
  const teamNames = (setup.teamNames as string[] | undefined) ?? match.sides.map((side) => side.name);
  const savedGroups = teamGroups(setup.submittedTeams as number[][] | undefined, setup.teamPicks as Record<number, number> | undefined);
  const rosterGroups = draftPlayers.some((player) => player.team) ? (["A", "B"] as const).map((side) => draftPlayers.flatMap((player, index) => player.team === side ? [index] : [])) : null;
  const teams = homeTeamRoster({ teamCompetition: !!competitionTypes?.team, players, assignmentNames: rosterNames, groups: savedGroups ?? rosterGroups, teamNames });

  // Competition: everything the trip's competition is, from its real settings.
  const base = competitionTypes ? homeCompetitionSummary({ types: competitionTypes, scoring: match.roundScoring,
    recordStandings: homeMatchRounds({ ...setup, localCompetitionType: competitionTypes }, rounds, draftPlayers.length).some((round) => round.method === "Round Robin"),
    rounds: plannedRounds(draft).map((round) => { const planned = rounds.find((r) => r.number === round.number); return { number: round.number, dayNumber: round.dayNumber, format: planned?.format, course: planned?.course }; }) }) : null;
  const competition = base && { ...base, yourTeam: yourTeam({ teamFormat: base.teamFormat, me: viewerName, players: rosterNames,
    groups: savedGroups ?? (base.teamFormat === "2 Teams" ? rosterGroups : null), teamNames }) };

  return {
    tripName: draft.tripName || "Your Golf Trip", destination: draft.destination || null, dateRange: dateRangeLabel(draft.startDate, draft.endDate),
    isOrganizer: viewer.isOrganizer, competitive, competitionTypes,
    score, highlights: momentum,
    slides: homeSlides(going, now, liveRound, data.flightSummary),
    mom: { travel, arrivalDay: draft.startDate, plans: going ?? [], rounds, afterRound },
    livePath: tapInPath(savedTrip.trip.watch_code),
    roster: { players, teams, allotted, showInvite: !homeRosterFull(players.length, allotted, !!teams) },
    drafts: competitionTypes ? homeDrafts({ setup, competitionTypes, team: competitive ? savedTeamDraft(setup, types?.team ?? null) : undefined, players: draftPlayers, rounds: competitive ? rounds : [],
      playedThrough: afterRound, teamNames, now }) : null,
    rateVisits: travel ? placesToRate(travel.items
      .filter((item) => item.details.placeId && travel.participants.some((p) => p.itemId === item.id && p.memberId === travel.meId && p.status === "going"))
      .map((item) => ({ placeId: item.details.placeId!, name: item.details.name || "Plan", startsAt: item.startsAt,
        when: `${itineraryWeekday(item.startsAt)} · ${itineraryTime(item.startsAt)}`, visitedOn: item.startsAt.slice(0, 10) })), now.slice(0, 10), [], RATE_WITHIN_DAYS) : [],
    competition, competitionNote: competitive ? "Team drafts, matches and skins will show here." : "No competition",
    draft, rounds, match, structure, viewerName, roundLive,
    games: { tripId: savedTrip.trip.id, meId: viewer.profileId, group: tripGamesGroup(savedTrip.members, live?.groups, viewer.profileId),
      organizerGames: setup.gameRounds as Record<string, GameId[]> | undefined },
    predict: predictSettingsFrom(setup),
  };
}
