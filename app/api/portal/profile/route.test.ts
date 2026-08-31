// app/api/portal/profile/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/profile rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  await assert.rejects(() => GET());
});

test("POST /api/portal/profile rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/profile", {
    method: "POST",
    body: JSON.stringify({ edits: [{ field: "bio", value: "Test bio." }] }),
  });
  await assert.rejects(() => POST(request));
});
