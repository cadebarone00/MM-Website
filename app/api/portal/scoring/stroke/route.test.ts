import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";

test("legacy stroke autosaves cannot bypass complete-hole submission", async () => {
  const result = await POST();
  assert.equal(result.status, 409);
  assert.match((await result.json()).error, /Submit Score/);
});
