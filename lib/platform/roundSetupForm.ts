import { holeRange, type HolesChoice, type PersonalRoundSetup, type RoundGuest, type RoundPlayer, type ScoringCourse } from "./personalRound.ts";
import { gameDef, stakeUnit, type GameConfig, type GameId } from "./roundGames.ts";
import type { SideGames } from "./sideGames.ts";

/**
 * Play a round → round setup's rules, shared by the website (components/platform/PlayRound.tsx) and the Expo app
 * (mobile/), so both build the exact same round from the same choices (docs/architecture/app-first.md, rule 13).
 * Screens keep the typed text; this turns it into the PersonalRoundSetup the server starts.
 */

/** The setup's pages (owner layout 2026-11-21): round, players, game, review. */
export const SETUP_PAGES = ["round", "players", "game", "review"] as const;
export type SetupPage = typeof SETUP_PAGES[number];
export const PAGE_TITLES: Record<SetupPage, string> = { round: "Your round", players: "Who's playing?", game: "The game", review: "Ready to tee off?" };

/** The game picker's groups, as in the trip's New game sheet. */
export const GAME_GROUPS: { title: string; ids: GameId[] }[] = [
  { title: "Points games", ids: ["skins", "wolf", "daytona", "vegas", "sixes", "nines", "bbb", "stableford"] },
  { title: "Match & stroke play", ids: ["stroke", "match", "nassau", "bestball", "snake"] },
  { title: "Team formats (don't count toward handicap)", ids: ["scramble", "shamble", "alternate", "chapman"] },
];

/** A round has up to 5 players (host + friends + guests). */
export const MAX_ROUND_PLAYERS = 5;

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
/** A handicap typed in a box: −10 to 54, else none. */
export const handicapValue = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n >= -10 && n <= 54 ? n : null; };
export const holesChoiceLabel = (holes: HolesChoice) => holes === "18" ? "18 holes" : holes === "front" ? "Front 9" : "Back 9";
/** "2–5 players", "2 or 4 players", "5 players". */
export const playersLabel = (sizes: number[]) => sizes.length === 1 ? `${sizes[0]} players` : sizes.every((n, i) => i === 0 || n === sizes[i - 1] + 1) ? `${sizes[0]}–${sizes.at(-1)} players` : `${sizes.slice(0, -1).join(", ")} or ${sizes.at(-1)} players`;
/** "+$15", "−$5", "+$2.50". */
export const money = (n: number) => `${n < 0 ? "−" : "+"}$${Math.abs(n) % 1 ? Math.abs(n).toFixed(2) : Math.abs(n)}`;
/** A $ amount typed in a box: over 0 and up to $10,000, to the cent; else 0 (no stake). */
export const dollars = (text: string) => { const n = Number.parseFloat(text); return Number.isFinite(n) && n > 0 && n <= 10000 ? Math.round(n * 100) / 100 : 0; };
/** What a $ box keeps from typing: digits and the dot. */
export const stakeText = (text: string) => text.replace(/[^0-9.]/g, "");

/** Everything the setup pages collect, as typed. */
export interface RoundSetupForm {
  course: ScoringCourse | null;
  tee: number;
  holes: HolesChoice;
  stats: boolean;
  countForHandicap: boolean;
  datePlayed: string;
  players: RoundPlayer[];
  guests: RoundGuest[];
  myHandicap: string;
  gameId: GameId | "";
  net: boolean;
  allowance: number;
  birdiesDouble: boolean;
  eaglesTriple: boolean;
  carryovers: boolean;
  stake: string;
  nassau: [string, string, string];
  autoPress: boolean;
  doubles: boolean;
  greenies: { on: boolean; value: string };
  longest: { on: boolean; value: string; holes: number[] | null };
  closest: { on: boolean; value: string; holes: number[] | null };
  teams: number[];
  rating: string;
  slope: string;
}

/** A fresh setup (today's date): stats on, counts toward handicap, carryovers and doubles on. */
export function emptyRoundSetupForm(datePlayed: string): RoundSetupForm {
  return {
    course: null, tee: 0, holes: "18", stats: true, countForHandicap: true, datePlayed, players: [], guests: [], myHandicap: "",
    gameId: "", net: false, allowance: 100, birdiesDouble: false, eaglesTriple: false, carryovers: true, stake: "", nassau: ["", "", ""],
    autoPress: false, doubles: true, greenies: { on: false, value: "" }, longest: { on: false, value: "", holes: null },
    closest: { on: false, value: "", holes: null }, teams: [], rating: "", slope: "",
  };
}

/** What the setup pages show and send, worked out from the form. */
export function buildRoundSetup(form: RoundSetupForm) {
  const { course, holes, players, guests } = form;
  // A built scorecard has no tees on file: an optional rating / slope from the course's own card lets the round count.
  const ratingValue = Number.parseFloat(form.rating), slopeValue = Number.parseInt(form.slope, 10);
  const customTee = ratingValue >= 20 && ratingValue <= 90 && slopeValue >= 55 && slopeValue <= 155 ? { name: "From the scorecard", rating: ratingValue, slope: slopeValue } : null;
  const chosenTee = course?.custom ? customTee : course?.tees[form.tee] ?? null;
  const rated = chosenTee?.rating != null && chosenTee.slope != null;
  const size = players.length + guests.length + 1;
  const def = form.gameId ? gameDef(form.gameId) : null;
  const fits = !def || def.players.includes(size);
  const teamOf = (i: number) => form.teams[i] ?? (i < size / 2 ? 0 : 1);
  const teamFormat = def?.teamFormat ?? false;
  const names = ["You", ...players.map((p) => p.name), ...guests.map((g) => g.name)];
  const handicapNote = !form.countForHandicap ? "Practice round: saved, not counted" : teamFormat ? "Team formats can't count toward a handicap"
    : !rated ? course?.custom ? "Add the course rating and slope for it to count" : "This tee has no rating, so it won't count" : holes !== "18" ? "9-hole rounds are saved but don't count yet" : "Counts once you submit";
  const nassauStakes = form.nassau.map(dollars) as [number, number, number];
  const game: GameConfig | null = def ? {
    id: def.id, net: form.net && !def.teamFormat, birdiesDouble: def.points && form.birdiesDouble,
    ...(def.points && form.eaglesTriple ? { eaglesTriple: true } : {}),
    ...(form.net && !def.teamFormat && form.allowance !== 100 ? { allowance: form.allowance } : {}),
    ...(def.id === "skins" && !form.carryovers ? { carryovers: false } : {}),
    ...(def.id === "nassau" ? (nassauStakes.some(Boolean) ? { nassauStakes } : {}) : dollars(form.stake) ? { stake: dollars(form.stake) } : {}),
    ...(def.id === "nassau" && form.autoPress ? { autoPress: true } : {}),
    ...(def.points && form.doubles ? { doubles: true } : {}),
    ...(def.teams ? { teams: names.map((_, i) => teamOf(i)) } : {}),
  } : null;
  const holesOfPar = (pars: number[]) => course ? course.par.flatMap((p, i) => pars.includes(p) && i >= holeRange(holes)[0] && i < holeRange(holes)[1] ? [i + 1] : []) : [];
  const longestHoles = form.longest.holes ?? holesOfPar([5]);
  const closestHoles = form.closest.holes ?? holesOfPar([3]);
  const sideGames: SideGames = {
    ...(form.greenies.on ? { greenies: { value: dollars(form.greenies.value) } } : {}),
    ...(form.longest.on && longestHoles.length ? { longestDrive: { value: dollars(form.longest.value), holes: longestHoles } } : {}),
    ...(form.closest.on && closestHoles.length ? { closestPin: { value: dollars(form.closest.value), holes: closestHoles } } : {}),
  };
  const setup: PersonalRoundSetup | null = course ? { course, tee: chosenTee, holes, stats: form.stats, countForHandicap: form.countForHandicap && !teamFormat, datePlayed: form.datePlayed, players,
    myHandicap: handicapValue(form.myHandicap), game, ...(guests.length ? { guests } : {}), ...(form.stats ? { playerStats: true } : {}),
    ...(Object.keys(sideGames).length ? { sideGames } : {}) } : null;
  const canNext = (page: SetupPage) => page === "round" ? Boolean(course) : page === "game" ? fits : true;
  return { setup, game, def, size, fits, names, teamOf, teamFormat, chosenTee, rated, handicapNote, longestHoles, closestHoles, canNext };
}

/** The Review page's lines ("Course", "Round", "Players", "Game", "Side games"), worded as on the website. */
export function reviewLines(form: RoundSetupForm, built: ReturnType<typeof buildRoundSetup>): { label: string; value: string }[] {
  const { setup, def, game, chosenTee, names } = built;
  if (!setup) return [];
  const lines = [
    { label: "Course", value: `${setup.course.name}${chosenTee ? ` · ${chosenTee.name}` : ""}` },
    { label: "Round", value: [holesChoiceLabel(form.holes), new Date(`${form.datePlayed}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }), form.stats ? "Stats on" : null, setup.countForHandicap ? "Counts" : "Practice"].filter(Boolean).join(" · ") },
    { label: "Players", value: names.join(", ") },
    { label: "Game", value: def ? [def.name, game?.stake ? `${money(game.stake).slice(1)} per ${stakeUnit(def.id)}` : null, game?.nassauStakes ? `$${game.nassauStakes.join(" / $")}` : null,
      game?.autoPress ? "presses" : null, game?.birdiesDouble ? "birdies ×2" : null, game?.eaglesTriple ? "eagles ×3" : null, game?.carryovers === false ? "no carryovers" : null, game?.doubles ? "doubles" : null,
      game?.net ? `net ${form.allowance}%` : null].filter(Boolean).join(" · ") : "Just keeping score" },
  ];
  const side = setup.sideGames;
  if (side) lines.push({ label: "Side games", value: [
    side.greenies ? `Greenies${side.greenies.value ? ` $${side.greenies.value}` : ""}` : null,
    side.longestDrive ? `Longest drive${side.longestDrive.value ? ` $${side.longestDrive.value}` : ""} (${side.longestDrive.holes.join(", ")})` : null,
    side.closestPin ? `Closest to the pin${side.closestPin.value ? ` $${side.closestPin.value}` : ""} (${side.closestPin.holes.join(", ")})` : null,
  ].filter(Boolean).join(" · ") });
  return lines;
}

/** What starting the round says when the server says no (website SetupStep.start). "signed_out" = show the sign-in link. */
export function startErrorMessage(code: string | undefined, message: string | undefined): string {
  if (code === "signed_out") return "signed_out";
  return message ?? (code === "offline" ? "No connection. Check your internet and try again." : "Couldn't start the round. Try again.");
}

/** Round settings → Change game (host, mid-round): the new game keeps net and birdies-double where the new game allows them. */
export function changedGame(setup: PersonalRoundSetup, gameId: GameId | ""): PersonalRoundSetup {
  const next = gameId ? gameDef(gameId) : null;
  return { ...setup, game: next ? { id: next.id, net: !next.teamFormat && (setup.game?.net ?? false), birdiesDouble: next.points && (setup.game?.birdiesDouble ?? false) } : null };
}
