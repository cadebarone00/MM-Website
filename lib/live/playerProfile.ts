import type { LiveFeedPayload } from "@/lib/data/live";
import type { PlayerScorecard, RoundScorecard } from "@/lib/data/types";
import { leaderboard } from "./scoring";
import { buildOfficialMatchState } from "./officialMatchState";
import { profileMatch } from "./matchProfile";
import type { LiveTournamentSnapshot } from "./types";

/** Confirmed-only native scores; shared-ball rounds never become personal rounds. */
export function playerProfilePayload(snapshot: LiveTournamentSnapshot, player: string): LiveFeedPayload {
  const team = snapshot.players[player]?.team;
  const rounds: RoundScorecard[] = [];
  for (const number of [...new Set(snapshot.matchBoxes.filter(box => box.format !== "Foursome" && [...box.maroonPlayers, ...box.whitePlayers].includes(player)).map(box => box.session))].sort((a, b) => a - b)) {
    const course = snapshot.courses[snapshot.roundCourses[number]];
    if (!course) continue;
    const holes = [...course.holes].sort((a, b) => a.number - b.number).map(hole => {
      const value = snapshot.scores.get(`${player}:${number}:${hole.number}`);
      const score = value?.score != null && value.score > 0 ? value.score : 0;
      return { hole: hole.number, par: hole.par, yards: hole.yards, score,
        putts: value?.putts ?? 0, fir: hole.par === 3 || value?.fir == null ? "X" as const : Number(value.fir),
        gir: Number(value?.gir === true), diff: score > 0 ? score - hole.par : 0 };
    });
    const played = holes.filter(hole => hole.score > 0);
    if (!played.length) continue;
    rounds.push({ round: number, course: course.name, format: snapshot.matchBoxes.find(box => box.session === number)?.format,
      total: played.reduce((sum, hole) => sum + hole.score, 0), toPar: played.reduce((sum, hole) => sum + hole.diff, 0),
      putts: played.reduce((sum, hole) => sum + hole.putts, 0), girHit: played.filter(hole => hole.gir === 1).length,
      girTotal: played.length, firHit: played.filter(hole => hole.fir === 1).length, firTotal: played.filter(hole => hole.fir !== "X").length, holes });
  }
  const scorecards: PlayerScorecard[] = team ? [{ player, team, rounds }] : [];
  return { roster: { maroon: Object.keys(snapshot.players).filter(key => snapshot.players[key].team === "maroon"), white: Object.keys(snapshot.players).filter(key => snapshot.players[key].team === "white") },
    matches: snapshot.matchBoxes.filter(box => box.id).map(box => profileMatch({
      match: { id: box.id!, season_year: box.seasonYear, round: box.session, format: box.format,
        tee_time: box.teeTime.toISOString(), maroon_players: box.maroonPlayers, white_players: box.whitePlayers },
      officialState: buildOfficialMatchState(snapshot, box), odds: null, oddsHistory: [], scorecard: null,
    })),
    individualLeaderboard: leaderboard(snapshot).filter(entry => entry.played > 0).map(({ player, team, toPar }) => ({ player, team, toPar })), scorecards };
}
