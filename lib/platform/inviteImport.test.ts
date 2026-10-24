import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteRows } from "./inviteImport.ts";

test("invite file: reads Name / Email / Handicap by header, flags rows that can't be used", () => {
  const rows = [
    { "Player Name": "Jordan Smith", "E-mail": "Jordan@Example.com ", HCP: "8.4" },
    { "Player Name": "", "E-mail": "", HCP: "" },
    { "Player Name": "No Email", "E-mail": "nope", HCP: "3" },
    { "Player Name": "Plus Man", "E-mail": "plus@example.com", HCP: "+2" },
    { "Player Name": "Twice", "E-mail": "jordan@example.com", HCP: "4" },
    { "Player Name": "No Hcp", "E-mail": "nohcp@example.com", HCP: "" },
  ];
  const net = inviteRows(rows, true);
  assert.deepEqual(net.invites, [{ name: "Jordan Smith", email: "jordan@example.com", handicap: 8.4 }, { name: "Plus Man", email: "plus@example.com", handicap: -2 }]);
  assert.deepEqual(net.problems.map((p) => p.row), [4, 6, 7]);
  // Gross: no handicap needed.
  assert.equal(inviteRows(rows, false).invites.length, 3);
  assert.deepEqual(inviteRows([{ Name: "A" }], false).missing, ["Email"]);
  assert.deepEqual(inviteRows([{ Name: "A", Email: "a@b.co" }], true).missing, ["Handicap"]);
});
