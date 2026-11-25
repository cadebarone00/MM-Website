import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseTournamentInviteSpreadsheet } from "./inviteSpreadsheet.ts";
test("spreadsheet preview uses shared net and duplicate validation", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Name: "Alex", Email: "alex@example.test", Handicap: "12.4" }, { Name: "Duplicate", Email: "alex@example.test", Handicap: "3" }, { Name: "Missing", Email: "b@example.test", Handicap: "" }]), "Players");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = parseTournamentInviteSpreadsheet(new Uint8Array(bytes), true);
  assert.deepEqual(result.invites, [{ name: "Alex", email: "alex@example.test", handicap: 12.4 }]);
  assert.equal(result.problems.length, 2);
});
