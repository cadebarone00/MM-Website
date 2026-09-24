import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/profile-edits/set rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/profile-edits/set", {
    method: "POST",
    body: JSON.stringify({ playerSlug: "test-player", field: "bio", value: "New bio." }),
  });
  await assert.rejects(() => POST(request));
});
