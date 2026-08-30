import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/scoring/state rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/state?round=1");
  await assert.rejects(() => GET(request));
});
