import type { TemplateValues } from "../template.ts";
import type { MatchOutcome } from "./matchMoments.ts";
import type { DetectedMoment } from "./scoreMoments.ts";

/**
 * Team-competition highlights (owner request 2026-11-27, "Team competition" tab). Pure: the trip's two teams + every
 * match-play round's match outcomes (matchMoments.matchOutcomes) in → moments out, recomputed from the whole trip.
 *
 * Standings: each match is worth its round's points (`pointsPerMatch`); a halved match splits them. Claude's calls
 * (2026-11-27): Nassau rounds count the overall match only; a "session" is one round; the title is clinched once a team
 * has MORE than half of all the points on offer (every match of every match-play round).
 * Events happen in the order matches finished:
 *   HL-022 a team takes / retakes the overall lead · HL-023 the teams become tied ({Player} won the match that tied it)
 *   · HL-024 3 match wins in a row · HL-025 comeback from 3+ points down (back to tied) · HL-026 match point (one match
 *   win from the title, first time) · HL-027 title clinched · HL-028 one match left and it decides the title
 *   · HL-029 a team wins every match of a round (2+ matches) · HL-030 a team leads every match of a round after 9.
 */

export interface TeamSide { name: string; ids: string[] }
export interface TeamRound { roundNumber: number; roundId: string; pointsPerMatch: number; outcomes: MatchOutcome[] }
export interface TeamDetectionInput { tripId: string; teams: [TeamSide, TeamSide]; rounds: TeamRound[]; names: Map<string, string> }

export function detectTeamMoments(input: TeamDetectionInput): DetectedMoment[] {
  const [t0, t1] = input.teams;
  const teamOf = (ids: string[]): 0 | 1 | null => (ids.some((id) => t0.ids.includes(id)) ? 0 : ids.some((id) => t1.ids.includes(id)) ? 1 : null);
  const nameOf = (id: string) => input.names.get(id) ?? "A golfer";
  const total = input.rounds.reduce((sum, r) => sum + r.outcomes.length * r.pointsPerMatch, 0);
  if (!total || !t0.ids.length || !t1.ids.length) return [];
  const toWin = total / 2; // more than this wins
  const out: DetectedMoment[] = [];
  const push = (ruleId: string, n: string, at: string, team: 0 | 1 | null, extra: TemplateValues = {}, roundNumber?: number) => {
    const side = team === null ? t0 : input.teams[team];
    const other = team === null ? t1 : input.teams[team === 0 ? 1 : 0];
    out.push({ key: `${input.tripId}:team:${ruleId}:${n}`, ruleId, tier: null, profileId: side.ids[0], playerName: side.name, hole: 0, at,
      values: { Team: side.name, "Team A": side.name, "Team B": other.name, Opponent: other.name, ...(roundNumber ? { Round: String(roundNumber) } : {}), ...extra } });
  };

  // Every finished match in the order it finished, with the team that won it (null = halved).
  type Done = { round: TeamRound; outcome: MatchOutcome; winner: 0 | 1 | null; aTeam: 0 | 1 };
  const finished: Done[] = input.rounds.flatMap((round) => round.outcomes.flatMap((outcome): Done[] => {
    const aTeam = teamOf(outcome.a);
    if (outcome.result === null || aTeam === null || !outcome.endedAt) return [];
    const winner = outcome.result === "halved" ? null : outcome.result === "a" ? aTeam : aTeam === 0 ? 1 : 0;
    return [{ round, outcome, winner, aTeam }];
  })).sort((x, y) => x.outcome.endedAt!.localeCompare(y.outcome.endedAt!));
  const allMatches = input.rounds.reduce((n, r) => n + r.outcomes.length, 0);

  const points: [number, number] = [0, 0];
  let leader: 0 | 1 | null = null, run = 0, runTeam: 0 | 1 | null = null, champion: 0 | 1 | null = null;
  const worst: [number, number] = [0, 0];
  const fired = new Set<string>();
  finished.forEach((done, step) => {
    const at = done.outcome.endedAt!, n = `${done.round.roundNumber}-${done.outcome.index}`;
    const before: [number, number] = [points[0], points[1]];
    if (done.winner === null) { points[0] += done.round.pointsPerMatch / 2; points[1] += done.round.pointsPerMatch / 2; } else points[done.winner] += done.round.pointsPerMatch;
    const now: 0 | 1 | null = points[0] > points[1] ? 0 : points[1] > points[0] ? 1 : null;
    const winnerSide = done.winner === null ? null : done.winner === done.aTeam ? done.outcome.a : done.outcome.b;

    if (done.winner !== null && done.winner === runTeam) run++; else { run = done.winner === null ? 0 : 1; runTeam = done.winner; }
    if (run === 3 && runTeam !== null) push("HL-024", `${runTeam}:${n}`, at, runTeam, { Count: "3" });

    if (champion === null) {
      if (now === null && (before[0] !== before[1])) {
        const trailing: 0 | 1 = before[0] < before[1] ? 0 : 1;
        if (worst[trailing] >= 3 && !fired.has(`HL-025:${trailing}`)) { fired.add(`HL-025:${trailing}`); push("HL-025", `${trailing}`, at, trailing, { Count: String(worst[trailing]) }); }
        else if (winnerSide) push("HL-023", n, at, done.winner, { Player: winnerSide.map(nameOf).join(" & ") });
      }
      if (now !== null && now !== leader) push("HL-022", n, at, now);
      if (now !== null) { const behind = now === 0 ? 1 : 0; worst[behind] = Math.max(worst[behind], points[now] - points[behind]); }
      leader = now;

      const clinched = points[0] > toWin ? 0 : points[1] > toWin ? 1 : null;
      if (clinched !== null) { champion = clinched; push("HL-027", "title", at, clinched); }
      else {
        for (const team of [0, 1] as const) {
          const need = toWin - points[team];
          if (need > 0 && need < done.round.pointsPerMatch + 1e-9 && !fired.has(`HL-026:${team}`)) { fired.add(`HL-026:${team}`); push("HL-026", `${team}`, at, team); }
        }
        if (step === allMatches - 2 && !fired.has("HL-028")) { fired.add("HL-028"); push("HL-028", "last", at, null); }
      }
    }
  });

  for (const round of input.rounds) {
    // Sweep: every match of the round finished and won by the same team.
    const results = round.outcomes.map((o) => { const aTeam = teamOf(o.a); return o.result === null || o.result === "halved" || aTeam === null ? null : o.result === "a" ? aTeam : aTeam === 0 ? 1 : 0; });
    if (round.outcomes.length >= 2 && results.every((r) => r !== null && r === results[0])) {
      const last = round.outcomes.reduce((latest, o) => (o.endedAt! > latest ? o.endedAt! : latest), "");
      push("HL-029", `${round.roundNumber}`, last, results[0] as 0 | 1, {}, round.roundNumber);
    }
    // Front nine: every match of the round has played 9 and the same team is up in each.
    const ahead = round.outcomes.map((o) => { const aTeam = teamOf(o.a); return o.upAfter9 === null || o.upAfter9 === 0 || aTeam === null ? null : o.upAfter9 > 0 ? aTeam : aTeam === 0 ? 1 : 0; });
    if (round.outcomes.length >= 2 && ahead.every((t) => t !== null && t === ahead[0])) {
      const last = round.outcomes.reduce((latest, o) => (o.at9! > latest ? o.at9! : latest), "");
      push("HL-030", `${round.roundNumber}`, last, ahead[0] as 0 | 1, {}, round.roundNumber);
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key));
}
