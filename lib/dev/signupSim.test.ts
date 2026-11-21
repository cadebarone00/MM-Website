import { test } from "node:test";
import assert from "node:assert/strict";
import { SIM_CODE, SIM_WRONG_CODE, newSimState, simHandle, type SimState } from "./signupSim.ts";
import { WRONG_CODE } from "../auth/verifyCode.ts";

/** Runs requests in order, like the screens do, and returns every answer plus the final state. */
function run(state: SimState, steps: [string, string, Record<string, unknown> | null][]) {
  const answers = [];
  for (const [method, path, body] of steps) { const a = simHandle(method, path, body, state); state = a.state; answers.push(a); }
  return { answers, state };
}
const EMAIL = "sim-1234@example.test";

test("new person: the whole path to Finish, with the real resume order (code, then password, then Name…)", () => {
  const { answers, state } = run(newSimState("new"), [
    ["POST", "/api/auth/signup", { email: EMAIL, next: "/onboarding" }],
    ["POST", "/api/auth/verify-code", { email: EMAIL, code: SIM_CODE, type: "signup" }],
    ["GET", "/api/account/onboarding", null],
    ["POST", "/api/auth/create-password", { password: "a long passphrase" }],
    ["GET", "/api/account/onboarding", null],
    ["POST", "/api/account/profile", { displayName: "Sim Person", username: "simperson" }],
    ["POST", "/api/account/birthday", { birthdate: "1990-06-15" }],
    ["POST", "/api/account/photo", null],
    ["PUT", "/api/account/privacy", { visibility: "private" }],
    ["GET", "/api/account/terms", null],
    ["POST", "/api/account/terms", { termsVersion: "simulation", privacyVersion: "simulation" }],
    ["POST", "/api/account/finish", null],
  ]);
  assert.deepEqual(answers.map((a) => a.status), [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]);
  assert.equal(answers[2].json.next, "password");
  assert.equal(answers[4].json.next, "name_username");
  assert.equal(answers[6].json.eligible, true);
  assert.equal(answers[11].json.activated, true);
  assert.equal(state.finished, true);
});

test("the real rules still apply: bad email, short password, bad username, future birthday", () => {
  let s = newSimState("new");
  assert.equal(simHandle("POST", "/api/auth/signup", { email: "nope" }, s).status, 400);
  s = run(s, [["POST", "/api/auth/signup", { email: EMAIL }], ["POST", "/api/auth/verify-code", { email: EMAIL, code: SIM_CODE }]]).state;
  assert.equal(simHandle("POST", "/api/auth/create-password", { password: "short" }, s).status, 400);
  assert.equal(simHandle("POST", "/api/account/profile", { displayName: "A", username: "a b!" }, s).status, 400);
  assert.equal(simHandle("POST", "/api/account/birthday", { birthdate: "2999-01-01" }, s).status, 400);
  assert.equal(simHandle("POST", "/api/account/finish", null, s).json.code, "incomplete");
});

test("email already has an account: 409 account_exists and nothing remembered", () => {
  const a = simHandle("POST", "/api/auth/signup", { email: "taken@example.test" }, newSimState("exists"));
  assert.equal(a.status, 409);
  assert.equal(a.json.code, "account_exists");
  assert.equal(a.state.email, null);
});

test("wrong code first: the first try is refused even when right; then the right code works", () => {
  const s = simHandle("POST", "/api/auth/signup", { email: EMAIL }, newSimState("wrong-code")).state;
  const first = simHandle("POST", "/api/auth/verify-code", { email: EMAIL, code: SIM_CODE }, s);
  assert.equal(first.status, 400);
  assert.equal(first.json.error, WRONG_CODE, "same words as the real server");
  const second = simHandle("POST", "/api/auth/verify-code", { email: EMAIL, code: SIM_CODE }, first.state);
  assert.equal(second.status, 200);
  assert.equal(simHandle("POST", "/api/auth/verify-code", { email: EMAIL, code: "000000" }, simHandle("POST", "/api/auth/signup", { email: EMAIL }, newSimState("new")).state).status, 400);
});

test("under 13: birthday answers not eligible and resume says ineligible", () => {
  const s = run(newSimState("under13"), [
    ["POST", "/api/auth/signup", { email: EMAIL }], ["POST", "/api/auth/verify-code", { email: EMAIL, code: SIM_CODE }],
    ["POST", "/api/auth/create-password", { password: "a long passphrase" }], ["POST", "/api/account/profile", { displayName: "Kid", username: "kidsim" }],
  ]).state;
  const year = new Date().getUTCFullYear() - 5;
  const b = simHandle("POST", "/api/account/birthday", { birthdate: `${year}-01-01` }, s);
  assert.equal(b.json.eligible, false);
  assert.equal(simHandle("GET", "/api/account/onboarding", null, b.state).json.next, "ineligible");
});

test("anything the simulation doesn't cover is a 404, never a pretend success", () => {
  assert.equal(simHandle("POST", "/api/account/delete", null, newSimState("new")).status, 404);
  assert.equal(SIM_WRONG_CODE, WRONG_CODE);
});
