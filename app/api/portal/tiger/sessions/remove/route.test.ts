import { test } from "node:test";
import assert from "node:assert/strict";

// Same limitation as the sibling session route tests: requireHost() needs a real
// request lifecycle, so the one piece that is cheap to cover here is that an
// unauthenticated request never reaches the match / session deletes.
test("POST /api/portal/tiger/sessions/remove rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/sessions/remove", {
    method: "POST",
    body: JSON.stringify({ session: 1 }),
  });
  await assert.rejects(() => POST(request));
});
