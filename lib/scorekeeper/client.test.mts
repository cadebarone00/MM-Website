// lib/scorekeeper/client.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LIVE_FEED_URL = "https://example.com/exec";
process.env.SCOREKEEPER_SERVER_SECRET = "test-secret";

const { getPlayerRounds, submitHoleAsPlayer, getHostData, startRound } = await import("./client.ts");

function mockFetchOnce(response: unknown) {
  (globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response(JSON.stringify(response), { status: 200 })) as typeof fetch;
}

test("getPlayerRounds posts playerGetRounds with the server secret and player name, returns ok:true on valid:true", async () => {
  let capturedBody: unknown = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ valid: true, player: "Kyle Schnabel", rounds: [] }), { status: 200 });
  }) as typeof fetch;

  const result = await getPlayerRounds("Kyle Schnabel");

  assert.deepEqual(capturedBody, {
    type: "playerGetRounds",
    serverSecret: "test-secret",
    player: "Kyle Schnabel",
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.rounds, []);
});

test("getPlayerRounds returns ok:false when the backend returns valid:false", async () => {
  mockFetchOnce({ valid: false, error: "Unauthorized." });
  const result = await getPlayerRounds("Kyle Schnabel");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "Unauthorized.");
});

test("getPlayerRounds returns ok:false when the network call throws", async () => {
  (globalThis as { fetch: typeof fetch }).fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const result = await getPlayerRounds("Kyle Schnabel");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /Could not reach/);
});

test("submitHoleAsPlayer posts fir/gir as booleans converted from the caller's boolean args", async () => {
  let capturedBody: unknown = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ saved: true, player: "Kyle Schnabel", round: 1, hole: 4 }), { status: 200 });
  }) as typeof fetch;

  const result = await submitHoleAsPlayer("Kyle Schnabel", 1, "self", 4, 5, 2, true, false);

  assert.deepEqual(capturedBody, {
    type: "playerSubmitHole",
    serverSecret: "test-secret",
    player: "Kyle Schnabel",
    round: 1,
    target: "self",
    hole: 4,
    score: 5,
    putts: 2,
    fir: true,
    gir: false,
  });
  assert.equal(result.ok, true);
});

test("submitHoleAsPlayer returns ok:false on saved:false", async () => {
  mockFetchOnce({ saved: false, error: "This round hasn't been started by the host yet." });
  const result = await submitHoleAsPlayer("Kyle Schnabel", 1, "self", 4, 5, 2, true, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "This round hasn't been started by the host yet.");
});

test("getHostData returns ok:false with a clear message when LIVE_FEED_URL is unset", async () => {
  const prev = process.env.LIVE_FEED_URL;
  delete process.env.LIVE_FEED_URL;
  const result = await getHostData();
  process.env.LIVE_FEED_URL = prev;
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /not configured/);
});

test("startRound posts hostStartRound with round as a number", async () => {
  let capturedBody: unknown = null;
  (globalThis as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, round: 3 }), { status: 200 });
  }) as typeof fetch;

  await startRound(3);

  assert.deepEqual(capturedBody, { type: "hostStartRound", serverSecret: "test-secret", round: 3 });
});
