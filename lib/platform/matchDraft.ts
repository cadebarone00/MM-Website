import { defaultRoundComp, playersPerSide, roundMatches, ROUND_FORMATS, type RoundCompSettings } from "./roundCompetition";
import { draftWhenLabel } from "./teamDraft";

export type MatchDraftPlayer = { id?: string; name: string; team: "A" | "B"; handicap?: number };
export type MatchDraftRound = { key: string; number: number; course: string; format: string; matches: number; type: string; when: string; date?: string; time?: string; perSide?: number; locked?: boolean; rankMinutes?: number; putForwardMinutes?: number; responseMinutes?: number };
export type MatchDraftPlacement = { player: string; match: number; team: "A" | "B"; slot: number };
export const matchDraftPlayerId = (player: MatchDraftPlayer) => player.id ?? player.team + ":" + player.name;
export const matchDraftSideSize = (round: MatchDraftRound) => round.perSide ?? ROUND_FORMATS.find(item => item.name === round.format)?.perSide ?? 1;

/** Room-local placement: a player appears once per round, on their roster's side, within capacity. */
export function placeMatchDraftPlayer(round: MatchDraftRound, players: MatchDraftPlayer[], placements: MatchDraftPlacement[], player: string, match: number, team: "A" | "B", slot: number): MatchDraftPlacement[] {
  if (round.locked || !players.some(item => matchDraftPlayerId(item) === player && item.team === team) || !Number.isInteger(match) || match < 0 || match >= round.matches || !Number.isInteger(slot) || slot < 0 || slot >= matchDraftSideSize(round)) return placements;
  return [...placements.filter(item => item.player !== player && !(item.match === match && item.team === team && item.slot === slot)), { player, match, team, slot }];
}

type Choice = { method?: string; draftType?: string; date?: string; time?: string; rankMinutes?: number; putForwardMinutes?: number; responseMinutes?: number };
type SourceRound = { number: number; date: string; course: string; format?: string };
/** Same day-slot keys and global/per-round selection precedence as organizer Match Selection. */
export function matchDraftRounds(setup: Record<string, unknown>, rounds: SourceRound[], playerCount: number, playedThrough = 0): MatchDraftRound[] {
  const counts = setup.roundsPerDay as Record<string, number> | undefined;
  const choices = setup.matchSelections as Record<string, Choice> | undefined;
  const formats = setup.compFormats as Record<string, RoundCompSettings> | undefined;
  const enabled = setup.compRounds as Record<string, boolean> | undefined;
  const days = [...new Set(rounds.map(round => round.date))];
  return rounds.flatMap((round, index) => {
    let day = 0, slot = index;
    if (counts) { while (day < 64 && slot >= (counts[day] ?? 1)) { slot -= counts[day] ?? 1; day++; } }
    else { day = days.indexOf(round.date); slot = rounds.slice(0,index).filter(item => item.date === round.date).length; }
    const key = day + "-" + slot;
    const own = choices?.[key];
    const choice = setup.matchPerRound ? own : setup.allRoundsMatch as Choice | undefined;
    if (choice?.method !== "Match Draft" || enabled?.[key] === false || !round.course || round.course === "Course TBD") return [];
    const format = round.format === "Best Ball" ? "Fourball" : round.format;
    const settings = formats?.[key] ?? { ...defaultRoundComp(playerCount), format: ROUND_FORMATS.find(item => item.name === format)?.name ?? "Singles" };
    const date = own?.date || choice.date || "", time = own?.time || choice.time || "";
    return [{ key, number: round.number, course: round.course, format: settings.format, matches: roundMatches(settings), perSide: playersPerSide(settings.format), type: choice.draftType ?? "Not selected", rankMinutes: choice.rankMinutes, putForwardMinutes: choice.putForwardMinutes, responseMinutes: choice.responseMinutes, date, time, when: date ? draftWhenLabel(date,time) : "Draft date not set yet", locked: round.number <= playedThrough }];
  });
}

export function responseDraftTurn(round: MatchDraftRound, placements: MatchDraftPlacement[], alternate = true): { match: number; team: "A" | "B"; slot: number } | null {
  for (let match = 0; match < round.matches; match++) {
    const teams: ("A" | "B")[] = alternate && match % 2 ? ["B", "A"] : ["A", "B"];
    for (const team of teams) for (let slot = 0; slot < matchDraftSideSize(round); slot++) {
      if (!placements.some(item => item.match === match && item.team === team && item.slot === slot)) return { match, team, slot };
    }
  }
  return null;
}

/** Generate complete groups from explicit per-team ranks or an independent Fisher-Yates shuffle. */
export function generateMatchDraft(round: MatchDraftRound, players: MatchDraftPlayer[], method: "Ranks" | "Randomized", ranks: string[], random: () => number = Math.random): MatchDraftPlacement[] {
  if (round.locked) throw new Error("This round has already started.");
  if (!round.matches) throw new Error("This round has no match-play groups.");
  const capacity = round.matches * matchDraftSideSize(round);
  const result: MatchDraftPlacement[] = [];
  for (const team of ["A", "B"] as const) {
    const ids = [...new Set(players.filter(player => player.team === team).map(matchDraftPlayerId))];
    if (ids.length < capacity) throw new Error("Team " + team + " needs " + capacity + " players to fill this round.");
    if (method === "Ranks") {
      if (ids.some(id => !ranks.includes(id))) throw new Error("Set ranks for every player first.");
      ids.sort((a,b) => ranks.indexOf(a) - ranks.indexOf(b));
    } else for (let index = ids.length - 1; index > 0; index--) {
      const value = random();
      if (value < 0 || value >= 1 || !Number.isFinite(value)) throw new Error("Invalid shuffle value.");
      const other = Math.floor(value * (index + 1));
      [ids[index], ids[other]] = [ids[other], ids[index]];
    }
    ids.slice(0,capacity).forEach((player,index) => result.push({ player, team, match: Math.floor(index / matchDraftSideSize(round)), slot: index % matchDraftSideSize(round) }));
  }
  return result;
}
