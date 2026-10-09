import test from "node:test";
import assert from "node:assert/strict";
import { draftBoard, draftWhenLabel, ordinal, type TeamDraft } from "./teamDraft.ts";

const draft = (changes: Partial<TeamDraft> = {}): TeamDraft => ({ teamType: "2 Teams", selection: "Draft", date: "2027-05-21", time: "21:15", type: "Snake", ...changes });

test("ordinal days read like a calendar", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st"]);
});

test("the draft's day and time as the Draftboard says it", () => {
  assert.equal(draftWhenLabel("2027-05-21", "21:15"), "Fri, May 21st @ 09:15 PM");
  assert.equal(draftWhenLabel("2027-05-03", "08:05"), "Mon, May 3rd @ 08:05 AM");
  assert.equal(draftWhenLabel("2027-05-03", "00:30"), "Mon, May 3rd @ 12:30 AM");
  assert.equal(draftWhenLabel("2027-05-03", ""), "Mon, May 3rd");
});

test("the Draftboard shows only for a team draft that hasn't started", () => {
  assert.deepEqual(draftBoard(draft(), "2027-05-20T10:00"), { when: "Fri, May 21st @ 09:15 PM", target: "2027-05-21T21:15" });
  assert.equal(draftBoard(draft(), "2027-05-21T21:15"), null, "gone once the draft starts");
  assert.equal(draftBoard(draft({ selection: "Random" }), "2027-05-20T10:00"), null);
  assert.equal(draftBoard(draft({ selection: null }), "2027-05-20T10:00"), null);
  assert.equal(draftBoard(draft({ teamType: null }), "2027-05-20T10:00"), null, "no team competition");
  assert.equal(draftBoard(undefined, "2027-05-20T10:00"), null);
});

test("no draft date yet: the Draftboard shows without a countdown; the clock not known yet still shows it", () => {
  assert.deepEqual(draftBoard(draft({ date: "", time: "" }), "2027-05-20T10:00"), { when: null, target: null });
  assert.deepEqual(draftBoard(draft(), null), { when: "Fri, May 21st @ 09:15 PM", target: "2027-05-21T21:15" });
  assert.deepEqual(draftBoard(draft({ time: "" }), "2027-05-20T10:00"), { when: "Fri, May 21st", target: "2027-05-21T00:00" });
});
