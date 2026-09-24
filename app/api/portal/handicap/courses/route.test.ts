// app/api/portal/handicap/courses/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/handicap/courses rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  await assert.rejects(() => GET());
});
