import type { TripRoundScoring } from "../../platform/tripScoring.ts";
import type { TemplateValues } from "../template.ts";
import { attestedScores, type DetectedMoment } from "./scoreMoments.ts";

/**
 * Individual-leaderboard highlights (owner request 2026-11-27, "Individual leaderboard" tab). Pure: every round of the
 * trip (its attested scores + confirmed pars) in → moments out, recomputed from the whole trip each time.
 *
 * The board: each player's running score to par (gross) over every attested hole of every round with confirmed pars,
 * replayed hole by hole in the order the scores came in; same score = same place. Claude's calls (2026-11-27): only for
 * a STROKE PLAY individual competition; rounds without confirmed pars don't count; a "big climb" is 5+ places from
 * where the player stood when that round's first score came in; "new tournament record" (HL-037) waits for past records.
 *   HL-031 new solo leader · HL-032 ties the lead · HL-033 breaks away (solo lead of 3+) · HL-034 shakeup (3+ players
 *   within a shot of the lead) · HL-035 big climb · HL-036 the lead changes on the 18th hole of the final round (instead
 *   of HL-031) · HL-038 a tie for first when the final round is done (playoff) · HL-039 the individual champion.
 */

export interface LeaderboardRound { roundNumber: number; scoring: TripRoundScoring; pars: number[] | null }
export interface LeaderboardInput { tripId: string; rounds: LeaderboardRound[]; finalRound: number; names: Map<string, string> }

type Step = { at: string; player: string; round: number; hole: number; toPar: number };

export function detectLeaderboardMoments(input: LeaderboardInput): DetectedMoment[] {
  const nameOf = (id: string) => input.names.get(id) ?? "A golfer";
  const steps: Step[] = [];
  const roundPlayers = new Map<number, string[]>();
  for (const round of input.rounds) {
    if (!round.pars || round.pars.length !== 18) continue;
    const scores = attestedScores(round.scoring);
    roundPlayers.set(round.roundNumber, [...scores.keys()]);
    for (const [player, holes] of scores) holes.forEach((s, i) => { if (s) steps.push({ at: s.at, player, round: round.roundNumber, hole: i + 1, toPar: s.strokes - round.pars![i] }); });
  }
  steps.sort((a, b) => a.at.localeCompare(b.at) || a.player.localeCompare(b.player));
  const out: DetectedMoment[] = [];
  const push = (ruleId: string, n: string, step: Step | { at: string; round: number; hole: number }, player: string | null, extra: TemplateValues = {}) =>
    out.push({ key: `${input.tripId}:board:${ruleId}:${n}`, ruleId, tier: null, profileId: player ?? "", playerName: player ? nameOf(player) : "", hole: step.hole, at: step.at,
      values: { ...(player ? { Player: nameOf(player) } : {}), Round: String(step.round), Hole: String(step.hole), ...extra } });

  const total = new Map<string, number>();
  const placeOf = (id: string) => 1 + [...total.values()].filter((v) => v < total.get(id)!).length;
  const leaders = () => { const best = Math.min(...total.values()); return [...total].filter(([, v]) => v === best).map(([id]) => id); };
  let soloLeader: string | null = null, prevLeaders: string[] = [];
  const startPlace = new Map<string, number>(); // `${round}:${player}` → place when the round's first score came in
  const seenRound = new Set<number>();
  const fired = new Set<string>();

  for (const step of steps) {
    if (!seenRound.has(step.round)) { seenRound.add(step.round); for (const id of total.keys()) startPlace.set(`${step.round}:${id}`, placeOf(id)); }
    total.set(step.player, (total.get(step.player) ?? 0) + step.toPar);
    if (total.size < 2) continue; // a leaderboard needs two players: the first lead is announced once there are two
    const now = leaders();
    const n = `${step.round}:${step.hole}:${step.player}`;
    if (now.length === 1 && now[0] !== soloLeader) {
      const finalHole = step.round === input.finalRound && step.hole === 18 && soloLeader !== null;
      push(finalHole ? "HL-036" : "HL-031", n, step, now[0]);
      soloLeader = now[0];
    } else if (now.length > 1) {
      for (const id of now) if (!prevLeaders.includes(id) && id === step.player) push("HL-032", n, step, id);
      soloLeader = null;
    }
    if (soloLeader) {
      const second = Math.min(...[...total].filter(([id]) => id !== soloLeader).map(([, v]) => v));
      const margin = second - total.get(soloLeader)!;
      if (margin >= 3 && !fired.has(`HL-033:${soloLeader}:${step.round}`)) { fired.add(`HL-033:${soloLeader}:${step.round}`); push("HL-033", `${soloLeader}:${step.round}`, step, soloLeader, { Count: String(margin) }); }
    }
    const best = Math.min(...total.values());
    const close = [...total.values()].filter((v) => v > best && v - best <= 1).length;
    if (close >= 3 && !fired.has(`HL-034:${step.round}`)) { fired.add(`HL-034:${step.round}`); push("HL-034", `${step.round}`, step, null, { Count: String(close) }); }
    const from = startPlace.get(`${step.round}:${step.player}`);
    if (from !== undefined && from - placeOf(step.player) >= 5 && !fired.has(`HL-035:${step.player}:${step.round}`)) {
      fired.add(`HL-035:${step.player}:${step.round}`);
      push("HL-035", `${step.player}:${step.round}`, step, step.player, { Count: String(from - placeOf(step.player)) });
    }
    prevLeaders = now;
  }

  // The final round done: every player in it has all 18 holes attested.
  const finalRound = input.rounds.find((r) => r.roundNumber === input.finalRound);
  if (finalRound?.pars && total.size >= 2) {
    const scores = attestedScores(finalRound.scoring);
    const players = roundPlayers.get(input.finalRound) ?? [];
    const done = players.length > 0 && players.every((id) => scores.get(id)?.every((s) => s !== null));
    if (done) {
      const last = steps.filter((s) => s.round === input.finalRound).at(-1);
      const at = last?.at ?? "", end = { at, round: input.finalRound, hole: 18 };
      const top = leaders();
      if (top.length > 1) push("HL-038", "playoff", end, null, { Players: top.map(nameOf).join(" & ") });
      else push("HL-039", "champion", end, top[0]);
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}
