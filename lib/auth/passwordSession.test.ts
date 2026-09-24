import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_LINK_ERROR, preparePasswordSession } from "./passwordSession";

test("invite fragment is cleared before tokens are posted for cookie creation", async () => {
  let cleared = false;
  await preparePasswordSession("https://example.com/reset-password#access_token=access&refresh_token=refresh&type=invite", () => { cleared = true; }, async (url, init) => {
    assert.equal(cleared, true);
    assert.equal(url, "/api/auth/password-session");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { access_token: "access", refresh_token: "refresh" });
    return new Response("{}", { status: 200 });
  });
});

test("PKCE completion and direct visits check the server session", async () => {
  await preparePasswordSession("https://example.com/reset-password", () => assert.fail("no fragment"), async (_url, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(init?.body, undefined);
    return new Response("{}", { status: 200 });
  });
});

test("expired links and incomplete tokens cannot fall back to another signed-in account", async () => {
  for (const suffix of ["?error=invalid_link", "#error=access_denied&error_code=otp_expired", "#access_token=partial"]) {
    await assert.rejects(preparePasswordSession(`https://example.com/reset-password${suffix}`, () => {}, async () => {
      assert.fail("must not use an existing session for a failed link");
    }), { message: PASSWORD_LINK_ERROR });
  }
});

test("missing or rejected sessions block password setup", async () => {
  for (const suffix of ["", "#access_token=bad&refresh_token=bad"]) {
    await assert.rejects(preparePasswordSession(`https://example.com/reset-password${suffix}`, () => {}, async () => new Response("{}", { status: 401 })), { message: PASSWORD_LINK_ERROR });
  }
});
