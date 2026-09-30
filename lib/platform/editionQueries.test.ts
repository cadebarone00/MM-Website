import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { editionColumns, editionFilter, maroonEdition } from "./editionScope.ts";

// Builds real Supabase queries (no network) and compares the requests the old
// year-keyed code and the new edition-scoped code would send. Step C3 must not
// change a single request.
const client = createClient("http://localhost:54321", "test-key", { auth: { persistSession: false } });
const edition = maroonEdition(2027);

type Built = { url: URL; method: string; body?: unknown };
const request = (builder: unknown): Built => builder as Built;

test("reads: .match(editionFilter) sends exactly the same request as .eq('season_year')", () => {
  const before = request(client.from("live_match_boxes").select("id, round").eq("season_year", 2027).eq("round", 3).order("box_number"));
  const after = request(client.from("live_match_boxes").select("id, round").match(editionFilter(edition)).eq("round", 3).order("box_number"));
  assert.match(after.url.search, /season_year=eq.2027/);
  assert.equal(after.url.toString(), before.url.toString());
  assert.equal(after.method, "GET");
});

test("updates and deletes filter the same rows", () => {
  const updateBefore = request(client.from("live_round_state").update({ matchups_locked: true }).eq("season_year", 2027).eq("round", 2));
  const updateAfter = request(client.from("live_round_state").update({ matchups_locked: true }).match(editionFilter(edition)).eq("round", 2));
  assert.equal(updateAfter.url.toString(), updateBefore.url.toString());
  assert.deepEqual(updateAfter.body, { matchups_locked: true });
  assert.deepEqual(updateAfter.body, updateBefore.body);

  const deleteBefore = request(client.from("live_match_boxes").delete().eq("season_year", 2027).eq("round", 2));
  const deleteAfter = request(client.from("live_match_boxes").delete().match(editionFilter(edition)).eq("round", 2));
  assert.equal(deleteAfter.url.toString(), deleteBefore.url.toString());
  assert.equal(deleteAfter.method, "DELETE");
});

test("inserts and upserts write the same row", () => {
  const insertBefore = request(client.from("live_score_audit_events").insert({ season_year: 2027, round: 1, kind: "x" }));
  const insertAfter = request(client.from("live_score_audit_events").insert({ ...editionColumns(edition), round: 1, kind: "x" }));
  assert.deepEqual(insertAfter.body, { season_year: 2027, round: 1, kind: "x" });
  assert.deepEqual(insertAfter.body, insertBefore.body);
  assert.equal(insertAfter.url.toString(), insertBefore.url.toString());

  const upsertBefore = request(client.from("career_archive_rounds").upsert([{ season_year: 2027, round: 1, player_slug: "a" }], { onConflict: "season_year,round,player_slug" }));
  const upsertAfter = request(client.from("career_archive_rounds").upsert([{ ...editionColumns(edition), round: 1, player_slug: "a" }], { onConflict: "season_year,round,player_slug" }));
  assert.deepEqual(upsertAfter.body, upsertBefore.body);
  assert.equal(upsertAfter.url.toString(), upsertBefore.url.toString());
});
