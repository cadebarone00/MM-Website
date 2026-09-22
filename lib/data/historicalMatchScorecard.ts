import type { CareerTeamHoleRecord } from "./careerStats";
import type { MatchProfileScorecard } from "@/lib/live/matchProfile";
import type { PlayerScorecard, RealMatch, Tournament } from "./types";
import { getPlayerSlug } from "./players";
import { matchRound } from "./roundIdentity";

/** Both profile and match views read these same canonical individual round rows. */
export function historicalMatchScorecard(tournament: Tournament, match: RealMatch, cards: PlayerScorecard[], teams: CareerTeamHoleRecord[]): MatchProfileScorecard | null {
  const round = matchRound(tournament, match);
  if (round == null) return null;
  const players = [...match.maroonPlayers, ...match.whitePlayers];
  const shared = match.format === "Alt Shot" || match.format === "Foursome";
  const individual = (player: string) => cards.find(card => getPlayerSlug(card.player) === getPlayerSlug(player))?.rounds.find(entry => entry.round === round);
  const team = (player: string) => teams.filter(row => row.year === tournament.year && row.round === round &&
    [match.maroonPlayers, match.whitePlayers].some(side => side.includes(player) && side.includes(row.player1) && side.includes(row.player2)));
  const setup = players.flatMap(player => shared ? team(player).map(hole => ({ course: hole.course, hole })) :
    (individual(player)?.holes ?? []).map(hole => ({ course: individual(player)!.course, hole })));
  if (!setup.length) return null;
  const numbers = [...new Set(setup.map(entry => entry.hole.hole))].sort((a, b) => a - b);
  return { courseName: setup[0].course, holes: numbers.map(number => {
    const hole = setup.find(entry => entry.hole.hole === number)!.hole;
    return { number, par: hole.par, yards: hole.yards, scores: Object.fromEntries(players.map(player => {
      const score = (shared ? team(player) : individual(player)?.holes)?.find(entry => entry.hole === number)?.score;
      return [player, score != null && score > 0 ? score : null];
    })) };
  }) };
}
