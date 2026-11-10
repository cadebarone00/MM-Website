import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readImportRequest } from "./pastTripImportRequest.ts";
import { draftFromTrip, readPastTripWorkbook } from "./pastTripImport.ts";

const TODAY = "2026-11-09";
const URL = "http://localhost/api/golf-trips/import";
const ID = "33333333-3333-4333-8333-333333333333";
const json = (body: unknown) => new Request(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const form = (fields: Record<string, string | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return new Request(URL, { method: "POST", body: f }); };
const template = (name: string) => new File([readFileSync(`public/templates/${name}.xlsx`)], `${name}.xlsx`);
const tripDraft = () => { const r = readPastTripWorkbook(new Uint8Array(readFileSync("public/templates/past-trip-team.xlsx")), "t.xlsx", TODAY); assert.ok(r.ok && r.trip); return draftFromTrip(r.trip); };

test("a walkthrough draft and the spreadsheet both come through the same way", async () => {
  const fromDraft = await readImportRequest(json({ action: "create", draft: tripDraft(), me: "Riley Foster", requestId: ID }), TODAY);
  const fromSheet = await readImportRequest(form({ file: template("past-trip-team"), action: "create", me: "Riley Foster", requestId: ID }), TODAY);
  assert.ok(fromDraft.ok && fromSheet.ok);
  assert.deepEqual(fromDraft.trip, fromSheet.trip);
  assert.equal(fromDraft.me, "Riley Foster");
});

test("a draft with mistakes answers each problem with its walkthrough step; nothing else gets through", async () => {
  const draft = tripDraft();
  draft.matches[0].winner = null;
  const bad = await readImportRequest(json({ action: "preview", draft }), TODAY);
  assert.ok(!bad.ok && bad.status === 422);
  assert.deepEqual(bad.body.draftProblems, [{ step: "matches", message: "Round 1, match 1: pick who won." }]);
  assert.equal((await readImportRequest(json({ action: "preview", draft: { kind: "team" } }), TODAY)).ok, false);
  assert.equal((await readImportRequest(json({ action: "create", draft: tripDraft(), me: "", requestId: "nope" }), TODAY)).ok, false);
  assert.equal((await readImportRequest(json({ action: "create", draft: tripDraft(), me: "Nobody", requestId: ID }), TODAY)).ok, false);
  assert.equal((await readImportRequest(form({ file: new File(["a,b"], "t.csv"), action: "preview" }), TODAY)).ok, false);
});
