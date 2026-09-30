import { test } from "node:test";
import assert from "node:assert/strict";
import { exportTable, listTables, tablesFromOpenApi, type Fetcher } from "./tableBackup.ts";

/** A fake Supabase REST API holding `rows` rows in table "scores". */
function fakeApi(rows: number, options: { lie?: boolean; fail?: boolean } = {}) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetcher: Fetcher = async (url, init) => {
    requests.push({ url, headers: init.headers });
    const respond = (status: number, body: unknown, range?: string) => ({
      ok: status < 300,
      status,
      headers: { get: (name: string) => (name === "content-range" ? range ?? null : null) },
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    if (options.fail) return respond(401, { message: "bad key" });
    if (url.endsWith("/rest/v1/")) {
      return respond(200, { definitions: {
        scores: { properties: { id: { description: "Note:\nThis is a Primary Key.<pk/>" }, value: {} } },
        notes: { properties: { a: {}, b: {} } },
      } });
    }
    const [from, to] = init.headers.Range.split("-").map(Number);
    const total = options.lie ? rows + 1 : rows;
    if (from >= rows && rows > 0) return respond(416, {}, `*/${total}`);
    const page = Array.from({ length: Math.max(0, Math.min(to, rows - 1) - from + 1) }, (_, i) => ({ id: from + i }));
    return respond(206, page, `${from}-${from + page.length - 1}/${total}`);
  };
  return { fetcher, requests };
}

test("lists tables and sorts pages by primary key (or every column when there is none)", async () => {
  const { fetcher } = fakeApi(0);
  assert.deepEqual(await listTables(fetcher, "https://x.supabase.co", "key"), [
    { name: "notes", orderBy: ["a", "b"] },
    { name: "scores", orderBy: ["id"] },
  ]);
  assert.deepEqual(tablesFromOpenApi(null), []);
});

test("exports every row across pages, including an exactly-full last page and an empty table", async () => {
  for (const count of [0, 5, 1000, 2000, 2500]) {
    const { fetcher, requests } = fakeApi(count);
    const result = await exportTable(fetcher, "https://x.supabase.co", "key", { name: "scores", orderBy: ["id"] });
    assert.equal(result.rows.length, count, `${count} rows`);
    assert.deepEqual(result.rows.map((row) => (row as { id: number }).id), Array.from({ length: count }, (_, i) => i));
    assert.ok(requests.every((r) => r.url.includes("order=id.asc") && r.headers.Authorization === "Bearer key"));
  }
});

test("refuses to report success when rows are missing or the key is rejected", async () => {
  await assert.rejects(exportTable(fakeApi(1500, { lie: true }).fetcher, "https://x", "key", { name: "scores", orderBy: ["id"] }), /Backup is incomplete/);
  await assert.rejects(exportTable(fakeApi(10, { fail: true }).fetcher, "https://x", "key", { name: "scores", orderBy: ["id"] }), /HTTP 401/);
  await assert.rejects(listTables(fakeApi(10, { fail: true }).fetcher, "https://x", "key"), /Could not list tables/);
});
