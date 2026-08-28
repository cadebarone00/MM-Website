// lib/scorekeeper/pythonClient.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { callPythonApi } from "./pythonClient.ts";

test("callPythonApi posts to PYTHON_API_URL + path with the secret merged in", async () => {
  process.env.PYTHON_API_URL = "https://example.test";
  process.env.PYTHON_API_SECRET = "test-secret";
  let capturedUrl = "";
  let capturedBody: unknown;
  (globalThis as { fetch: typeof fetch }).fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body as string);
    return new Response(JSON.stringify({ ok: true, value: 42 }), { status: 200 });
  }) as typeof fetch;

  const result = await callPythonApi<{ ok: boolean; value: number }>("/player-whoami", { player: "Cade" });

  assert.equal(capturedUrl, "https://example.test/player-whoami");
  assert.deepEqual(capturedBody, { player: "Cade", secret: "test-secret" });
  assert.deepEqual(result, { ok: true, value: 42 });
});

test("callPythonApi throws when PYTHON_API_URL is not configured", async () => {
  delete process.env.PYTHON_API_URL;
  process.env.PYTHON_API_SECRET = "test-secret";

  await assert.rejects(() => callPythonApi("/player-whoami", { player: "Cade" }), /not configured/);
});

test("callPythonApi throws on a non-2xx response", async () => {
  process.env.PYTHON_API_URL = "https://example.test";
  process.env.PYTHON_API_SECRET = "test-secret";
  (globalThis as { fetch: typeof fetch }).fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;

  await assert.rejects(() => callPythonApi("/player-whoami", { player: "Cade" }), /500/);
});
