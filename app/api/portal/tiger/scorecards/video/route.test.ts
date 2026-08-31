// app/api/portal/tiger/scorecards/video/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/scorecards/video rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/scorecards/video", { method: "POST", body: new FormData() });
  await assert.rejects(() => POST(request));
});
