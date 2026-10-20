import { standingsFormat } from "./historicalTripStandings";
import { resolveGolfFormat } from "./formats";
import { normalizeCompetitor, type GolfMatchPreview } from "./golfTripPreviewFixture";

/** A player-relative summary from the selected round's supplied pairing and result. */
export function nonIndividualRound(match: GolfMatchPreview, round: number, name: string) {
  const snapshot = match.roundStandings?.find(item => item.round === round);
  const format = snapshot?.format ?? (round === match.round ? match.format : undefined);
  if (!format || !standingsFormat(format).sharedBall) return null;
  const pairing = match.matches.find(pair => (pair.round ?? match.round) === round &&
    [pair.left, pair.right].some(side => side && normalizeCompetitor(side).golfers.some(g => g.name === name)));
  const left = pairing ? normalizeCompetitor(pairing.left) : undefined;
  const right = pairing?.right ? normalizeCompetitor(pairing.right) : undefined;
  const isLeft = !!left?.golfers.some(g => g.name === name);
  const own = isLeft ? left : right, opponents = isLeft ? right : left;
  const team = own?.name || match.sides[isLeft ? 0 : 1].name;
  let result = "Result not available";
  if (pairing && resolveGolfFormat(format).scoringMethod === "stroke_play") {
    if (own?.totalScore && opponents?.totalScore) result = `${own.totalScore} to ${opponents.totalScore}`;
  } else if (pairing?.result) {
    const state = pairing.gross;
    result = state ? state.leader === null ? `${team} ties ${pairing.result}`
      : `${team} ${state.leader === (isLeft ? "left" : "right") ? "wins" : "loses"} ${pairing.result}` : pairing.result;
  }
  return { format: standingsFormat(format).label, partners: own?.golfers.filter(g => g.name !== name).map(g => g.name) ?? [],
    competitors: opponents?.golfers.map(g => g.name) ?? [], result };
}
