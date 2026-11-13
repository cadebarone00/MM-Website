import { GAMES, type GameConfig, type HoleInput } from "./roundGames.ts";
import type { League, LeagueChange, LeagueCourse, PairFormat, PairRule } from "./leagues.ts";

/**
 * Checks what the app sends for leagues before it goes to the database (which checks again). Anything that doesn't
 * match comes back null, and the route answers "bad request".
 */

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const num = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const whole = (n: unknown, min: number, max: number): n is number => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
const isId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
const bool = (value: unknown): value is boolean => typeof value === "boolean";

export function handicapFrom(value: unknown): number | null {
  const n = num(value);
  return n !== null && n >= -10 && n <= 54 ? Math.round(n * 10) / 10 : null;
}
export const dateFrom = (value: unknown): string | null => isDate(value) ? value : null;

/** The league's course, as picked on Create (course search → 18-hole scorecard and a tee). */
export function courseFrom(value: unknown): LeagueCourse | null {
  const course = value as Record<string, unknown> | null;
  if (!course || typeof course !== "object" || typeof course.name !== "string" || !Array.isArray(course.par)) return null;
  const par = course.par.slice(0, 18);
  if (par.length !== 18 || !par.every((p) => whole(p, 3, 6))) return null;
  const strokeIndex = Array.isArray(course.strokeIndex) && course.strokeIndex.length >= 18 && course.strokeIndex.slice(0, 18).every((s) => whole(s, 1, 18)) ? course.strokeIndex.slice(0, 18) as number[] : null;
  const tee = course.tee as Record<string, unknown> | null | undefined;
  return {
    ref: typeof course.ref === "string" ? course.ref.slice(0, 120) : undefined,
    name: course.name.slice(0, 120), place: typeof course.place === "string" ? course.place.slice(0, 120) : null, par: par as number[], strokeIndex,
    tee: tee && typeof tee.name === "string" ? { name: tee.name.slice(0, 40), rating: num(tee.rating), slope: num(tee.slope) } : null,
  };
}

const FORMATS: PairFormat[] = ["bestball", "combined", "stableford-bestball", "stableford-combined"];
const RULES: PairRule[] = ["random", "balanced", "split-groups", "keep-groups"];
const GAME_IDS = new Set<string>(GAMES.map((g) => g.id));

function gameFrom(value: unknown): GameConfig | null | undefined {
  if (value === null) return null;
  const g = value as Record<string, unknown> | undefined;
  if (!g || typeof g.id !== "string" || !GAME_IDS.has(g.id) || !bool(g.net) || !bool(g.birdiesDouble)) return undefined;
  if (g.teams !== undefined && !(Array.isArray(g.teams) && g.teams.length <= 5 && g.teams.every((t) => t === 0 || t === 1))) return undefined;
  return { id: g.id as GameConfig["id"], net: g.net, birdiesDouble: g.birdiesDouble, ...(g.teams ? { teams: g.teams as number[] } : {}) };
}
/** Per-hole picks: up to 18 small objects (Wolf partner, Daytona spots, Bingo Bango Bongo, Snake). */
function inputsFrom(value: unknown): HoleInput[] | null {
  if (!Array.isArray(value) || value.length > 18 || !value.every((v) => v && typeof v === "object" && !Array.isArray(v)) || JSON.stringify(value).length > 4000) return null;
  return value as HoleInput[];
}

/** One change from the league page (POST /api/leagues/<id>), checked; null = not valid. */
export function changeFrom(value: unknown): LeagueChange | null {
  const body = value as Record<string, unknown> | null;
  switch (body?.action) {
    case "settings": {
      const skins = body.skins as Record<string, unknown> | undefined, pairs = body.pairs as Record<string, unknown> | undefined;
      if ((body.scoring !== "Gross" && body.scoring !== "Net") || !skins || !pairs || !bool(skins.on) || !bool(skins.net) || !bool(skins.carryover)) return null;
      if (!bool(pairs.on) || !bool(pairs.net) || !bool(pairs.locked) || !FORMATS.includes(pairs.format as PairFormat) || !RULES.includes(pairs.rule as PairRule)
        || ![6, 9, 18].includes(pairs.segments as number) || !Array.isArray(pairs.teams) || pairs.teams.length > 120
        || !pairs.teams.every((t) => Array.isArray(t) && t.length >= 1 && t.length <= 3 && t.every(isId))) return null;
      return { action: "settings", scoring: body.scoring, skins: { on: skins.on, net: skins.net, carryover: skins.carryover },
        pairs: { on: pairs.on, format: pairs.format as PairFormat, net: pairs.net, segments: pairs.segments as League["pairs"]["segments"], rule: pairs.rule as PairRule, locked: pairs.locked, teams: pairs.teams as string[][] } };
    }
    case "groups": {
      if (!Array.isArray(body.groups) || body.groups.length > 60) return null;
      const groups = [];
      for (const g of body.groups as Record<string, unknown>[]) {
        if (typeof g?.time !== "string" || !/^(([01]\d|2[0-3]):[0-5]\d)?$/.test(g.time) || !whole(g.hole, 1, 18) || !isId(g.scorer)) return null;
        if (!Array.isArray(g.players) || g.players.length < 1 || g.players.length > 5 || !g.players.every(isId)) return null;
        groups.push({ time: g.time, hole: g.hole, scorer: g.scorer, players: g.players as string[] });
      }
      return { action: "groups", groups };
    }
    case "strokes":
      if (!isId(body.player) || !whole(body.hole, 1, 18) || !(body.strokes === null || whole(body.strokes, 1, 20))) return null;
      return { action: "strokes", player: body.player, hole: body.hole, strokes: body.strokes as number | null };
    case "game": {
      const game = gameFrom(body.game), inputs = inputsFrom(body.inputs ?? []);
      if (!whole(body.group, 1, 60) || game === undefined || !inputs) return null;
      return { action: "game", group: body.group, game, inputs };
    }
    case "submit":
      return whole(body.group, 1, 60) ? { action: "submit", group: body.group } : null;
    case "end":
      return { action: "end" };
    default:
      return null;
  }
}
