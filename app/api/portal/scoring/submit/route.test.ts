import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/scoring/submit rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/scoring/submit", {
    method: "POST",
    body: JSON.stringify({ round: 1 }),
  });
  await assert.rejects(() => POST(request));
});
