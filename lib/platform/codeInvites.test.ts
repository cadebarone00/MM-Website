import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanInviteCode, codeInviteEmail, emailsFrom, isInviteCode, joinPath } from "./codeInvites.ts";
import { tripJoinValue } from "./golfTripJoinLinks.ts";

test("each kind's code opens its own Join page", () => {
  assert.equal(joinPath("round", "K7Q4MZ"), "/rounds/join?code=K7Q4MZ");
  assert.equal(joinPath("trip", "K7Q4MZ"), "/golf-trips/join/K7Q4MZ");
  assert.equal(joinPath("tourney", "K7Q4MZ"), "/tournaments/code/join?code=K7Q4MZ");
  assert.equal(joinPath("league", "K7Q4MZ"), "/leagues/join?code=K7Q4MZ");
  assert.equal(cleanInviteCode(" k7q-4mz "), "K7Q4MZ");
  assert.ok(isInviteCode("K7Q4MZ"));
  for (const bad of ["K7Q4M", "K7Q4MZZ", "O7Q4MZ", "k7q4mz", "", null]) assert.ok(!isInviteCode(bad), String(bad));
});

test("email addresses: commas, spaces or new lines between them; duplicates and non-emails dropped; up to 50", () => {
  assert.deepEqual(emailsFrom("A@x.com, b@y.org\nc@z.io;  a@x.com  not-an-email @nope"), ["a@x.com", "b@y.org", "c@z.io"]);
  assert.equal(emailsFrom(Array.from({ length: 60 }, (_, i) => `p${i}@x.com`).join(",")).length, 50);
  assert.deepEqual(emailsFrom(""), []);
});

test("the email: who invited you, the code in big letters, a Join button to this kind's page; names are escaped", () => {
  const email = codeInviteEmail("league", { name: "Thursday <League>", code: "LG7K2Q", sender: "Cam" }, "https://themaroon.site");
  assert.equal(email.subject, "Cam invited you to Thursday <League> on The Maroon");
  assert.match(email.html, /LG7-K2Q/);
  assert.match(email.html, /https:\/\/themaroon\.site\/leagues\/join\?code=LG7K2Q/);
  assert.match(email.html, /Thursday &lt;League&gt;/);
  assert.ok(!email.html.includes("<League>"));
  assert.match(email.text, /Your code: LG7-K2Q/);
  assert.match(email.text, /go to Leagues and enter the code/);
  assert.match(codeInviteEmail("round", { name: "Pebble", code: "K7Q4MZ", sender: null }, "https://x.site").subject, /^Someone invited you/);
});

test("the trip's join page takes the 30-minute link's code or the 6-character code, typed any way", () => {
  const link = "a".repeat(32);
  assert.equal(tripJoinValue(link), link);
  assert.equal(tripJoinValue("k7q-4mz"), "K7Q4MZ");
  assert.equal(tripJoinValue("K7Q4MZ"), "K7Q4MZ");
  for (const bad of ["", null, undefined, "short", "O0O0O0"]) assert.equal(tripJoinValue(bad), null, String(bad));
});
