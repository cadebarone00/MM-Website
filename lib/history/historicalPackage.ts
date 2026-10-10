/**
 * Historical Trip Package, version 1 — the standard file any group uses to bring past years of a trip into the app
 * (supabase/historical_import.sql applies it). The Maroon 2024–2026 is the first dataset
 * (scripts/export-maroon-history.ts), but nothing here is Maroon-specific.
 *
 * Rules the format guarantees:
 *   - Everything has a stable `key` (lowercase letters, numbers, : . _ -), unique in its list; keys are what make
 *     re-importing safe, so an exporter must derive them from the original records, never from row order.
 *   - People are PARTICIPANTS (a name and a key). A package never carries emails, account or profile ids — linking a
 *     participant to a modern profile is a separate, explicit, audited step after import.
 *   - Teams belong to an edition (a year), never to a person.
 *   - Unknown is `null`, never guessed; anything uncertain is listed in `flags`.
 */

export const PACKAGE_FORMAT = "historical-trip-package";
export const PACKAGE_VERSION = 1;

export interface HistoricalPackage {
  format: typeof PACKAGE_FORMAT;
  version: typeof PACKAGE_VERSION;
  /** The import's identity: re-importing the same key with the same content is a no-op. */
  dataset: { key: string; name: string; source: string; exportedAt: string };
  /** The trip / event these years belong to (one event, many editions). */
  event: { key: string; name: string };
  participants: HistoricalParticipant[];
  courses: HistoricalCourse[];
  editions: HistoricalEdition[];
  flags: HistoricalFlag[];
}
export interface HistoricalParticipant { key: string; name: string }
/** `ref` = the course API id when the exporter knows it; `par` = 18-hole par when known. */
export interface HistoricalCourse { key: string; name: string; place: string | null; ref: string | null; par: number | null }
export interface HistoricalTeam { key: string; name: string; color: string | null }
export interface HistoricalEdition {
  key: string; year: number; label: string; startDate: string | null; endDate: string | null; place: string | null;
  teams: HistoricalTeam[];
  roster: { participant: string; team: string | null; captain: boolean | null }[];
  rounds: HistoricalRound[];
  matches: HistoricalMatch[];
  /** As recorded at the time (the app can recompute from matches and flags any difference). */
  results: { teams: { team: string; points: number }[]; pointsAvailable: number | null; winnerTeam: string | null; individualChampion: string | null };
}
export interface HistoricalRound {
  key: string; number: number; day: number | null; session: string | null; date: string | null;
  /** A course key, or null when the course for this round wasn't recorded. */
  course: string | null;
  format: string;
  /** individual = each player's own card; team = one shared card (e.g. Alternate Shot) with no personal score. */
  scoring: "individual" | "team";
  scores: HistoricalScore[];
}
export interface HistoricalHole { number: number; par: number | null; strokes: number; putts: number | null; fairway: "hit" | "missed" | null; green: boolean | null }
export interface HistoricalScore { participant: string; holesPlayed: 9 | 18; total: number | null; holes: HistoricalHole[] }
export interface HistoricalMatch {
  key: string; round: string; format: string;
  sides: [HistoricalSide, HistoricalSide];
  points: [number, number];
  /** e.g. "3&2", "1 up", "Halved"; null when not recorded. */
  result: string | null;
  winner: "0" | "1" | "halved" | null;
}
export interface HistoricalSide { team: string | null; participants: string[] }
export interface HistoricalFlag { level: "uncertain" | "excluded"; path: string; message: string }

export interface PackageIssue { path: string; message: string }
export interface PackageCheck {
  ok: boolean;
  errors: PackageIssue[];
  warnings: PackageIssue[];
  summary: { editions: number; participants: number; courses: number; rounds: number; scores: number; holeScores: number; matches: number; flags: number };
}

const KEY = /^[a-z0-9][a-z0-9:._-]{0,119}$/;
const FORBIDDEN_FIELD = /^(email|e-mail|profileid|profile_id|userid|user_id|authid|auth_id|accountid|account_id|password)$/i;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

/** Every field name in the package, to refuse account data anywhere in it. */
function forbiddenFields(value: unknown, path: string, out: PackageIssue[]) {
  if (Array.isArray(value)) value.forEach((v, i) => forbiddenFields(v, `${path}[${i}]`, out));
  else if (isObject(value)) for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_FIELD.test(k)) out.push({ path: `${path}.${k}`, message: "Packages never carry emails, passwords or account ids — people are linked to profiles after import." });
    forbiddenFields(v, `${path}.${k}`, out);
  }
}

/**
 * Checks a package before anything is imported. Errors block the import; warnings are worth a look (e.g. recorded
 * team points that don't match the matches). Pure — writes nothing.
 */
export function validateHistoricalPackage(input: unknown): PackageCheck {
  const errors: PackageIssue[] = [];
  const warnings: PackageIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const summary = { editions: 0, participants: 0, courses: 0, rounds: 0, scores: 0, holeScores: 0, matches: 0, flags: 0 };
  if (!isObject(input)) return { ok: false, errors: [{ path: "", message: "Not a package." }], warnings, summary };
  const pkg = input as Partial<HistoricalPackage>;
  if (pkg.format !== PACKAGE_FORMAT || pkg.version !== PACKAGE_VERSION) err("format", `Expected ${PACKAGE_FORMAT} version ${PACKAGE_VERSION}.`);
  forbiddenFields(input, "package", errors);
  const key = (path: string, value: unknown) => { if (typeof value !== "string" || !KEY.test(value)) err(path, "Keys are 1–120 lowercase letters, numbers, : . _ - (starting with a letter or number)."); };
  const text = (path: string, value: unknown, max = 120) => { if (typeof value !== "string" || !value.trim() || value.length > max) err(path, `Needs text (1–${max} characters).`); };
  const unique = (path: string, keys: unknown[]) => {
    const seen = new Set<unknown>();
    keys.forEach((k, i) => { if (seen.has(k)) err(`${path}[${i}].key`, `Duplicate key "${String(k)}".`); seen.add(k); });
  };

  if (!isObject(pkg.dataset)) err("dataset", "Missing dataset.");
  else { key("dataset.key", pkg.dataset.key); text("dataset.name", pkg.dataset.name); text("dataset.source", pkg.dataset.source, 500); }
  if (!isObject(pkg.event)) err("event", "Missing event.");
  else { key("event.key", pkg.event.key); text("event.name", pkg.event.name); }

  const participants = Array.isArray(pkg.participants) ? pkg.participants : [];
  if (!Array.isArray(pkg.participants)) err("participants", "Missing participants.");
  participants.forEach((p, i) => { key(`participants[${i}].key`, p?.key); text(`participants[${i}].name`, p?.name); });
  unique("participants", participants.map((p) => p?.key));
  const people = new Set(participants.map((p) => p?.key));

  const courses = Array.isArray(pkg.courses) ? pkg.courses : [];
  courses.forEach((c, i) => {
    key(`courses[${i}].key`, c?.key); text(`courses[${i}].name`, c?.name, 200);
    if (c?.par !== null && c?.par !== undefined && (!Number.isInteger(c.par) || c.par < 27 || c.par > 80)) err(`courses[${i}].par`, "Par should be a whole number (27–80) or null.");
  });
  unique("courses", courses.map((c) => c?.key));
  const courseKeys = new Set(courses.map((c) => c?.key));

  const editions = Array.isArray(pkg.editions) ? pkg.editions : [];
  if (!editions.length) err("editions", "A package needs at least one edition.");
  unique("editions", editions.map((e) => e?.key));
  const roundKeys = new Set<string>();
  editions.forEach((e, ei) => {
    const at = `editions[${ei}]`;
    key(`${at}.key`, e?.key); text(`${at}.label`, e?.label);
    if (!Number.isInteger(e?.year) || e.year < 1900 || e.year > 2200) err(`${at}.year`, "Year should be 1900–2200.");
    for (const field of ["startDate", "endDate"] as const) if (e?.[field] !== null && !isDate(e?.[field])) err(`${at}.${field}`, "Dates are YYYY-MM-DD or null.");
    if (isDate(e?.startDate) && isDate(e?.endDate) && e.endDate < e.startDate) err(`${at}.endDate`, "The end date is before the start date.");
    const teams = Array.isArray(e?.teams) ? e.teams : [];
    teams.forEach((t, ti) => { key(`${at}.teams[${ti}].key`, t?.key); text(`${at}.teams[${ti}].name`, t?.name, 60); });
    unique(`${at}.teams`, teams.map((t) => t?.key));
    const teamKeys = new Set(teams.map((t) => t?.key));
    const roster = Array.isArray(e?.roster) ? e.roster : [];
    const onRoster = new Map<string, string | null>();
    roster.forEach((r, ri) => {
      if (!people.has(r?.participant)) err(`${at}.roster[${ri}].participant`, `Unknown participant "${String(r?.participant)}".`);
      if (onRoster.has(r?.participant)) err(`${at}.roster[${ri}].participant`, "On this year's roster twice.");
      if (r?.team !== null && !teamKeys.has(r?.team)) err(`${at}.roster[${ri}].team`, `Unknown team "${String(r?.team)}".`);
      onRoster.set(r?.participant, r?.team ?? null);
    });

    const rounds = Array.isArray(e?.rounds) ? e.rounds : [];
    const editionRounds = new Set<string>();
    rounds.forEach((r, ri) => {
      const rat = `${at}.rounds[${ri}]`;
      key(`${rat}.key`, r?.key);
      if (roundKeys.has(r?.key)) err(`${rat}.key`, `Duplicate round key "${String(r?.key)}".`);
      roundKeys.add(r?.key); editionRounds.add(r?.key);
      if (!Number.isInteger(r?.number) || r.number < 0 || r.number > 62) err(`${rat}.number`, "Round numbers are 0–62.");
      if (r?.date !== null && !isDate(r?.date)) err(`${rat}.date`, "Dates are YYYY-MM-DD or null.");
      if (isDate(r?.date) && ((isDate(e?.startDate) && r.date < e.startDate) || (isDate(e?.endDate) && r.date > e.endDate))) warnings.push({ path: `${rat}.date`, message: "Round date is outside the edition's dates." });
      if (r?.course !== null && !courseKeys.has(r?.course)) err(`${rat}.course`, `Unknown course "${String(r?.course)}".`);
      text(`${rat}.format`, r?.format, 60);
      if (r?.scoring !== "individual" && r?.scoring !== "team") err(`${rat}.scoring`, "Scoring is individual or team.");
      const scores = Array.isArray(r?.scores) ? r.scores : [];
      if (r?.scoring === "team" && scores.length) err(`${rat}.scores`, "A shared team card has no personal scores.");
      const scored = new Set<string>();
      scores.forEach((s, si) => {
        const sat = `${rat}.scores[${si}]`;
        if (!onRoster.has(s?.participant)) err(`${sat}.participant`, `"${String(s?.participant)}" isn't on this year's roster.`);
        if (scored.has(s?.participant)) err(`${sat}.participant`, "Two cards for one player in one round.");
        scored.add(s?.participant);
        if (s?.holesPlayed !== 9 && s?.holesPlayed !== 18) err(`${sat}.holesPlayed`, "Holes played is 9 or 18.");
        const holes = Array.isArray(s?.holes) ? s.holes : [];
        if (holes.length > (s?.holesPlayed ?? 18)) err(`${sat}.holes`, "More holes than holes played.");
        const numbers = new Set<number>();
        holes.forEach((h, hi) => {
          if (!Number.isInteger(h?.number) || h.number < 1 || h.number > 18 || numbers.has(h.number)) err(`${sat}.holes[${hi}].number`, "Hole numbers are 1–18, once each.");
          numbers.add(h?.number);
          if (!Number.isInteger(h?.strokes) || h.strokes < 1 || h.strokes > 20) err(`${sat}.holes[${hi}].strokes`, "Strokes are 1–20.");
          if (h?.par !== null && (!Number.isInteger(h?.par) || h.par < 3 || h.par > 6)) err(`${sat}.holes[${hi}].par`, "Par is 3–6 or null.");
        });
        summary.holeScores += holes.length;
        if (s?.total !== null && (!Number.isInteger(s?.total) || s.total < 18 || s.total > 200)) err(`${sat}.total`, "Totals are 18–200 or null.");
        if (holes.length === s?.holesPlayed && s?.total !== holes.reduce((sum, h) => sum + (h?.strokes ?? 0), 0)) err(`${sat}.total`, "The total doesn't match the hole scores.");
        if (holes.length && holes.length < (s?.holesPlayed ?? 18) && s?.total !== null) err(`${sat}.total`, "A card with missing holes has no total (null).");
      });
      summary.scores += scores.length;
    });
    summary.rounds += rounds.length;

    const matches = Array.isArray(e?.matches) ? e.matches : [];
    unique(`${at}.matches`, matches.map((m) => m?.key));
    const recomputed = new Map<string, number>();
    matches.forEach((m, mi) => {
      const mat = `${at}.matches[${mi}]`;
      key(`${mat}.key`, m?.key);
      if (!editionRounds.has(m?.round)) err(`${mat}.round`, `Unknown round "${String(m?.round)}" in this edition.`);
      text(`${mat}.format`, m?.format, 60);
      if (!Array.isArray(m?.sides) || m.sides.length !== 2) { err(`${mat}.sides`, "A match has two sides."); return; }
      m.sides.forEach((side, si) => {
        if (side?.team !== null && !teamKeys.has(side?.team)) err(`${mat}.sides[${si}].team`, `Unknown team "${String(side?.team)}".`);
        (Array.isArray(side?.participants) ? side.participants : []).forEach((p, pi) => {
          if (!onRoster.has(p)) err(`${mat}.sides[${si}].participants[${pi}]`, `"${String(p)}" isn't on this year's roster.`);
          else if (side?.team !== null && onRoster.get(p) !== side?.team) err(`${mat}.sides[${si}].participants[${pi}]`, `"${String(p)}" isn't on team "${String(side?.team)}" this year.`);
        });
      });
      if (!Array.isArray(m?.points) || m.points.length !== 2 || !m.points.every((p) => typeof p === "number" && p >= 0)) err(`${mat}.points`, "Points are two numbers, one per side.");
      else m.sides.forEach((side, si) => { if (side?.team) recomputed.set(side.team, (recomputed.get(side.team) ?? 0) + m.points[si]); });
      if (m?.winner !== null && m?.winner !== "0" && m?.winner !== "1" && m?.winner !== "halved") err(`${mat}.winner`, "Winner is \"0\", \"1\", \"halved\" or null.");
    });
    summary.matches += matches.length;

    const results = e?.results;
    if (!isObject(results)) err(`${at}.results`, "Missing results (use empty / null values when not recorded).");
    else {
      if (results.winnerTeam !== null && !teamKeys.has(results.winnerTeam)) err(`${at}.results.winnerTeam`, `Unknown team "${String(results.winnerTeam)}".`);
      if (results.individualChampion !== null && !onRoster.has(results.individualChampion)) err(`${at}.results.individualChampion`, "The champion isn't on this year's roster.");
      (Array.isArray(results.teams) ? results.teams : []).forEach((t, ti) => {
        if (!teamKeys.has(t?.team)) err(`${at}.results.teams[${ti}].team`, `Unknown team "${String(t?.team)}".`);
        else if (matches.length && Math.abs((recomputed.get(t.team) ?? 0) - t.points) > 1e-9) {
          warnings.push({ path: `${at}.results.teams[${ti}].points`, message: `Recorded ${t.points} points, but the matches add up to ${recomputed.get(t.team) ?? 0}.` });
        }
      });
    }
  });
  summary.editions = editions.length;
  summary.participants = participants.length;
  summary.courses = courses.length;
  summary.flags = Array.isArray(pkg.flags) ? pkg.flags.length : 0;
  if (!Array.isArray(pkg.flags)) err("flags", "Missing flags (an empty list is fine).");
  return { ok: errors.length === 0, errors, warnings, summary };
}
