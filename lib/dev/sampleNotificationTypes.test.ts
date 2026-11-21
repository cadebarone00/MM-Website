import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTIFICATION_KINDS } from "../notifications/catalog.ts";
import { sampleNotesForType, sheetCounts } from "./sampleNotificationTypes.ts";

test("every type previews in three wordings, blanks filled, chosen one newest and unread", () => {
  for (const kind of NOTIFICATION_KINDS) {
    for (const wording of [1, 2, 3] as const) {
      const notes = sampleNotesForType(kind, wording);
      assert.equal(notes.length, 3, kind);
      assert.equal(notes[0].id, `${kind}-v${wording}`);
      assert.equal(notes[0].read, false);
      for (const note of notes) assert.ok(!/[{}]/.test(note.title + note.body + note.link), `${kind}: ${note.title} / ${note.body}`);
    }
  }
});

test("sheet-worded types count their Highlights rules", () => {
  assert.ok(sheetCounts("highlight").rules >= 50);
  assert.ok(sheetCounts("travel").rules >= 20);
  assert.equal(sheetCounts("announcement").rules, 1);
});

test("alerts that aren't about a trip carry no trip name (friend request)", () => {
  for (const note of sampleNotesForType("friendRequest")) assert.equal(note.groupName, "");
  for (const note of sampleNotesForType("invited")) assert.equal(note.groupName, "Desert Classic");
});
