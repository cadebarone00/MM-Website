import { SAMPLE_COURSES, type SampleCourse } from "./courses";
import { seededRandom } from "./random";

export type StudioSetup = {
  kind: "play";
  players: { key: string; name: string }[];
  host: string;
  course: string;
  tee: string;
  game: "none" | "skins";
  guest: string | null;
  seed: number;
};

export const PLAYER_NAMES = ["Cam", "Cade", "Jake", "Rob", "Tyler", "Luke", "Matt", "Sam"];

const RESERVED_KEYS = ["www", "localhost", "sim", "api"];

export function validateSetup(s: StudioSetup): string | null {
  if (s.players.length < 1) return "Add at least 1 player.";
  if (s.players.length > 4) return "A round can have at most 4 players.";
  if (s.players.some((p) => !p.name.trim())) return "Every player needs a name.";
  if (s.players.some((p) => p.name.trim().length > 40)) return "A player name can be at most 40 characters.";
  if (s.players.some((p) => !/^[a-z0-9]{1,24}$/.test(p.key))) return "A player key must be 1 to 24 lowercase letters or numbers.";
  if (s.players.some((p) => RESERVED_KEYS.includes(p.key))) return "That player key is reserved. Pick another name.";
  const names = s.players.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Two players have the same name.";
  // The scoring screen labels each stepper by first name, so two people (guest included) can't share one.
  const firsts = [...s.players.map((p) => p.name), ...(s.guest?.trim() ? [s.guest] : [])].map((n) => n.trim().split(/\s+/)[0]);
  const shared = firsts.find((f, i) => firsts.findIndex((g) => g.toLowerCase() === f.toLowerCase()) !== i);
  if (shared) return `Two people share the first name ${shared}; the scoring screen can't tell them apart.`;
  const keys = s.players.map((p) => p.key);
  if (new Set(keys).size !== keys.length) return "Two players have the same key.";
  if (!keys.includes(s.host)) return "The host must be one of the players.";
  const course = SAMPLE_COURSES.find((c) => c.ref === s.course);
  if (!course) return "That course isn't in the sample list.";
  if (!course.tees.some((t) => t.name === s.tee)) return "That tee isn't on this course.";
  if (!Number.isInteger(s.seed) || s.seed < 0) return "The seed must be a whole number, 0 or more.";
  return null;
}

/** A lowercase subdomain-safe slug; adds a number when it's already taken. */
export function keyFor(name: string, taken: string[]): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "player";
  if (!taken.includes(slug)) return slug;
  let n = 2;
  while (taken.includes(`${slug}${n}`)) n++;
  return `${slug}${n}`;
}

const mk = (id: PresetId, label: string, setup: Partial<StudioSetup> & Pick<StudioSetup, "players">): Preset => ({
  id, label,
  setup: { kind: "play", host: "cam", course: "sim:stevens-park", tee: "Blue", game: "none", guest: null, seed: 1, ...setup },
});
type PresetId = "play-solo" | "play-friends" | "play-unrated" | "play-fourball";
type Preset = { id: PresetId; label: string; setup: StudioSetup };
const P = (...names: string[]) => names.map((name) => ({ key: name.toLowerCase(), name }));

export const PRESETS: Preset[] = [
  mk("play-solo", "Play: solo", { players: P("Cam") }),
  mk("play-friends", "Play: with friends", { players: P("Cam", "Cade", "Jake"), game: "skins", guest: "Uncle Rob" }),
  mk("play-unrated", "Play: tee with no rating", { players: P("Cam"), course: "sim:sample-muni" }),
  mk("play-fourball", "Play: foursome", { players: P("Cam", "Cade", "Jake", "Rob"), game: "skins" }),
];

const OFFSETS = [-1, 0, 0, 0, 1, 1, 2];

/** 18 strokes per player (and the guest): par plus a seeded offset, never below 1. */
export function strokesFor(setup: StudioSetup, course: SampleCourse): Record<string, number[]> {
  const rand = seededRandom(setup.seed);
  const keys = setup.players.map((p) => p.key);
  if (setup.guest) keys.push("guest");
  const out: Record<string, number[]> = {};
  for (const key of keys) out[key] = course.par.slice(0, 18).map((par) => Math.max(1, par + OFFSETS[Math.floor(rand() * OFFSETS.length)]));
  return out;
}
