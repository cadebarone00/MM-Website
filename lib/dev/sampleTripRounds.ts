import type { PlayerRound } from "@/lib/platform/playerRounds";
import { tripStats } from "@/lib/platform/tripStats";

/**
 * DEV ONLY: a made-up trip's saved rounds for previewing Golf → Stats (simulator condition "Sample trip stats"): every
 * player plays three courses of different difficulty, with putts, fairways and greens on every hole. Seeded, so it looks
 * the same every time.
 */
const COURSES: { name: string; par: number[]; tough: number[] }[] = [
  { name: "Mission Hills CC", par: [4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5], tough: [0, 0, .2, .3, 0, .1, .4, -.2, 0, .1, .5, .2, -.3, 0, .1, .3, .6, -.1] },
  { name: "PGA West Stadium", par: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 5, 4, 3, 4, 4, 5, 3, 4], tough: [.3, .1, .4, .3, .2, .5, .3, 0, .4, .2, .1, .3, .4, .2, .3, 0, .7, .6] },
  { name: "Indian Wells Celebrity", par: [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4], tough: [-.1, 0, .1, -.3, 0, -.1, .2, -.2, 0, 0, .1, -.1, -.4, 0, .2, 0, -.3, .1] },
];
const SHOTS = ["center", "center", "left", "right", "center", "up", "down"] as const;

function random(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function sampleTripRounds(players: { id: string; name: string; hcp: number }[], seed = 21): PlayerRound[] {
  const next = random(seed);
  return players.flatMap((player, p) => COURSES.map((course, c): PlayerRound => {
    const skill = (player.hcp || 6 + p * 2) / 18;
    const holes = course.par.map((par, i) => {
      const roll = next() * 0.85 + skill * 0.3 + course.tough[i] * 0.2 - 0.12;
      const strokes = Math.max(2, par + (roll < 0.14 ? -1 : roll < 0.52 ? 0 : roll < 0.84 ? 1 : roll < 0.96 ? 2 : 3));
      const green = strokes <= par ? (next() < 0.75 ? "center" : SHOTS[2 + Math.floor(next() * 5)]) : SHOTS[Math.floor(next() * SHOTS.length)];
      return { number: i + 1, par, strokes, putts: strokes < par ? 1 : next() < 0.1 + skill * 0.1 ? 3 : next() < 0.15 ? 1 : 2,
        fairway: par === 3 ? null : SHOTS[Math.floor(next() * SHOTS.length)], green };
    });
    return { id: `sample-trip:${player.id}:${c}`, profileId: player.id, source: "trip", tripId: "sample-trip", tripRoundId: `round-${c + 1}`,
      datePlayed: `2027-01-0${c + 7}`, course: { ref: null, name: course.name, place: "Palm Springs, CA" }, tee: null, holesPlayed: 18,
      format: "Fourball", holes, total: holes.reduce((a, h) => a + h.strokes, 0) } as unknown as PlayerRound;
  }));
}

/** The Stats tab's view for the sample trip: the per-player table plus the rounds for Course / Individual. */
export function sampleTripStatsView(players: { id: string; name: string; hcp: number }[]) {
  const rounds = sampleTripRounds(players);
  const stats = tripStats(rounds, "sample-trip");
  const name = (id: string) => players.find((p) => p.id === id)?.name ?? id;
  return { players: stats.players.map((p) => ({ ...p, name: name(p.profileId) })), trip: stats.trip, rounds };
}
