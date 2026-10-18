import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import type { PlatformAdminCheck } from "../portal/platformAdmin.ts";
import { database, profile, sqlFile } from "../platform/testDatabase.ts";
import { handleDiscard, handleDraftUpload, handlePublish, handleRollback, handleState, type AdminState, type HighlightAdminDeps, type PendingDraftRow } from "./adminApi.ts";
import { buildHighlightDraft } from "./draft.ts";
import { toXlsx, variationSheet } from "./sheetFixture.ts";
import type { RawTab } from "./sheetRows.ts";

// The Highlights Admin API wired to the real supabase/highlights_config.sql on an isolated practice database (PGlite).
// `rpc` calls the SQL functions the way supabase-js .rpc() does (named arguments, JSON results, error codes).

const SITE = "https://maroon.test";

function wire(db: PGlite, session: () => PlatformAdminCheck): HighlightAdminDeps {
  return {
    authorize: async () => session(),
    rpc: async (fn, args) => {
      const names = Object.keys(args);
      const values = names.map((name) => { const v = args[name]; return v !== null && typeof v === "object" ? JSON.stringify(v) : v; });
      try {
        const rows = await db.query<{ r: unknown }>(`select ${fn}(${names.map((name, i) => `${name} => $${i + 1}`).join(", ")}) as r`, values);
        return { data: rows.rows[0]?.r ?? null, error: null };
      } catch (error) {
        const e = error as { code?: string; message: string };
        return { data: null, error: { code: e.code, message: e.message } };
      }
    },
    pendingDrafts: async () => ({
      data: (await db.query<PendingDraftRow>(`select id, file_name, change_kind, changes, report, config, base_version, created_at::text, expires_at::text
        from highlight_config_drafts where status = 'pending' and expires_at > now() order by created_at desc limit 20`)).rows,
      error: null,
    }),
  };
}
const file = (tabs: RawTab[], action: "preview" | "save") => {
  const form = new FormData();
  form.append("file", new File([Uint8Array.from(toXlsx(tabs))], "The_Maroon_Highlights_Source_of_Truth.xlsx"));
  form.append("action", action);
  if (action === "save") {
    const r = buildHighlightDraft({ bytes: toXlsx(tabs), fileName: "The_Maroon_Highlights_Source_of_Truth.xlsx", published: null });
    assert.ok(r.ok);
    form.append("expectedFingerprint", r.draft.file.fingerprint);
  }
  return new Request(`${SITE}/api/portal/admin/highlights/drafts`, { method: "POST", body: form, headers: { origin: SITE } });
};
const post = (path: string, body: unknown) => new Request(`${SITE}/api/portal/admin/highlights/${path}`, { method: "POST", body: JSON.stringify(body), headers: { origin: SITE } });
const reworded = () => { const t = variationSheet(); t[3].values[3][4] = "{player}'s heating up! 🔥🔥"; return t; };
const result = async (response: Response) => ({ status: response.status, body: await response.json() as Record<string, unknown> });

async function setup() {
  const db = await database();
  await db.exec(sqlFile("highlights_config.sql"));
  const admin = await profile(db, "admin", { admin: true });
  const host = await profile(db, "host", { host: true });
  return { db, admin, host, api: wire(db, () => ({ status: "ok", userId: admin })) };
}

test("end to end: check → save → explicit publish (behavior confirm) → wording change → rollback, all audited", async () => {
  const { db, api } = await setup();
  const preview = await result(await handleDraftUpload(file(variationSheet(), "preview"), api));
  assert.equal(preview.status, 200);
  assert.equal(await count(db, "highlight_config_drafts"), 0, "checking a file writes nothing");

  const saved = await result(await handleDraftUpload(file(variationSheet(), "save"), api));
  assert.equal(saved.status, 200);
  let state = await result(await handleState(api)).then((r) => r.body as unknown as AdminState);
  assert.deepEqual([state.live, state.drafts.length, state.drafts[0].stale, state.drafts[0].changeKind], [null, 1, false, "behavior"]);
  assert.equal(state.drafts[0].preview[2].headline, "Three's a party! 🐦");

  const unconfirmed = await result(await handlePublish(post("publish", { draftId: saved.body.draftId, confirmBehavior: false }), api));
  assert.deepEqual([unconfirmed.status, /Confirm the behavior change/.test(String(unconfirmed.body.error))], [400, true]);
  const published = await result(await handlePublish(post("publish", { draftId: saved.body.draftId, confirmBehavior: true, note: "First rulebook" }), api));
  assert.deepEqual([published.status, published.body.version], [200, 1]);
  const again = await result(await handlePublish(post("publish", { draftId: saved.body.draftId, confirmBehavior: true }), api));
  assert.deepEqual([again.status, /already published/.test(String(again.body.error))], [409, true], "no duplicate publishing");

  const copy = await result(await handleDraftUpload(file(reworded(), "save"), api));
  assert.equal(copy.status, 200);
  const v2 = await result(await handlePublish(post("publish", { draftId: copy.body.draftId, confirmBehavior: false }), api));
  assert.deepEqual([v2.status, v2.body.version, v2.body.changeKind], [200, 2, "copy"], "wording-only needs no behavior confirm");

  const back = await result(await handleRollback(post("rollback", { targetVersion: 1, expectedVersion: 2, reason: "Prefer v1 wording" }), api));
  assert.deepEqual([back.status, back.body.version, back.body.previousVersion], [200, 1, 2]);
  const staleRollback = await result(await handleRollback(post("rollback", { targetVersion: 1, expectedVersion: 2 }), api));
  assert.equal(staleRollback.status, 409);
  state = (await result(await handleState(api))).body as unknown as AdminState;
  assert.deepEqual([state.live?.version, state.versions.map((v) => v.version)], [1, [2, 1]]);
  assert.deepEqual((await db.query<{ action: string }>("select action from highlight_config_audit order by id")).rows.map((r) => r.action),
    ["upload", "publish", "upload", "publish", "rollback"]);
});

test("a draft goes stale when another version is published first, and is refused with 409", async () => {
  const { db, api } = await setup();
  const first = await result(await handleDraftUpload(file(variationSheet(), "save"), api));
  await handlePublish(post("publish", { draftId: first.body.draftId, confirmBehavior: true }), api);
  const a = await result(await handleDraftUpload(file(reworded(), "save"), api));
  const otherWording = variationSheet(); otherWording[3].values[4][4] = "Check the bag! 👀";
  const b = await result(await handleDraftUpload(file(otherWording, "save"), api));
  assert.equal((await handlePublish(post("publish", { draftId: b.body.draftId, confirmBehavior: false }), api)).status, 200);
  const state = (await result(await handleState(api))).body as unknown as AdminState;
  assert.deepEqual(state.drafts.map((d) => [d.id, d.stale]), [[a.body.draftId, true]]);
  const stale = await result(await handlePublish(post("publish", { draftId: a.body.draftId, confirmBehavior: false }), api));
  assert.deepEqual([stale.status, /Another version went live/.test(String(stale.body.error))], [409, true]);
  assert.equal((await handleDiscard(post("discard", { draftId: a.body.draftId }), api)).status, 200);
  assert.equal(await count(db, "highlight_config_versions"), 2);
});

test("defense in depth: even if the server's check wrongly let a non-admin through, the database refuses (403) and stores nothing", async () => {
  const { db, admin, host } = await setup();
  const leaky = wire(db, () => ({ status: "ok", userId: host }));
  assert.equal((await handleDraftUpload(file(variationSheet(), "save"), leaky)).status, 403);
  assert.equal((await handleState(leaky)).status, 403);
  const saved = await result(await handleDraftUpload(file(variationSheet(), "save"), wire(db, () => ({ status: "ok", userId: admin }))));
  for (const response of [
    await handlePublish(post("publish", { draftId: saved.body.draftId, confirmBehavior: true }), leaky),
    await handleDiscard(post("discard", { draftId: saved.body.draftId }), leaky),
    await handleRollback(post("rollback", { targetVersion: 1, expectedVersion: 1 }), leaky),
  ]) assert.equal(response.status, 403);
  assert.deepEqual([await count(db, "highlight_config_versions"), await count(db, "highlight_config_active")], [0, 0]);
  assert.equal(await count(db, "highlight_config_drafts"), 1, "only the real admin's draft exists");
});

test("before highlights_config.sql is installed the API answers 503, not a crash", async () => {
  const db = await database();
  const admin = await profile(db, "admin", { admin: true });
  const api = wire(db, () => ({ status: "ok", userId: admin }));
  const preview = await result(await handleDraftUpload(file(variationSheet(), "preview"), api));
  assert.deepEqual([preview.status, /isn't installed/.test(String(preview.body.error))], [503, true]);
});

async function count(db: PGlite, table: string) {
  return (await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0].n;
}
