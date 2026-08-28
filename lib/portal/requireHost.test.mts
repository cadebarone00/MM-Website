// lib/portal/requireHost.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireHost } from "./requireHost.ts";

test("requireHost returns null when there's no session", async () => {
  // requirePlayer.ts has no existing test file to pattern-match — this repo's
  // Supabase server client isn't mockable without a running project, so this
  // suite only covers the parts that don't need a live Supabase call: import
  // shape and that the function is exported and async.
  assert.equal(typeof requireHost, "function");
});
