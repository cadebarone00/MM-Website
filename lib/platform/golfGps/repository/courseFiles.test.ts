import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createGolfCourseStore, type DatabaseCall } from "./courseStore.ts";
import { scoringCourse } from "../../personalRound.ts";
import { allCards, BATCH_FILE, batchSql, checkCard, PARTS_DIR, partFiles } from "../../../../scripts/build-course-sql.ts";

// Every course card we entered (scripts/courses/*.ts): each card adds up, the one combined SQL file is current, and
// running it (twice) gives Play the right scorecard for every course. Practice database only (PGlite).
async function database() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(readFileSync("supabase/golf_course_data.sql", "utf8"));
  const call: DatabaseCall = async (fn, args) => {
    const names = Object.keys(args);
    const { rows } = await db.query<{ result: unknown }>(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as result`, names.map((n) => args[n]));
    return rows[0].result;
  };
  return { db, store: createGolfCourseStore(call) };
}

test("every card adds up, and the combined file is up to date (run: npx tsx scripts/build-course-sql.ts)", async () => {
  const cards = await allCards();
  for (const card of cards) assert.deepEqual(checkCard(card), [], card.name);
  assert.equal(readFileSync(BATCH_FILE, "utf8"), batchSql(cards));
  const parts = partFiles(cards);
  assert.deepEqual(readdirSync(PARTS_DIR).sort(), parts.map((p) => p.path.slice(PARTS_DIR.length + 1)));
  for (const part of parts) {
    assert.equal(readFileSync(part.path, "utf8"), part.sql, part.path);
    assert.ok(part.sql.length < 250_000, `${part.path} small enough for the SQL Editor`);
  }
});

test("running every part file adds the same courses as the one big file", async () => {
  const cards = await allCards();
  const { db, store } = await database();
  for (const part of partFiles(cards)) await db.exec(readFileSync(part.path, "utf8"));
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from golf_courses")).rows[0].n, cards.length);
  for (const card of cards) assert.ok(await store.findIdByExternalId("maroon", card.slug), card.name);
});

test("the combined file saves each course once (even run twice), and Play reads pars, handicaps and ratings (men's, else women's)", async () => {
  const cards = await allCards();
  const { db, store } = await database();
  const sql = readFileSync(BATCH_FILE, "utf8");
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await db.query<{ n: number }>("select count(*)::int as n from golf_courses")).rows[0].n, cards.length);
  for (const card of cards) {
    const id = await store.findIdByExternalId("maroon", card.slug);
    assert.ok(id, `${card.name} found by its maroon ref`);
    const saved = (await store.load(id!))!.course;
    const scoring = scoringCourse(`maroon:${saved.id}`, saved)!;
    assert.deepEqual([scoring.name, scoring.place], [card.name, [card.city, card.state].filter(Boolean).join(", ")]);
    assert.deepEqual(scoring.par, card.par, card.name);
    assert.deepEqual(scoring.strokeIndex, card.strokeIndex ?? card.par.map(() => null), card.name);
    assert.deepEqual(scoring.tees.map((t) => [t.name, t.rating, t.slope]), card.tees.map((t) => [t.name, (t.men ?? t.women)?.[0] ?? null, (t.men ?? t.women)?.[1] ?? null]), card.name);
    for (const tee of card.tees) {
      assert.deepEqual(saved.holes.map((h) => h.tees.find((t) => t.name === tee.name)?.yardage), tee.yards, `${card.name} ${tee.name} yardages`);
      if (tee.women) assert.deepEqual(saved.teeSets.find((t) => t.name === tee.name)?.ratings?.find((r) => r.gender === "women"), { gender: "women", courseRating: tee.women[0], slopeRating: tee.women[1] });
    }
  }
});
