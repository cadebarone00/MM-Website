import { test } from "node:test";
import assert from "node:assert/strict";
import { signOutWebsite } from "./signOut";

test("website sign out uses existing endpoint and returns only the fixed login destination", async () => {
  const request = (async (path, options) => {
    assert.equal(path, "/api/auth/signout");
    assert.equal(options?.method, "POST");
    assert.equal(options?.body, "{}");
    return Response.json({ ok: true });
  }) as typeof fetch;
  assert.equal(await signOutWebsite(request), "/login/email?next=%2Fdashboard");
});
test("failed sign out never signals navigation or pretends the session ended", async () => {
  for (const response of [Response.json({ ok: false }), Response.json({ ok: false }, { status: 503 })]) await assert.rejects(signOutWebsite((async () => response) as typeof fetch));
  await assert.rejects(signOutWebsite((async () => { throw new Error("network"); }) as typeof fetch));
});
