import { wolfFor, type HoleInput } from "@/lib/platform/roundGames";
import type { TripGame } from "@/lib/platform/tripGames";

/**
 * DEV ONLY: games partway through the round, for previewing Golf → Games mid-game (simulator condition "Sample games,
 * mid-round"): Wolf with partners picked on the holes played, Skins, a 2 v 2 net Match Play, Snake with a few 3-putts,
 * and one game still waiting on its pre-round options. Built for my group on the round being shown.
 */
export function sampleTripGames(round: number, holes: number, group: string[]): TripGame[] {
  const four = group.slice(0, 4);
  if (four.length < 4) return [];
  const wolf: HoleInput[] = Array.from({ length: holes }, (_, h) => {
    if (h >= 9) return {};
    const w = wolfFor(h, [0, holes], 4);
    return { wolfPartner: h % 3 === 1 ? null : (w + 1 + (h % 2)) % 4 };
  });
  const snake: HoleInput[] = Array.from({ length: holes }, (_, h) => h === 2 ? { snake: 1 } : h === 6 ? { snake: 3 } : {});
  return [
    { key: "sample-wolf", round, players: four, started: true, inputs: wolf, config: { id: "wolf", net: false, birdiesDouble: true } },
    { key: "sample-skins", round, players: four, started: true, inputs: [], config: { id: "skins", net: true, birdiesDouble: false } },
    { key: "sample-match", round, players: four, started: true, inputs: [], config: { id: "match", net: true, birdiesDouble: false, teams: [0, 1, 0, 1] } },
    { key: "sample-snake", round, players: four, started: true, inputs: snake, config: { id: "snake", net: false, birdiesDouble: false } },
    { key: "sample-vegas", round, players: four, started: false, inputs: [], config: { id: "vegas", net: false, birdiesDouble: false, teams: [0, 0, 1, 1] } },
  ];
}
