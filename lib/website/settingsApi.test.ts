import { test } from "node:test";
import assert from "node:assert/strict";
import { saveWebsiteSetting } from "./settingsApi.ts";

const request = (body: string) => new Request("https://example.test/api/portal/tiger/website-settings", { method: "POST", body });

test("anonymous and non-host sessions cannot write even with a forged host claim", async () => {
  let writes = 0;
  const response = await saveWebsiteSetting(request(JSON.stringify({ section: "home", year: 2028, is_host: true })), {
    authorize: async () => null, write: async () => { writes++; return true; },
  });
  assert.equal(response.status, 401);
  assert.equal(writes, 0);
});

test("malformed JSON and invalid settings never reach storage", async () => {
  for (const body of ["{", '{"section":"portal","year":2034}', '{"section":"scores","year":2027}']) {
    const response = await saveWebsiteSetting(request(body), { authorize: async () => ({ userId: "tiger" }), write: async () => { assert.fail("Unexpected write"); } });
    assert.equal(response.status, 400);
  }
});

test("both interfaces write only the addressed section and can restore Automatic", async () => {
  const rows = new Map<string, number | null>([["leaderboard", 2026]]);
  for (const year of [2028, null]) {
    const response = await saveWebsiteSetting(request(JSON.stringify({ section: "portal", year, userId: "forged" })), {
      authorize: async () => ({ userId: "tiger" }),
      write: async (change, userId) => { assert.equal(userId, "tiger"); rows.set(change.section, change.year); return true; },
    });
    assert.equal(response.status, 200);
    assert.equal(rows.get("portal"), year);
    assert.equal(rows.get("leaderboard"), 2026);
  }
});

test("storage failure does not report a successful live change", async () => {
  const response = await saveWebsiteSetting(request('{"section":"home","year":2027}'), { authorize: async () => ({ userId: "tiger" }), write: async () => false });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).ok, undefined);
});
