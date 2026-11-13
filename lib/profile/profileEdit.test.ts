import { test } from "node:test";
import assert from "node:assert/strict";
import { linkLabel, normalizeLinkUrl, profileEditFromBody, profileHref, profileLinksFromBody, profileLinksFromRows, profileSetupFromBody, usernameProblem } from "./profileEdit";

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
  for (const [body, field] of [[{}, "body"], [{ id: "x" }, "body"], [{ displayName: "" }, "displayName"], [{ username: "a b" }, "username"], [{ bio: "x".repeat(151) }, "bio"], [{ bio: "a\nb\nc\nd" }, "bio"], [{ bio: 5 }, "bio"]] as const) {
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

test("bio: 3 lines and 150 characters at most; typing past that is trimmed", async () => {
  const { limitBio, bioProblem } = await import("./profileEdit.ts");
  assert.equal(bioProblem("one\ntwo\nthree"), null);
  assert.equal(bioProblem("x".repeat(150)), null);
  assert.match(String(bioProblem("1\n2\n3\n4")), /3 lines/);
  assert.equal(limitBio("1\n2\n3\n4\n5"), "1\n2\n34 5");
  assert.equal(limitBio("x".repeat(200)).length, 150);
});

test("edit takes gender (Man / Woman / Prefer not to say, or empty to clear) and refuses anything else", () => {
  assert.deepEqual(profileEditFromBody({ gender: "woman" }), { ok: true, input: { gender: "woman" } });
  assert.deepEqual(profileEditFromBody({ gender: "" }), { ok: true, input: { gender: "" } });
  for (const gender of ["robot", "Man", null, 3]) {
    const r = profileEditFromBody({ gender });
    assert.equal(!r.ok && r.field, "gender", String(gender));
  }
});

test("links: up to 5, title + https address; bare addresses get https://, http and other schemes are refused", () => {
  assert.equal(normalizeLinkUrl(" instagram.com/me "), "https://instagram.com/me");
  assert.equal(normalizeLinkUrl("https://x.com"), "https://x.com");
  assert.deepEqual(profileLinksFromBody({ links: [{ title: " IG ", url: "instagram.com/me" }] }), { ok: true, links: [{ title: "IG", url: "https://instagram.com/me" }] });
  assert.deepEqual(profileLinksFromBody({ links: [] }), { ok: true, links: [] });
  for (const body of [null, { links: "x" }, { links: [{ title: "A" }] }, { links: [{ title: "", url: "a.com" }] }, { links: [{ title: "A", url: "http://a.com" }] },
    { links: [{ title: "A", url: "javascript:alert(1)" }] }, { links: [{ title: "x".repeat(41), url: "a.com" }] }, { links: [{ title: "A", url: "has space.com" }] },
    { links: Array.from({ length: 6 }, (_, i) => ({ title: `L${i}`, url: `${i}.com` })) }]) {
    assert.equal(profileLinksFromBody(body).ok, false, JSON.stringify(body));
  }
  // Read back: anything malformed is dropped, never shown.
  assert.deepEqual(profileLinksFromRows([{ title: "A", url: "https://a.com" }, { title: "B", url: "javascript:x" }, null]), [{ title: "A", url: "https://a.com" }]);
  assert.equal(linkLabel("https://a.com/"), "a.com");
});
