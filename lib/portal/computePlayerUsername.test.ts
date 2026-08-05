import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlayerUsername } from "./computePlayerUsername";

test("computes MM + first3 + last3 uppercase", () => {
  assert.equal(computePlayerUsername("Collin Ross"), "MMCOLROS");
});

test("handles a first name shorter than 3 letters without padding", () => {
  assert.equal(computePlayerUsername("Cam Latto"), "MMCAMLAT");
});

test("uses the last whitespace-separated token as the last name", () => {
  assert.equal(computePlayerUsername("Nate Wojciechowski"), "MMNATWOJ");
});
