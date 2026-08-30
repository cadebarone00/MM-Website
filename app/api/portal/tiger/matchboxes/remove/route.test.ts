import { test } from "node:test";
import assert from "node:assert/strict";

test("POST /api/portal/tiger/matchboxes/remove rejects when requireHost resolves null", async () => {
  const { POST } = await import("./route.ts");
  const request = new Request("http://localhost/api/portal/tiger/matchboxes/remove", {
    method: "POST",
    body: JSON.stringify({ id: "00000000-0000-0000-0000-000000000000" }),
  });
  await assert.rejects(() => POST(request));
});
