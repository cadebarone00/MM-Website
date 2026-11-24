// Writes supabase/course_library_new_courses.sql: every course card in scripts/courses/*.ts, in one file the owner runs
// once in Supabase (same shape as supabase/course_eagle_pointe.sql; project_specs.md "a course library we fill ourselves"):
//   npx tsx scripts/build-course-sql.ts
// Also writes the same courses split into small files (supabase/course_library_parts/), because Supabase's SQL Editor
// refuses a query as big as the whole file. Running every part does exactly what the one big file does.
// Checks every card first (18 pars, a 1–18 stroke index, every tee's yardages add up to its printed total).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";

export const BATCH_FILE = "supabase/course_library_new_courses.sql";
export const PARTS_DIR = "supabase/course_library_parts";
/** Small enough (~150 KB a part) for Supabase's SQL Editor. */
const COURSES_PER_PART = 4;

export interface CourseCard {
  /** city / state / timezone: "" when the card doesn't say (filled in once the owner tells us). */
  slug: string; name: string; city: string; state: string; timezone: string;
  /** Two-letter country code; unset = US. */
  country?: string;
  /** The day the card was entered (YYYY-MM-DD), so the file stays the same when it's rebuilt. */
  added: string;
  attribution: string; note: string;
  par: number[]; strokeIndex?: number[];
  /** men / women = [course rating, slope]; total = the card's printed total yards (checked). */
  tees: { name: string; color: string; men?: [number, number]; women?: [number, number]; yards: number[]; total: number }[];
}

const FEATURES = { scorecard: true, teeCoordinates: false, greenPoints: false, greenPolygons: false, fairways: false, hazardLocations: false, hazardPolygons: false, holeBoundaries: false, centerlines: false, elevation: false, greenSlope: false };
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Problems with the card, in plain words (empty = fine). */
export function checkCard(card: CourseCard): string[] {
  const problems: string[] = [];
  if (card.par.length !== 18 || card.par.some((p) => p < 3 || p > 6)) problems.push("Needs 18 pars between 3 and 6.");
  if (card.strokeIndex && [...card.strokeIndex].sort((a, b) => a - b).join() !== Array.from({ length: 18 }, (_, i) => i + 1).join()) problems.push("The handicap row must use 1–18 once each.");
  for (const tee of card.tees) {
    if (tee.yards.length !== 18) problems.push(`${tee.name}: needs 18 yardages.`);
    else if (sum(tee.yards) !== tee.total) problems.push(`${tee.name}: yardages add up to ${sum(tee.yards)}, the card says ${tee.total}.`);
  }
  return problems;
}

/** The save_golf_course payload for a card we entered ourselves (provider "maroon", checked by the owner). */
export function coursePayload(card: CourseCard, at: string) {
  const verification = { status: "admin_verified", updatedAt: at, verifiedAt: at, note: card.note };
  const coverage = { level: "scorecard", features: FEATURES };
  const source = { provider: "maroon", providerRecordId: card.slug, importedAt: at, attribution: card.attribution };
  const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    course: { name: card.name, address: { ...(card.city ? { city: card.city } : {}), ...(card.state ? { state: card.state } : {}), country: card.country ?? "US" }, ...(card.timezone ? { timezone: card.timezone } : {}), hole_count: 18,
      coverage: { ...coverage, holesWithGps: 0 }, coverage_level: "scorecard", verification, imported_at: at },
    external_ids: [{ provider: "maroon", id: card.slug }],
    sources: [{ provider: "maroon", provider_record_id: card.slug, imported_at: at, attribution: card.attribution, license: "maroon" }],
    tee_sets: card.tees.map((tee) => ({
      key: key(tee.name), name: tee.name, color: tee.color, total_yards: tee.total, par: sum(card.par),
      ratings: [...(tee.men ? [{ gender: "men", courseRating: tee.men[0], slopeRating: tee.men[1] }] : []), ...(tee.women ? [{ gender: "women", courseRating: tee.women[0], slopeRating: tee.women[1] }] : [])],
      provider: "maroon", license: "maroon",
    })),
    holes: card.par.map((par, h) => ({
      number: h + 1, par, ...(card.strokeIndex ? { stroke_index: card.strokeIndex[h] } : {}),
      sources: [source], coverage, coverage_level: "scorecard", verification,
      tees: card.tees.map((tee) => ({ key: `${card.slug}-h${h + 1}-${key(tee.name)}`, tee_set_key: key(tee.name), name: tee.name, color: tee.color, yardage: tee.yards[h], par, provider: "maroon", license: "maroon" })),
      features: [],
    })),
  };
}

/** One course's part of the file: a short note, then the save (skipped when the course is already in the library). */
function courseStatement(card: CourseCard): string {
  const tees = card.tees.map((t) => `${t.name} ${t.men ? `${t.men[0]}/${t.men[1]}` : "no rating"}`).join(", ");
  return `-- ${card.name} (${[card.city, card.state].filter(Boolean).join(", ") || "location not on the card"}): par ${sum(card.par)}${card.strokeIndex ? ", hole handicaps" : ""}; tees ${tees}.
-- ${card.note}
-- Undo: delete from public.golf_courses where id = (select course_id from public.golf_course_external_ids where provider = 'maroon' and external_id = '${card.slug}');
select public.save_golf_course($course$${JSON.stringify(coursePayload(card, `${card.added}T00:00:00Z`))}$course$::jsonb) as course_id
where not exists (select 1 from public.golf_course_external_ids where provider = 'maroon' and external_id = '${card.slug}');
`;
}

/** The whole file: every card, alphabetically. */
export function batchSql(cards: CourseCard[]): string {
  const sorted = [...cards].sort((a, b) => a.name.localeCompare(b.name));
  return `-- ${BATCH_FILE}
-- Adds ${sorted.length} course${sorted.length === 1 ? "" : "s"} to The Maroon's course library, so Play's search finds them with their scorecards:
-- ${sorted.map((c) => c.name).join(", ")}.
-- Generated by scripts/build-course-sql.ts from scripts/courses/*.ts (cards from the owner's scorecard screenshots). Don't edit by hand.
-- Uses save_golf_course (golf_course_data.sql). Safe to run more than once: courses already in the library are skipped.

${sorted.map(courseStatement).join("\n")}`;
}

/** The same courses as batchSql, split into SQL Editor–sized files: part-01.sql, part-02.sql, … */
export function partFiles(cards: CourseCard[]): { path: string; sql: string }[] {
  const sorted = [...cards].sort((a, b) => a.name.localeCompare(b.name));
  const count = Math.ceil(sorted.length / COURSES_PER_PART);
  return Array.from({ length: count }, (_, i) => {
    const part = sorted.slice(i * COURSES_PER_PART, (i + 1) * COURSES_PER_PART);
    const path = `${PARTS_DIR}/part-${String(i + 1).padStart(2, "0")}.sql`;
    return { path, sql: `-- ${path} (part ${i + 1} of ${count})
-- Adds ${part.map((c) => c.name).join(", ")} to The Maroon's course library.
-- Generated by scripts/build-course-sql.ts. Don't edit by hand. Run every part, in any order; safe to run more than once.

${part.map(courseStatement).join("\n")}` };
  });
}

/** Every card in scripts/courses/. */
export async function allCards(): Promise<CourseCard[]> {
  const files = readdirSync(new URL("./courses/", import.meta.url)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  return Promise.all(files.map(async (f) => (await import(`./courses/${f}`) as { course: CourseCard }).course));
}

async function main() {
  const cards = await allCards();
  const problems = cards.flatMap((card) => checkCard(card).map((p) => `${card.name}: ${p}`));
  if (problems.length) { console.error(`Card problems:\n- ${problems.join("\n- ")}`); process.exit(1); }
  writeFileSync(BATCH_FILE, batchSql(cards));
  rmSync(PARTS_DIR, { recursive: true, force: true });
  mkdirSync(PARTS_DIR, { recursive: true });
  const parts = partFiles(cards);
  for (const part of parts) writeFileSync(part.path, part.sql);
  console.log(`Wrote ${BATCH_FILE} (${cards.length} courses) and ${parts.length} parts in ${PARTS_DIR}/`);
}
if (process.argv[1]?.endsWith("build-course-sql.ts")) void main();
