import { test } from "node:test";
import assert from "node:assert/strict";
import { profileEditFromBody, profileHref, profileSetupFromBody, usernameProblem } from "./profileEdit";

test("finish setup needs a name and a username in the right shape", () => {
  assert.deepEqual(profileSetupFromBody({ displayName: " Sam ", username: " samfresh ", playerSlug: "x" }), { ok: true, input: { displayName: "Sam", username: "samfresh" } });
  for (const [body, field] of [[null, "body"], [{ username: "samfresh" }, "displayName"], [{ displayName: "Sam", username: "s" }, "username"], [{ displayName: "Sam", username: "sam fresh" }, "username"]] as const) {
    const r = profileSetupFromBody(body);
    assert.equal(!r.ok && r.field, field, JSON.stringify(body));
  }
});

test("edit takes only name / username / bio, each optional; anything else is ignored", () => {
  assert.deepEqual(profileEditFromBody({ bio: "  Hi  ", id: "x", playerSlug: "y", memberSince: "z" }), { ok: true, input: { bio: "Hi" } });
  assert.deepEqual(profileEditFromBody({ displayName: "Cade", username: "cade.b" }), { ok: true, input: { displayName: "Cade", username: "cade.b" } });
  for (const [body, field] of [[{}, "body"], [{ id: "x" }, "body"], [{ displayName: "" }, "displayName"], [{ username: "a b" }, "username"], [{ bio: "x".repeat(1001) }, "bio"], [{ bio: 5 }, "bio"]] as const) {
    const r = profileEditFromBody(body);
    assert.equal(!r.ok && r.field, field, JSON.stringify(body));
  }
});

test("usernames and profile links", () => {
  assert.equal(usernameProblem("cade_b.2"), null);
  assert.match(usernameProblem(".cade") ?? "", /3–30/);
  assert.equal(profileHref("Cade.B"), "/profile/Cade.B");
  assert.equal(profileHref(null), null, "no username (an invitation, an unclaimed player) = no link");
  assert.equal(profileHref("  "), null);
});
