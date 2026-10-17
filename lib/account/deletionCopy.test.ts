import { test } from "node:test";
import assert from "node:assert/strict";
import { deletionSummary, resultMessage, tripOutcomeText } from "./deletionCopy.ts";

test("only 'completed' ever says the account has been deleted", () => {
  for (const state of ["requested", "database_done", "storage_done", "auth_done"] as const) {
    const message = resultMessage(state);
    assert.equal(message.done, false, state);
    assert.doesNotMatch(`${message.title} ${message.body}`, /has been deleted|is deleted|are gone/i, state);
    assert.match(message.title, /closed/);
  }
  assert.equal(resultMessage("completed").done, true);
  assert.match(resultMessage("completed").title, /has been deleted/);
});

test("trip outcomes say exactly what will happen; nobody is promised the role without accepting", () => {
  assert.match(tripOutcomeText({ name: "T", ended: false, outcome: "transfer", handoff: { toName: "Sam", state: "accepted" } }), /Sam accepted/);
  assert.match(tripOutcomeText({ name: "T", ended: true, outcome: "archive", handoff: null }), /archived/);
  const pending = tripOutcomeText({ name: "T", ended: false, outcome: "restrict", handoff: { toName: "Sam", state: "pending" } });
  assert.match(pending, /Waiting for Sam/);
  assert.match(pending, /read-only with no organizer/);
  assert.match(tripOutcomeText({ name: "T", ended: false, outcome: "restrict", handoff: { toName: "Sam", state: "declined" } }), /Sam declined/);
});

test("the summary lists what's deleted and what stays without a name", () => {
  const empty = deletionSummary({ tripsJoined: 0, sharedRoundsHosted: 0, tournamentRoles: 0, legacyPlayer: false, personalRounds: 0, sharedRounds: 0, scorecards: 0, openBets: 0, files: 0 });
  assert.ok(empty.deleted.some((line) => /login/.test(line)));
  assert.deepEqual(empty.kept, []);
  const full = deletionSummary({ tripsJoined: 2, sharedRoundsHosted: 1, tournamentRoles: 1, legacyPlayer: true, personalRounds: 3, sharedRounds: 4, scorecards: 4, openBets: 1, files: 2 });
  assert.ok(full.deleted.includes("2 uploaded files") && full.deleted.includes("3 personal rounds"));
  assert.ok(full.kept.some((line) => /Former member/.test(line)) && full.kept.some((line) => /locked/.test(line)));
});
