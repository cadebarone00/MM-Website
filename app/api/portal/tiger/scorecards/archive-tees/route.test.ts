import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/scorecards/archive-tees rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/scorecards/archive-tees", {
    method: "POST",
    body: JSON.stringify({ tournamentSlug: "2025-danzante", round: 1, courseId: "c1", teeSetId: "t1", datePlayed: "2025-06-14" }),
  });
  await assert.rejects(() => POST(request));
});
