import { test } from "node:test";
import assert from "node:assert/strict";
import { placeholderUsername, shownUsername } from "./playerUsername";

test("placeholder usernames: name + a 2-digit number, the same every time", () => {
  const first = placeholderUsername("Cade Barone");
  assert.match(first, /^cadebarone\d{2}$/);
  assert.equal(placeholderUsername("Cade Barone"), first);
  assert.match(placeholderUsername("S. Patel"), /^spatel\d{2}$/);
  assert.match(placeholderUsername("!!!"), /^player\d{2}$/);
});

test("shown username: the real one wins, otherwise the placeholder", () => {
  assert.equal(shownUsername("Cade Barone", "cade"), "@cade");
  assert.equal(shownUsername("Cade Barone", null), `@${placeholderUsername("Cade Barone")}`);
  assert.equal(shownUsername("Cade Barone", ""), `@${placeholderUsername("Cade Barone")}`);
});
