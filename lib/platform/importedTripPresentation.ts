import type { SavedGolfTrip } from "./golfTripCreate";
import type { GolfLeaderboardEntry, GolfMatchCompetitor, GolfMatchPairing, GolfMatchPreview, GolfMatchSide, RoundScoring } from "./golfTripPreviewFixture";
import type { PlayerRound, PlayerRoundHole } from "./playerRounds";
import { tripStats } from "./tripStats.ts";
import type { TripStatsView } from "@/components/platform/GolfTripStats";
import { ownBall, pastTripResults, type ImportedTrip, type PastRound, type PastScore, type PastTripResults } from "./pastTripModel.ts";

/**
 * An imported past trip (golf_trip_imported_results) in the shapes Golf Trip Home already draws for a live trip:
 * each round's leaderboard (totals to par, nets, Stableford points, hole-by-hole cards when entered), every match
 * with its final result, and the team points. Like historicalTripStandings, a shared-ball round (no individual
 * scores) shows the standings from the last own-ball round before it. Nothing is made up: no pars per hole, no margins.
 */

export interface ImportedTripView {
  previewMatch: GolfMatchPreview;
  /** Each round's format for the schedule draft ("round<n>Format"). */
  roundFormats: Record<string, string>;
  competitionType: { individual: string | null; team: string | null };
  teamNames: [string, string] | null;
  results: PastTripResults;
  /** The Stats section, from the hole-by-hole cards that have pars (null when no card has any). */
  tripStats: TripStatsView | null;
  /** Shown above the trip: the final team score and the champion, by name. */
  headline: { team: string | null; champion: string | null };
}

/** A card's holes with both strokes and a known par, in the live scorecard's shape (PlayerRoundHole). */
function cardHoles(round: PastRound, score: PastScore | undefined): PlayerRoundHole[] {
  if (!score?.holes) return [];
  return score.holes.flatMap((strokes, h) => {
    const par = round.holePars?.[h] ?? null;
    return strokes === null || par === null ? [] : [{ number: h + 1, par, strokes, putts: score.putts?.[h] ?? null, fairway: score.fairway?.[h] ?? null, green: score.green?.[h] ?? null }];
  });
}
const fullPars = (round: PastRound) => round.holePars && round.holePars.every((h) => h !== null) ? round.holePars as number[] : [];

const toPar = (value: number | null) => value === null ? "—" : value === 0 ? "E" : value > 0 ? `+${value}` : String(value);
const FINAL_SIDE = (name: string, winPct: number): GolfMatchSide => ({ name, winPct, fairwayPct: "—", greenPct: "—", putts: "—", score: "—" });

export function importedTripView(trip: ImportedTrip, members: SavedGolfTrip["members"] = []): ImportedTripView {
  const results = pastTripResults(trip);
  const rounds = [...trip.rounds].sort((a, b) => a.number - b.number);
  const last = rounds.at(-1)!;
  const member = (id: string) => members.find((m) => m.id === id && m.invitationStatus === "accepted");
  const line = (id: string) => results.players.find((p) => p.player === id);
  const golfer = (id: string, course: string) => {
    const p = trip.players.find((x) => x.id === id);
    return { name: p?.name ?? "Unknown player", hcp: p?.handicap ?? 0, thru: "F", score: "", teeTime: "", course, points: line(id)?.matchPoints,
      avatarUrl: member(id)?.avatarUrl ?? null, username: member(id)?.username ?? null };
  };

  // One round's leaderboard: totals run through that round (own-ball rounds only), "today" is that round.
  const standings = (upTo: number, shown: number | null): GolfLeaderboardEntry[] => trip.players.map((p) => {
    const counted = rounds.filter((r) => r.number <= upTo && ownBall(r.format));
    const score = (n: number) => trip.scores.find((s) => s.player === p.id && s.round === n);
    const strokes = counted.filter((r) => r.format !== "Stableford" && r.par !== null && score(r.number));
    const points = counted.filter((r) => r.format === "Stableford" && score(r.number));
    const gross = strokes.length ? strokes.reduce((sum, r) => sum + score(r.number)!.total - r.par!, 0) : null;
    const net = gross === null ? null : gross - strokes.length * (p.handicap ?? 0);
    const today = shown === null ? undefined : score(shown);
    const todayRound = rounds.find((r) => r.number === shown);
    const stablefordToday = todayRound?.format === "Stableford";
    const todayGross = today && !stablefordToday && todayRound?.par != null ? today.total - todayRound.par : null;
    const entry: GolfLeaderboardEntry = {
      position: "", golfer: { ...golfer(p.id, todayRound?.course ?? ""), thru: today ? "F" : "" },
      total: toPar(gross), netTotal: toPar(net), today: toPar(todayGross), netToday: toPar(todayGross === null ? null : todayGross - (p.handicap ?? 0)),
      thru: today ? "F" : "—", holes: today?.holes ?? Array<null>(18).fill(null),
      ...(today?.putts ? { putts: today.putts } : {}),
      ...(todayRound && today && cardHoles(todayRound, today).length ? { holeDetails: cardHoles(todayRound, today) } : {}),
    };
    if (points.length) entry.pointsTotal = points.reduce((sum, r) => sum + score(r.number)!.total, 0);
    if (stablefordToday && today) entry.pointsToday = today.total;
    return entry;
  });
  const lastOwnBall = (n: number) => rounds.filter((r) => r.number <= n && ownBall(r.format)).at(-1)?.number;
  const roundStandings = rounds.map((r) => {
    const standingsRound = ownBall(r.format) ? r.number : lastOwnBall(r.number);
    const shownRound = rounds.find((x) => x.number === standingsRound);
    return { round: r.number, standingsRound, datePlayed: r.date ?? undefined, format: r.format, par: shownRound ? fullPars(shownRound) : [],
      leaderboard: standings(r.number, standingsRound ?? null) };
  });

  const side = (ids: string[], course: string): GolfMatchCompetitor => ({ golfers: ids.map((id) => golfer(id, course)), thru: "F", course });
  const matches: GolfMatchPairing[] = trip.matches.map((m) => {
    const course = rounds.find((r) => r.number === m.round)?.course ?? "";
    const standing = m.winner === "halved" ? { leader: null, up: 0 } : { leader: m.winner === 0 ? "left" as const : "right" as const, up: 1 };
    // A finished match: 100 / 0 for the winner, 50 each when halved (matchWinPct's rule for a match that's over).
    const left = m.winner === "halved" ? 50 : m.winner === 0 ? 100 : 0;
    const sides: [GolfMatchSide, GolfMatchSide] = [FINAL_SIDE("", left), FINAL_SIDE("", 100 - left)];
    return { left: side(m.sides[0], course), right: side(m.sides[1], course), gross: standing, net: standing, round: m.round, result: m.winner === "halved" ? "AS" : "WON", sides };
  });

  const team = trip.kind !== "individual" && trip.teamNames;
  const roundScoring: RoundScoring[] = team ? results.teamRounds.map((r) => {
    const count = trip.matches.filter((m) => m.round === r.round).length;
    return { round: r.round, matchPlay: true, pointsPerMatch: 1, nassau: false, pointsAvailable: count };
  }) : [];
  const winPct = (s: 0 | 1) => results.teamWinner === null || results.teamWinner === "tied" ? 50 : results.teamWinner === s ? 100 : 0;
  const names = trip.teamNames ?? ["Team A", "Team B"];
  const hasHandicaps = trip.players.some((p) => (p.handicap ?? 0) !== 0);

  const previewMatch: GolfMatchPreview = {
    round: last.number, roundCount: rounds.length, course: last.course, roundDate: last.date ?? trip.endDate, format: last.format,
    handicap: hasHandicaps, scoring: hasHandicaps ? "Both" : "Gross", par: fullPars(rounds.find((r) => r.number === roundStandings.at(-1)?.standingsRound) ?? last), parIsReference: true,
    sides: [FINAL_SIDE(names[0], winPct(0)), FINAL_SIDE(names[1], winPct(1))],
    matches, leaderboard: roundStandings.at(-1)!.leaderboard, roundStandings, ...(team ? { roundScoring } : {}),
  };
  const championName = trip.players.find((p) => p.id === results.champion)?.name ?? null;
  const teamLine = team && results.teamTotals ? results.teamWinner === "tied"
    ? `${names[0]} and ${names[1]} tied ${results.teamTotals[0]}–${results.teamTotals[1]}`
    : results.teamWinner === null ? null : `${names[results.teamWinner]} won ${Math.max(...results.teamTotals)}–${Math.min(...results.teamTotals)}` : null;
  return {
    previewMatch,
    roundFormats: Object.fromEntries(rounds.map((r) => [`round${r.number}Format`, r.format])),
    competitionType: {
      individual: trip.kind === "team" ? null : trip.method === "Most Stableford points" ? "Stableford" : "Stroke Play",
      team: trip.kind === "individual" ? null : "2 Teams",
    },
    teamNames: trip.teamNames,
    tripStats: statsFor(trip, members),
    results,
    headline: { team: teamLine, champion: trip.method ? championName ?? "Tied" : null },
  };
}

/**
 * The Stats section for an imported trip: every own-ball card with 9 or 18 holes that have both strokes and a par, run
 * through the same code a live trip uses (tripStats + the Course / Individual views). Null when no card has any.
 */
function statsFor(trip: ImportedTrip, members: SavedGolfTrip["members"]): TripStatsView | null {
  const STATS_TRIP = "imported";
  const cards: PlayerRound[] = trip.scores.flatMap((score, i) => {
    const round = trip.rounds.find((r) => r.number === score.round);
    if (!round || !ownBall(round.format) || round.format === "Stableford") return [];
    const holes = cardHoles(round, score);
    if (holes.length !== 9 && holes.length !== 18) return [];
    return [{
      id: `imported-${i}`, profileId: score.player, source: "trip", tripId: STATS_TRIP, datePlayed: round.date ?? trip.startDate,
      course: { ref: null, name: round.course, place: "" }, tee: null, holesPlayed: holes.length as 9 | 18, format: round.format, holes,
      total: holes.reduce((sum, h) => sum + h.strokes, 0), countsForHandicap: false, notCountedReason: "Imported past trip", differential: null,
      enteredBy: "organizer", status: "submitted",
    }];
  });
  if (!cards.length) return null;
  const name = (id: string) => trip.players.find((p) => p.id === id)?.name ?? members.find((m) => m.id === id)?.displayName ?? "Player";
  const totals = tripStats(cards, STATS_TRIP);
  return { players: totals.players.map((row) => ({ ...row, name: name(row.profileId) })), trip: totals.trip,
    rounds: cards.map((c) => ({ profileId: c.profileId, course: c.course, holes: c.holes, total: c.total, holesPlayed: c.holesPlayed })) };
}
