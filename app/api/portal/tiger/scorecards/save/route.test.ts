// app/api/portal/tiger/scorecards/save/route.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/scorecards/save rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/scorecards/save", {
    method: "POST",
    body: JSON.stringify({ tournamentSlug: "2026-palm-springs", playerSlug: "cam-latto", round: 1, holes: [] }),
  });
  await assert.rejects(() => POST(request));
});
