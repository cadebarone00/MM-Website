import test from "node:test";
import assert from "node:assert/strict";
import { providerNameParts } from "./providerName";

test("Google: given / family names win", () => {
  assert.deepEqual(providerNameParts({ given_name: "Alex", family_name: "Smith", full_name: "Alexander Smith" }), { first: "Alex", last: "Smith" });
});
test("Apple (first sign-in): full_name split into first + the rest", () => {
  assert.deepEqual(providerNameParts({ full_name: "  Mary  Jo   Watson " }), { first: "Mary", last: "Jo Watson" });
  assert.deepEqual(providerNameParts({ name: "Cher" }), { first: "Cher", last: "" });
});
test("no name (Apple later sign-ins, email accounts) or an email in the name field: nothing prefilled", () => {
  assert.deepEqual(providerNameParts({}), { first: "", last: "" });
  assert.deepEqual(providerNameParts(null), { first: "", last: "" });
  assert.deepEqual(providerNameParts({ name: "abc@privaterelay.appleid.com" }), { first: "", last: "" });
  assert.deepEqual(providerNameParts({ full_name: 42 }), { first: "", last: "" });
});
