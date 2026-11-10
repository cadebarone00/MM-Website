import { test } from "node:test";
import assert from "node:assert/strict";
import { AGE_PASS_COOKIE, ageCheckInputFromBody, agePassFrom, agePassHash, newAgePass } from "./agePass.ts";

const TODAY = { year: 2026, month: 10, day: 30 };

test("13th birthday today is eligible; the day before is not; 29 Feb counts as 1 Mar", () => {
  assert.deepEqual(ageCheckInputFromBody({ birthdate: "2013-10-30" }, TODAY), { ok: true, birthdate: "2013-10-30", eligible: true, app: false });
  assert.equal((ageCheckInputFromBody({ birthdate: "2013-10-31" }, TODAY) as { eligible: boolean }).eligible, false);
  assert.equal((ageCheckInputFromBody({ birthdate: "2012-02-29" }, { year: 2025, month: 2, day: 28 }) as { eligible: boolean }).eligible, false);
  assert.equal((ageCheckInputFromBody({ birthdate: "2012-02-29" }, { year: 2025, month: 3, day: 1 }) as { eligible: boolean }).eligible, true);
});

test("bad dates are refused without saying anything about age", () => {
  for (const birthdate of ["", "2013-02-30", "13/10/2013", "1899-12-31", 20131030, null]) {
    assert.equal(ageCheckInputFromBody({ birthdate }, TODAY).ok, false, String(birthdate));
  }
  assert.deepEqual(ageCheckInputFromBody({ birthdate: "2030-01-01" }, TODAY), { ok: false, error: "That date is in the future." });
  assert.equal((ageCheckInputFromBody({ birthdate: "2000-01-01", client: "app" }, TODAY) as { app: boolean }).app, true);
});

test("a pass is 32 random bytes; only its SHA-256 is stored", () => {
  const a = newAgePass(), b = newAgePass();
  assert.match(a.nonce, /^[0-9a-f]{64}$/);
  assert.notEqual(a.nonce, b.nonce);
  assert.equal(a.nonceHash, agePassHash(a.nonce));
  assert.notEqual(a.nonceHash, a.nonce);
});

test("the pass comes from the app body or the website cookie, and must look like a pass", () => {
  const { nonce } = newAgePass();
  assert.equal(agePassFrom({ agePass: nonce }, undefined), nonce);
  assert.equal(agePassFrom({}, nonce), nonce);
  assert.equal(agePassFrom({ agePass: "not-a-pass" }, nonce), null, "a bad body value is not rescued by the cookie");
  assert.equal(agePassFrom({}, "abc"), null);
  assert.equal(agePassFrom({}, undefined), null);
  assert.equal(AGE_PASS_COOKIE, "maroon_age_pass");
});
