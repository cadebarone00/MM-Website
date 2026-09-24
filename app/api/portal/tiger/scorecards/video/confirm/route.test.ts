import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/scorecards/video/confirm rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/scorecards/video/confirm", {
    method: "POST",
    body: JSON.stringify({ tournamentSlug: "2026-palm-springs", playerSlug: "cam-latto", round: 1, hole: 4, shotNumber: 2, extension: ".mp4" }),
  });
  await assert.rejects(() => POST(request));
});
