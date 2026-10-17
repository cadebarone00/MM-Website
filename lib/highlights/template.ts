/**
 * Notification copy templates: plain text with {variable} placeholders, e.g. "{player}'s heating up! 🔥". Pure.
 * No other syntax: a stray "{" or "}" is a problem, so a typo can never reach a player's lock screen.
 */

/**
 * {player}  one golfer, or a whole match side ("Cam & Cade").
 * {players} a list of golfers ("Cam, Drew, and Cade"), formatted by the detector.
 */
export const TEMPLATE_VARIABLES = ["player", "players", "team", "opponent", "count", "hole", "round", "course", "margin"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string | number>>;

/** Typical values, for showing organizers what a message will look like. */
export const SAMPLE_VALUES: Record<TemplateVariable, string> = {
  player: "Alex", players: "Alex, Sam, and Jordan", team: "Team Maroon", opponent: "Team White",
  count: "4", hole: "12", round: "2", course: "Mission Hills", margin: "3&2",
};
/** Realistic worst cases (a two-golfer side, four names, a long course), for length warnings. */
export const LONG_SAMPLE_VALUES: Record<TemplateVariable, string> = {
  player: "Christopher Williams & Alexander Thompson", players: "Christopher, Alexander, Jonathan, and Benjamin",
  team: "The Weekend Warriors", opponent: "Christopher Williams & Alexander Thompson",
  count: "10", hole: "18", round: "10", course: "Pinehurst Resort Course No. 2", margin: "10&8",
};

const PLACEHOLDER = /\{([^{}]*)\}/g;

export interface TemplateCheck {
  /** Placeholders used, in order of first appearance. */
  variables: string[];
  /** Placeholders that aren't in TEMPLATE_VARIABLES. */
  unknown: string[];
  /** Syntax problems in plain words. */
  problems: string[];
}

export function checkTemplate(text: string): TemplateCheck {
  const variables: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1].trim();
    if (!variables.includes(name)) variables.push(name);
  }
  const problems: string[] = [];
  if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) problems.push('Has a "{" or "}" that isn\'t part of a {variable}.');
  if (variables.includes("")) problems.push("Has an empty {} placeholder.");
  const unknown = variables.filter((name) => name !== "" && !(TEMPLATE_VARIABLES as readonly string[]).includes(name));
  return { variables: variables.filter((name) => name !== ""), unknown, problems };
}

export type RenderResult = { ok: true; text: string } | { ok: false; missing: string[]; problems: string[] };

/** Fills every placeholder. Fails (never half-renders) when the template is malformed or a value is missing. */
export function renderTemplate(text: string, values: TemplateValues): RenderResult {
  const check = checkTemplate(text);
  const lookup = values as Record<string, string | number | undefined>;
  const missing = check.variables.filter((name) => lookup[name] === undefined || String(lookup[name]).trim() === "");
  const problems = [...check.problems, ...check.unknown.map((name) => `{${name}} is not a supported variable.`)];
  if (missing.length || problems.length) return { ok: false, missing, problems };
  return { ok: true, text: text.replace(PLACEHOLDER, (_, name: string) => String(lookup[name.trim()])) };
}
