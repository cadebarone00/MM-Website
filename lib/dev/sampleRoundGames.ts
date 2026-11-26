import { gameDef, GAMES, wolfFor, type GameConfig, type GameId, type HoleInput } from "../platform/roundGames.ts";
import type { PersonalRoundSetup } from "../platform/personalRound.ts";
import type { SideGames } from "../platform/sideGames.ts";
import type { SharedRound } from "../platform/sharedRoundsServer.ts";

/**
 * DEV ONLY: a made-up round with friends for every Play-a-round game, part way through or finished (project_specs.md
 * "Simulator: every Play-a-round game mid round"). The same choices always build the same round. Cam keeps score;
 * Cade and Jake joined with the app; Luke and Rob are guests.
 */

export const ROUND_MOMENTS = [[3, "Early (thru 3)"], [9, "Halfway (thru 9)"], [15, "Late (thru 15)"], [17, "One hole left (thru 17)"], [18, "Round complete"]] as const;
export type RoundMoment = (typeof ROUND_MOMENTS)[number][0];

export interface RoundSampleOptions {
  game: GameId;
  players: number;
  thru: RoundMoment;
  net: boolean;
  birdies: "off" | "birdies" | "eagles";
  money: boolean;
  doubled: boolean;
  carryovers: boolean;
  autoPress: boolean;
  sideGames: boolean;
  viewer: "host" | "player";
}
export const ROUND_SAMPLE_DEFAULTS: Omit<RoundSampleOptions, "game" | "players"> = {
  thru: 9, net: false, birdies: "off", money: false, doubled: false, carryovers: true, autoPress: false, sideGames: false, viewer: "host",
};

/** Which option choices a game offers (the rest are hidden in the simulator and ignored here). */
export function roundSampleOptionsFor(id: GameId) {
  const def = gameDef(id);
  return { net: !def.teamFormat, birdies: def.points, doubles: def.points || id === "skins", carryovers: id === "skins", autoPress: id === "nassau" };
}

const PAR = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
const SI = [7, 13, 17, 1, 9, 3, 15, 11, 5, 8, 14, 18, 2, 10, 4, 16, 12, 6];
// Each person's strokes over par, hole by hole: a believable card with birdies, bogeys and ties (so skins carry over),
// Cam 2 down to Cade after 6 (so a Nassau presses) and the odd eagle (Cam on 4, Jake on 13).
const OVER = [
  [0, 0, 0, -2, 1, 1, 0, 0, 1, 0, -1, 0, 1, 0, 0, 1, 0, 0],
  [0, 0, -1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 0, 0, -1, 1],
  [0, 1, 0, 0, 1, 1, 0, -1, 0, 1, 1, 0, -2, 0, 1, 0, 0, 0],
  [1, 0, 1, 1, 0, 0, 1, 0, 2, 1, 0, 1, 0, 0, 2, 1, 1, 0],
  [2, 1, 0, 1, 1, 0, 2, 1, 1, 0, 1, 2, 1, 1, 0, 1, 2, 1],
];
const PEOPLE = [
  { key: "dev-cam", name: "Cam Latto", handicap: 6.2, guest: false },
  { key: "dev-cade", name: "Cade Turner", handicap: 11.4, guest: false },
  { key: "dev-jake", name: "Jake Morris", handicap: 3.8, guest: false },
  { key: "g-luke", name: "Luke", handicap: 15.0, guest: true },
  { key: "g-rob", name: "Uncle Rob", handicap: 20.0, guest: true },
];
const HOST = PEOPLE[0].key;

/** The group size a game starts on: a foursome when the game allows it, else its first size. */
export const defaultSamplePlayers = (id: GameId) => { const sizes = gameDef(id).players; return sizes.includes(4) ? 4 : sizes[0]; };
/** The group size a game shows: the asked-for size when the game allows it, else its default. */
export const samplePlayersFor = (id: GameId, asked: number | undefined) => asked && gameDef(id).players.includes(asked) ? asked : defaultSamplePlayers(id);

/** The extra pick each played hole needs (Wolf partner, Daytona spots, Bingo Bango Bongo, Snake), varied hole to hole. */
function holePick(id: GameId, h: number, n: number): HoleInput {
  if (id === "wolf") { const wolf = wolfFor(h, [0, 18], n); return { wolfPartner: h % 4 === 2 ? null : (wolf + 1 + (h % (n - 1))) % n }; }
  if (id === "daytona") { const middle = h % 5, rest = [0, 1, 2, 3, 4].filter((i) => i !== middle); return { daytona: { middle, left: [rest[0], rest[1]], right: [rest[2], rest[3]] } }; }
  if (id === "bbb") return { bbb: { bingo: h % n, bango: (h + 1) % n, bongo: (h + 2) % n } };
  if (id === "snake") return h === 2 ? { snake: 1 } : h === 7 ? { snake: n - 1 } : h === 13 ? { snake: 0 } : {};
  return {};
}

const SIDE_GAMES: SideGames = { greenies: { value: 2 }, longestDrive: { value: 5, holes: [4, 13] }, closestPin: { value: 5, holes: [7] } };
/** Side-game winners on played holes: greenies on the par 3s (the second one carries over), longest drive, closest to the pin. */
function sidePick(h: number, n: number): HoleInput {
  const pick: HoleInput = {};
  if (PAR[h] === 3) pick.greenie = h === 6 ? null : (h + 1) % n;
  if (h === 3 || h === 12) pick.longestDrive = h % n;
  if (h === 6) pick.closestPin = 2 % n;
  return pick;
}

export interface SampleRound { round: SharedRound; me: string; inviteCode: string }

export function sampleSharedRound(o: RoundSampleOptions): SampleRound {
  const def = gameDef(o.game), offers = roundSampleOptionsFor(o.game);
  const n = samplePlayersFor(o.game, o.players);
  const people = PEOPLE.slice(0, n);
  const game: GameConfig = {
    id: o.game, net: offers.net && o.net,
    birdiesDouble: offers.birdies && o.birdies !== "off", eaglesTriple: offers.birdies && o.birdies === "eagles",
    ...(def.teams ? { teams: people.map((_, i) => i % 2) } : {}),
    ...(o.money ? (o.game === "nassau" ? { nassauStakes: [10, 10, 20] as [number, number, number] } : { stake: o.game === "skins" ? 5 : 2 }) : {}),
    ...(offers.carryovers ? { carryovers: o.carryovers } : {}),
    ...(offers.autoPress && o.autoPress ? { autoPress: true } : {}),
    ...(offers.doubles && o.doubled ? { doubles: true } : {}),
  };
  const accounts = people.filter((p) => !p.guest), guests = people.filter((p) => p.guest);
  const setup: PersonalRoundSetup = {
    course: { ref: "dev-eagle-pointe", name: "Eagle Pointe Golf Club", place: "Tracy, CA", par: PAR, strokeIndex: SI, tees: [{ name: "Blue", rating: 70.4, slope: 124 }] },
    tee: { name: "Blue", rating: 70.4, slope: 124 }, holes: "18", stats: false, countForHandicap: !def.teamFormat, datePlayed: "2026-11-24",
    players: accounts.slice(1).map((p) => ({ name: p.name, profileId: p.key, handicap: p.handicap })), myHandicap: PEOPLE[0].handicap,
    game, guests: guests.map((p) => ({ id: p.key, name: p.name, handicap: p.handicap })),
    ...(o.sideGames ? { sideGames: SIDE_GAMES } : {}),
  };
  const played = Array.from({ length: o.thru }, (_, h) => h);
  const strokes = (p: number, h: number) => PAR[h] + OVER[p][h];
  const picks = played.map((h) => {
    const pick: HoleInput = { ...holePick(o.game, h, n), ...(o.sideGames ? sidePick(h, n) : {}), ...(game.doubles && h === 4 ? { doubled: true } : {}) };
    return { hole: h + 1, pick };
  }).filter((p) => Object.keys(p.pick).length > 0);
  const round: SharedRound = {
    id: `dev-sample-${o.game}`, host: HOST, status: o.thru === 18 && o.viewer === "player" ? "ended" : "live", setup, startedAt: "2026-11-24T08:10:00.000Z",
    players: accounts.map((p, i) => ({ profileId: p.key, name: p.name, position: i, status: "joined" as const })),
    holes: accounts.flatMap((p) => played.map((h) => ({ profileId: p.key, hole: h + 1, strokes: strokes(people.indexOf(p), h) }))),
    guestHoles: guests.flatMap((p) => played.map((h) => ({ guestId: p.key, hole: h + 1, strokes: strokes(people.indexOf(p), h) }))),
    picks,
  };
  return { round, me: o.viewer === "player" ? PEOPLE[1].key : HOST, inviteCode: "K7Q4MZ" };
}

/** Every game with every size it allows, for tests and the simulator's page list. */
export const SAMPLE_GAME_SIZES = GAMES.flatMap((g) => g.players.map((players) => ({ game: g.id, players })));
