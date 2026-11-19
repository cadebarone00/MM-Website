import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPreferenceChange, DEFAULT_PREFERENCES, preferenceChangeFromBody, preferencesFromRow } from "./preferences";

test("defaults: phone alerts on, emails only for friend requests and trip invites, yards, no tees, simple entry", () => {
  assert.deepEqual(DEFAULT_PREFERENCES.notifications.friendRequests, { push: true, email: true });
  assert.deepEqual(DEFAULT_PREFERENCES.notifications.chat, { push: true, email: false });
  assert.deepEqual([DEFAULT_PREFERENCES.distance, DEFAULT_PREFERENCES.usualTees, DEFAULT_PREFERENCES.scoreEntry], ["yards", "", "simple"]);
  assert.deepEqual(preferencesFromRow(null), DEFAULT_PREFERENCES, "no saved row = the defaults");
});

test("saved rows: database column names or app names; anything odd falls back to the default", () => {
  const prefs = preferencesFromRow({ notifications: { chat: { push: false }, bogus: { push: true } }, distance_unit: "meters", usual_tees: "Purple", score_entry: "full" });
  assert.deepEqual(prefs.notifications.chat, { push: false, email: false });
  assert.deepEqual([prefs.distance, prefs.usualTees, prefs.scoreEntry], ["meters", "", "full"]);
});

test("a change is one known setting; applying it changes only that", () => {
  const ok = preferenceChangeFromBody({ notification: "yourPick", channel: "email", on: true });
  assert.ok(ok.ok);
  const after = applyPreferenceChange(DEFAULT_PREFERENCES, ok.change);
  assert.deepEqual(after.notifications.yourPick, { push: true, email: true });
  assert.deepEqual(after.notifications.chat, DEFAULT_PREFERENCES.notifications.chat);
  assert.deepEqual(preferenceChangeFromBody({ usualTees: "" }), { ok: true, change: { usualTees: "" } });
  for (const body of [null, {}, { notification: "spam", channel: "push", on: true }, { notification: "chat", channel: "push", on: 1 }, { distance: "feet" }, { usualTees: "Purple" }, { scoreEntry: "pro" }]) {
    assert.equal(preferenceChangeFromBody(body).ok, false, JSON.stringify(body));
  }
});
