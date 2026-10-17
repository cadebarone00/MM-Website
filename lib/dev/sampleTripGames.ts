import { GAMES, wolfFor, type GameConfig, type HoleInput } from "@/lib/platform/roundGames";
import type { TripGame } from "@/lib/platform/tripGames";

/**
 * DEV ONLY: every game partway through the round, for previewing Golf → Games mid-game (simulator condition "Sample
 * games, mid-round"). Built for my group on the round being shown: 4-player
 * games use my group; Nines (3 players) the first three; Daytona (5 players) adds one more player from the field, since a
 * group is four. Picks are filled in for the holes played (Wolf partners, Daytona spots, Bingo Bango Bongo, Snake).
 */
export function sampleTripGames(round: number, holes: number, group: string[], field: string[] = []): TripGame[] {
  const four = group.slice(0, 4);
  if (four.length < 4) return [];
  const fifth = field.find((name) => !four.includes(name));
  const played = (fill: (h: number) => HoleInput) => Array.from({ length: holes }, (_, h) => h < 9 ? fill(h) : {});
  const inputsFor: Partial<Record<GameConfig["id"], (n: number) => HoleInput[]>> = {
    wolf: (n) => played((h) => { const w = wolfFor(h, [0, holes], n); return { wolfPartner: h % 3 === 1 ? null : (w + 1 + (h % 2)) % n }; }),
    daytona: () => played((h) => { const middle = h % 5, rest = [0, 1, 2, 3, 4].filter((i) => i !== middle); return { daytona: { middle, left: [rest[0], rest[1]], right: [rest[2], rest[3]] } }; }),
    bbb: (n) => played((h) => ({ bbb: { bingo: h % n, bango: (h + 1) % n, bongo: (h + 2) % n } })),
    snake: () => played((h) => h === 2 ? { snake: 1 } : h === 6 ? { snake: 3 } : {}),
    vegas: () => played((h) => h % 3 === 0 ? { teams: [[0, 0, 1, 1], [0, 1, 0, 1], [0, 1, 1, 0]][h / 3 % 3] } : {}),
  };
  const games = GAMES.flatMap((def): TripGame[] => {
    const players = def.players.includes(4) ? four : def.players.includes(3) ? four.slice(0, 3) : def.players.includes(5) && fifth ? [...four, fifth] : [];
    if (!players.length) return [];
    const config: GameConfig = { id: def.id, net: def.id === "skins" || def.id === "match" || def.id === "nassau", birdiesDouble: def.id === "wolf",
      ...(def.teams ? { teams: players.map((_, i) => i % 2) } : {}) };
    return [{ key: `sample-${def.id}`, round, players, started: true, inputs: inputsFor[def.id]?.(players.length) ?? [], config }];
  });
  return games;
}
