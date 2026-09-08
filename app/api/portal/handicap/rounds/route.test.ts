// app/api/portal/handicap/rounds/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("GET /api/portal/handicap/rounds rejects when requirePlayer resolves null", async () => {
  const { GET } = await import("./route.ts");
  await assert.rejects(() => GET());
});

test("POST /api/portal/handicap/rounds rejects when requirePlayer resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/handicap/rounds", {
    method: "POST",
    body: JSON.stringify({ courseId: "c1", teeSetId: "t1", datePlayed: "2026-09-07", teeTime: null, holes: [] }),
  });
  await assert.rejects(() => POST(request));
});
