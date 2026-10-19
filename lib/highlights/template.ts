/**
 * Notification copy templates: plain text with {Placeholder} slots, e.g. "{Player}’s heating up! 🔥". Pure.
 * Placeholders match case- and spacing-insensitively ("{player}", "{Player 1,Team A}" and "{Player 1, Team A}" are the
 * same slot). No other syntax: a stray "{" or "}" is a problem, so a typo can never reach a player's lock screen.
 */

/**
 * Every supported slot, by its canonical (sheet) spelling.
 * Player: one golfer, or a whole match side ("Cam & Cade"). Players: a list of golfers ("Cam, Drew, and Cade").
 * Player 1–3: the golfers of a shared moment, in order. Player N, Team A / B: a match side's golfers.
 * Team: the team the moment is about. Team A: that side's team. Team B: the other side's. Opponent: the other side (v2).
 */
export const TEMPLATE_VARIABLES = [
  "Player", "Players", "Player 1", "Player 2", "Player 3",
  "Player 1, Team A", "Player 2, Team A", "Player 1, Team B", "Player 2, Team B",
  "Team", "Team A", "Team B", "Opponent",
  "Hole", "Count", "Margin", "Round", "Course",
  "Time", "Date", "Destination", "Flight Number", "Flight Status", "Location", "Carpool Name", "Property", "Venue", "Event Name", "Announcement",
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Partial<Record<string, string | number>>;

/** "Player 1,  team A" → "player 1,team a": the form placeholders and value keys are compared in. */
export const variableKey = (name: string) => name.trim().toLowerCase().replace(/\s*,\s*/g, ",").replace(/\s+/g, " ");
const CANONICAL = new Map<string, TemplateVariable>(TEMPLATE_VARIABLES.map((name) => [variableKey(name), name]));
/** The canonical spelling of a placeholder, or null if it isn't supported. */
export const canonicalVariable = (name: string): TemplateVariable | null => CANONICAL.get(variableKey(name)) ?? null;

/** Typical values, for showing organizers what a message will look like. */
export const SAMPLE_VALUES: Record<TemplateVariable, string> = {
  Player: "Alex", Players: "Alex, Sam, and Jordan", "Player 1": "Alex", "Player 2": "Sam", "Player 3": "Jordan",
  "Player 1, Team A": "Alex", "Player 2, Team A": "Sam", "Player 1, Team B": "Jordan", "Player 2, Team B": "Riley",
  Team: "Team Maroon", "Team A": "Team Maroon", "Team B": "Team White", Opponent: "Team White",
  Hole: "12", Count: "4", Margin: "3&2", Round: "2", Course: "Mission Hills",
  Time: "2:10 PM", Date: "Fri, Oct 16", Destination: "Palm Springs", "Flight Number": "AA 1234", "Flight Status": "Delayed 45 min",
  Location: "Terminal 4 pickup", "Carpool Name": "Van 1", Property: "La Quinta Resort", Venue: "Mastro's", "Event Name": "Team dinner",
  Announcement: "Shuttle leaves at 7:15 sharp.",
};
/** Realistic worst cases (a two-golfer side, four names, long places), for length warnings. */
export const LONG_SAMPLE_VALUES: Record<TemplateVariable, string> = {
  ...SAMPLE_VALUES,
  Player: "Christopher Williams & Alexander Thompson", Players: "Christopher, Alexander, Jonathan, and Benjamin",
  "Player 1": "Christopher Williams", "Player 2": "Alexander Thompson", "Player 3": "Jonathan Richardson",
  "Player 1, Team A": "Christopher Williams", "Player 2, Team A": "Alexander Thompson", "Player 1, Team B": "Jonathan Richardson", "Player 2, Team B": "Benjamin Hutchinson",
  Team: "The Weekend Warriors", "Team A": "The Weekend Warriors", "Team B": "The Sunday Slicers", Opponent: "Christopher Williams & Alexander Thompson",
  Hole: "18", Count: "10", Margin: "10&8", Round: "10", Course: "Pinehurst Resort Course No. 2",
  Destination: "Scottsdale / Phoenix Sky Harbor", "Flight Status": "Cancelled — rebooked on a later flight", Location: "Terminal 4, Door 7, ride-share pickup",
  "Carpool Name": "The Big White Suburban", Property: "La Quinta Resort & Club, Casita 214", Venue: "The Steakhouse at Mission Hills",
  "Event Name": "Welcome dinner and team draft", Announcement: "Shuttle to the course leaves at 7:15 sharp from the main lobby — don't be late.",
};

const PLACEHOLDER = /\{([^{}]*)\}/g;

export interface TemplateCheck {
  /** Placeholders used, canonical spelling when supported, in order of first appearance. */
  variables: string[];
  /** Placeholders that aren't supported (as typed). */
  unknown: string[];
  /** Syntax problems in plain words. */
  problems: string[];
}

export function checkTemplate(text: string): TemplateCheck {
  const variables: string[] = [], unknown: string[] = [];
  let empty = false;
  for (const match of text.matchAll(PLACEHOLDER)) {
    const raw = match[1].trim();
    if (!raw) { empty = true; continue; }
    const name = canonicalVariable(raw) ?? raw;
    if (!variables.includes(name)) variables.push(name);
    if (!canonicalVariable(raw) && !unknown.includes(raw)) unknown.push(raw);
  }
  const problems: string[] = [];
  if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) problems.push('Has a "{" or "}" that isn\'t part of a {placeholder}.');
  if (empty) problems.push("Has an empty {} placeholder.");
  return { variables, unknown, problems };
}

export type RenderResult = { ok: true; text: string } | { ok: false; missing: string[]; problems: string[] };

/** Fills every placeholder. Fails (never half-renders) when the template is malformed or a value is missing. */
export function renderTemplate(text: string, values: TemplateValues): RenderResult {
  const check = checkTemplate(text);
  const byKey = new Map<string, string>();
  for (const [name, value] of Object.entries(values)) if (value !== undefined && String(value).trim() !== "") byKey.set(variableKey(name), String(value));
  const missing = check.variables.filter((name) => !check.unknown.includes(name) && !byKey.has(variableKey(name)));
  const problems = [...check.problems, ...check.unknown.map((name) => `{${name}} is not a supported placeholder.`)];
  if (missing.length || problems.length) return { ok: false, missing, problems };
  return { ok: true, text: text.replace(PLACEHOLDER, (_, name: string) => byKey.get(variableKey(name))!) };
}

/** The canonical placeholders a template needs (empty for plain text). */
export const requiredVariables = (...texts: string[]) => [...new Set(texts.flatMap((text) => checkTemplate(text).variables))];
