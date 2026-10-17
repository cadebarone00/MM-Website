import { test } from "node:test";
import assert from "node:assert/strict";
import { handleDiscard, handleDraftUpload, handlePublish, handleRollback, handleState, rpcFailure, type HighlightAdminDeps } from "./adminApi.ts";
import { draftRowPayload } from "./configRows.ts";
import { buildHighlightDraft } from "./draft.ts";
import { toXlsx, validSheet, variationSheet } from "./sheetFixture.ts";
import type { RawTab } from "./sheetRows.ts";
import { MAX_XLSX_BYTES } from "./xlsxSource.ts";

const SITE = "https://maroon.test";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const DRAFT = "22222222-2222-4222-8222-222222222222";
type Call = { fn: string; args: Record<string, unknown> };

function deps(over: Partial<HighlightAdminDeps> = {}, calls: Call[] = []): HighlightAdminDeps {
  return {
    authorize: async () => ({ status: "ok", userId: ADMIN }),
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "save_highlight_draft") return { data: DRAFT, error: null };
      if (fn === "publish_highlight_draft") return { data: { version: 1, previousVersion: null, changeKind: "behavior" }, error: null };
      if (fn === "rollback_highlight_config") return { data: { version: 1, previousVersion: 2 }, error: null };
      return { data: null, error: null };
    },
    pendingDrafts: async () => ({ data: [], error: null }),
    ...over,
  };
}
const upload = (tabs: RawTab[] | Uint8Array, fields: Record<string, string>, name = "rules.xlsx", origin = SITE) => {
  const form = new FormData();
  form.append("file", new File([Uint8Array.from(tabs instanceof Uint8Array ? tabs : toXlsx(tabs))], name));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return new Request(`${SITE}/api/portal/admin/highlights/drafts`, { method: "POST", body: form, headers: { origin } });
};
const post = (path: string, body: unknown, origin: string | null = SITE) =>
  new Request(`${SITE}/api/portal/admin/highlights/${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" } });
const fingerprintOf = (tabs: RawTab[]) => { const r = buildHighlightDraft({ bytes: toXlsx(tabs), fileName: "rules.xlsx", published: null }); assert.ok(r.ok); return r.draft.file.fingerprint; };

const writes = [
  ["preview", (d: HighlightAdminDeps, origin?: string) => handleDraftUpload(upload(variationSheet(), { action: "preview" }, "rules.xlsx", origin), d)],
  ["save", (d: HighlightAdminDeps, origin?: string) => handleDraftUpload(upload(variationSheet(), { action: "save", expectedFingerprint: fingerprintOf(variationSheet()) }, "rules.xlsx", origin), d)],
  ["publish", (d: HighlightAdminDeps, origin?: string) => handlePublish(post("publish", { draftId: DRAFT, confirmBehavior: true }, origin), d)],
  ["rollback", (d: HighlightAdminDeps, origin?: string) => handleRollback(post("rollback", { targetVersion: 1, expectedVersion: 2 }, origin), d)],
  ["discard", (d: HighlightAdminDeps, origin?: string) => handleDiscard(post("discard", { draftId: DRAFT }, origin), d)],
] as const;

test("every endpoint refuses signed-out (401) and non-admin (403) sessions before touching the database", async () => {
  for (const [status, code] of [["signed-out", 401], ["forbidden", 403]] as const) {
    for (const [name, run] of [...writes, ["state", (d: HighlightAdminDeps) => handleState(d)] as const]) {
      const calls: Call[] = []; let drafts = 0;
      const response = await run(deps({ authorize: async () => ({ status }), pendingDrafts: async () => { drafts++; return { data: [], error: null }; } }, calls));
      assert.equal(response.status, code, `${name} ${status}`);
      assert.deepEqual([calls.length, drafts], [0, 0], `${name} touched the database`);
    }
  }
});

test("cross-site or origin-less writes are refused before even checking the session", async () => {
  for (const [name, run] of writes) {
    for (const origin of ["https://evil.test", "null"]) {
      let asked = 0; const calls: Call[] = [];
      const response = await run(deps({ authorize: async () => { asked++; return { status: "ok", userId: ADMIN }; } }, calls), origin);
      assert.equal(response.status, 403, `${name} from ${origin}`);
      assert.deepEqual([asked, calls.length], [0, 0]);
    }
  }
  assert.equal((await handlePublish(post("publish", { draftId: DRAFT, confirmBehavior: true }, null), deps())).status, 403);
});

test("preview checks the file against the live version and writes nothing; the response never carries the file or full config", async () => {
  const calls: Call[] = [];
  const response = await handleDraftUpload(upload(variationSheet(), { action: "preview" }), deps({}, calls));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(calls.map((c) => c.fn), ["get_active_highlight_config"]);
  const body = await response.json() as { saved: boolean; draft: Record<string, unknown> & { preview: { variationId: string; headline: string }[] } };
  assert.equal(body.saved, false);
  assert.ok(!("config" in body.draft));
  assert.equal(body.draft.preview[0].variationId, "HL-001-C01-V01");
  assert.equal(body.draft.preview[0].headline, "Alex's heating up! 🔥");
});

test("save re-checks the SAME file, refuses errors / no-change / a swapped file, and acts only as the session's user", async () => {
  const calls: Call[] = [];
  const ok = await handleDraftUpload(upload(variationSheet(), { action: "save", expectedFingerprint: fingerprintOf(variationSheet()), p_actor: "forged", userId: "forged" }), deps({}, calls));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json().then((b: { draftId: string }) => b.draftId), DRAFT);
  const save = calls.find((c) => c.fn === "save_highlight_draft")!;
  assert.equal(save.args.p_actor, ADMIN);
  const expected = buildHighlightDraft({ bytes: toXlsx(variationSheet()), fileName: "rules.xlsx", published: null });
  assert.ok(expected.ok);
  assert.deepEqual(save.args.p_draft, draftRowPayload(expected.draft));

  const refused = async (tabs: RawTab[], fingerprint: string, live: unknown = null) => {
    const c: Call[] = [];
    const r = await handleDraftUpload(upload(tabs, { action: "save", expectedFingerprint: fingerprint }), deps({ rpc: async (fn, args) => { c.push({ fn, args }); return { data: fn === "get_active_highlight_config" ? live : null, error: null }; } }, c));
    assert.ok(!c.some((x) => x.fn === "save_highlight_draft"), "no save");
    return r.status;
  };
  assert.equal(await refused(variationSheet(), fingerprintOf(validSheet())), 409, "not the previewed file");
  const broken = variationSheet(); broken[3].values[2][0] = "";
  assert.equal(await refused(broken, fingerprintOf(broken)), 400, "has errors");
  const live = { version: 1, config: expected.draft.config, configFingerprint: expected.draft.configFingerprint };
  assert.equal(await refused(variationSheet(), fingerprintOf(variationSheet()), live), 400, "changes nothing");
});

test("bad uploads are rejected safely", async () => {
  const status = async (request: Request) => (await handleDraftUpload(request, deps())).status;
  assert.equal(await status(post("drafts", "not a form")), 400);
  const noFile = new FormData(); noFile.append("action", "preview");
  assert.equal(await status(new Request(`${SITE}/x`, { method: "POST", body: noFile, headers: { origin: SITE } })), 400);
  assert.equal(await status(upload(variationSheet(), { action: "publish" })), 400, "unknown action");
  assert.equal(await status(upload(variationSheet(), { action: "preview" }, "rules.csv")), 400);
  assert.equal(await status(upload(variationSheet(), { action: "preview" }, `${"x".repeat(252)}.xlsx`)), 400, "name too long for the database");
  assert.equal(await status(upload(new TextEncoder().encode("hello"), { action: "preview" })), 400);
  const big = new Uint8Array(MAX_XLSX_BYTES + 1); big.set([0x50, 0x4b, 0x03, 0x04]);
  assert.equal(await status(upload(big, { action: "preview" })), 413);
  const rejected = await handleDraftUpload(upload(new TextEncoder().encode("hello"), { action: "preview" }), deps());
  assert.equal((await rejected.json() as { code: string }).code, "wrong-file-type");
});

test("publish / rollback / discard validate input, ignore forged actors and pass only the session's user id", async () => {
  const calls: Call[] = [];
  const d = deps({}, calls);
  for (const body of ["{", "[]", { draftId: "not-a-uuid", confirmBehavior: true }, { draftId: DRAFT }, { draftId: DRAFT, confirmBehavior: "yes" }, { draftId: DRAFT, confirmBehavior: true, note: "x".repeat(501) }, { draftId: DRAFT, confirmBehavior: true, note: 7 }]) {
    assert.equal((await handlePublish(post("publish", body), d)).status, 400, JSON.stringify(body));
  }
  for (const body of [{ targetVersion: 0, expectedVersion: 1 }, { targetVersion: 1.5, expectedVersion: 2 }, { targetVersion: "1", expectedVersion: 2 }, { targetVersion: 1 }]) {
    assert.equal((await handleRollback(post("rollback", body), d)).status, 400, JSON.stringify(body));
  }
  assert.equal((await handleDiscard(post("discard", { draftId: "x" }), d)).status, 400);
  assert.equal(calls.length, 0, "invalid input never reaches the database");

  await handlePublish(post("publish", { draftId: DRAFT, confirmBehavior: false, note: "Hi", p_actor: "forged" }), d);
  await handleRollback(post("rollback", { targetVersion: 1, expectedVersion: 2, p_actor: "forged" }), d);
  await handleDiscard(post("discard", { draftId: DRAFT, userId: "forged" }), d);
  assert.deepEqual(calls, [
    { fn: "publish_highlight_draft", args: { p_actor: ADMIN, p_draft: DRAFT, p_confirm_behavior: false, p_note: "Hi" } },
    { fn: "rollback_highlight_config", args: { p_actor: ADMIN, p_target_version: 1, p_expected_version: 2, p_reason: null } },
    { fn: "discard_highlight_draft", args: { p_actor: ADMIN, p_draft: DRAFT } },
  ]);
});

test("database refusals become clear statuses; unexpected errors stay generic and are logged server-side only", async () => {
  const status = async (code: string | undefined) => { const r = rpcFailure({ code, message: `db says ${code}` }, {}); return [r.status, (await r.json() as { error: string }).error]; };
  assert.deepEqual(await status("42501"), [403, "db says 42501"]);
  assert.deepEqual(await status("HL409"), [409, "db says HL409"]);
  assert.deepEqual(await status("55000"), [409, "db says 55000"]);
  assert.deepEqual(await status("P0002"), [404, "db says P0002"]);
  assert.deepEqual(await status("22023"), [400, "db says 22023"]);
  assert.equal((await status("PGRST202"))[0], 503);
  const logged: string[] = [];
  const secret = rpcFailure({ code: "XX000", message: "internal detail: password=hunter2" }, { log: (m) => logged.push(m) });
  assert.equal(secret.status, 500);
  assert.ok(!(await secret.text()).includes("hunter2"));
  assert.equal(logged.length, 1);
});

test("state: live version, history and pending drafts (marked out of date when compared with an older version)", async () => {
  const draft = buildHighlightDraft({ bytes: toXlsx(variationSheet()), fileName: "rules.xlsx", published: null });
  assert.ok(draft.ok);
  const row = { id: DRAFT, file_name: "rules.xlsx", change_kind: "behavior", changes: draft.draft.changes, report: draft.draft.report, config: draft.draft.config,
    base_version: null, created_at: "2026-10-17T10:00:00Z", expires_at: "2026-10-24T10:00:00Z" };
  const response = await handleState(deps({
    rpc: async (fn) => fn === "list_highlight_config_versions"
      ? { data: { active: 1, versions: [{ version: 1, changeKind: "behavior" }] }, error: null }
      : { data: { version: 1, config: draft.draft.config, configFingerprint: draft.draft.configFingerprint }, error: null },
    pendingDrafts: async () => ({ data: [row], error: null }),
  }));
  assert.equal(response.status, 200);
  const state = await response.json() as { live: { version: number }; versions: unknown[]; drafts: { stale: boolean; preview: unknown[]; warnings: number }[] };
  assert.equal(state.live.version, 1);
  assert.equal(state.versions.length, 1);
  assert.deepEqual([state.drafts[0].stale, state.drafts[0].preview.length, state.drafts[0].warnings], [true, 5, 0]);
});
