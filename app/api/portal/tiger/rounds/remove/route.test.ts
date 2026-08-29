import { test } from "node:test";
import assert from "node:assert/strict";

// Same limitation as the sibling round route tests: requireHost() needs a real
// request lifecycle, so the one piece that is cheap to cover here is that an
// unauthenticated request never reaches the match box / round deletes.
test("POST /api/portal/tiger/rounds/remove rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/rounds/remove", {
    method: "POST",
    body: JSON.stringify({ round: 1 }),
  });
  await assert.rejects(() => POST(request));
});
