import type { PlatformAdminCheck } from "../portal/platformAdmin.ts";
import { activeConfigFromJson, draftRowPayload } from "./configRows.ts";
import { buildHighlightDraft, previewLines, type DraftPreviewLine, type HighlightDraft } from "./draft.ts";
import type { ChangeSummary } from "./changes.ts";
import type { HighlightConfig, ValidationReport } from "./types.ts";
import { MAX_XLSX_BYTES } from "./xlsxSource.ts";

/**
 * The Highlights Admin API (routes in app/api/portal/admin/highlights). Every handler:
 *   1. refuses cross-site writes (Origin must be this site);
 *   2. asks `authorize` — the session-derived platform-admin check — and uses ONLY its userId as the actor;
 *   3. calls the admin-checked database functions in supabase/highlights_config.sql, which re-check the actor.
 * Nothing here publishes on upload: preview writes nothing, save stores a pending draft, publish is its own request.
 * Dependencies are injected so the same code is tested with fakes and against the real SQL on a practice database.
 */

export interface RpcError { code?: string; message: string }
export interface HighlightAdminDeps {
  authorize: () => Promise<PlatformAdminCheck>;
  /** Calls a database function as the server (service role). */
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>;
  /** Pending, unexpired drafts, newest first (service-role read of highlight_config_drafts). */
  pendingDrafts: () => Promise<{ data: PendingDraftRow[]; error: RpcError | null }>;
  /** Server-side log for unexpected failures; never sent to the browser. */
  log?: (message: string) => void;
}

export interface PendingDraftRow {
  id: string; file_name: string; change_kind: string; changes: ChangeSummary; report: ValidationReport; config: HighlightConfig;
  base_version: number | null; created_at: string; expires_at: string;
}

/** What the browser sees of a checked upload — never the file, never the full config. */
export interface DraftPreview {
  file: HighlightDraft["file"];
  configFingerprint: string;
  baseVersion: number | null;
  report: ValidationReport;
  changes: ChangeSummary;
  canPublish: boolean;
  needsBehaviorConfirm: boolean;
  counts: HighlightDraft["counts"];
  preview: DraftPreviewLine[];
}

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_LIMIT = 500;

function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

/** Origin (for writes) + platform admin. Returns the actor id, or the response to send instead. */
async function gate(request: Request | null, deps: HighlightAdminDeps): Promise<{ userId: string } | Response> {
  if (request && !sameOrigin(request)) return json({ error: "Invalid origin." }, 403);
  const check = await deps.authorize();
  if (check.status === "signed-out") return json({ error: "Sign in first." }, 401);
  if (check.status === "forbidden") return json({ error: "Only platform admins can manage highlights." }, 403);
  return { userId: check.userId };
}

/** Database refusals carry plain-English messages written for admins; anything unexpected stays generic. */
export function rpcFailure(error: RpcError, deps: Pick<HighlightAdminDeps, "log">): Response {
  const known: Record<string, number> = { "42501": 403, HL409: 409, P0002: 404, "55000": 409, "22023": 400 };
  if (error.code && known[error.code]) return json({ error: error.message, code: error.code }, known[error.code]);
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") {
    return json({ error: "The highlights database isn't installed yet (supabase/highlights_config.sql)." }, 503);
  }
  deps.log?.(`highlights admin: ${error.code ?? "?"} ${error.message}`);
  return json({ error: "Something went wrong. Nothing was changed. Try again." }, 500);
}

export function toPreview(draft: HighlightDraft): DraftPreview {
  const { file, configFingerprint, baseVersion, report, changes, canPublish, needsBehaviorConfirm, counts, preview } = draft;
  return { file, configFingerprint, baseVersion, report, changes, canPublish, needsBehaviorConfirm, counts, preview };
}

async function liveVersion(deps: HighlightAdminDeps): Promise<{ ok: true; live: { version: number; config: HighlightConfig } | null } | { ok: false; response: Response }> {
  const { data, error } = await deps.rpc("get_active_highlight_config", {});
  if (error) return { ok: false, response: rpcFailure(error, deps) };
  if (data === null) return { ok: true, live: null };
  const active = activeConfigFromJson(data);
  if (!active) { deps.log?.("highlights admin: live config has an unexpected shape"); return { ok: false, response: json({ error: "The live configuration couldn't be read." }, 500) }; }
  return { ok: true, live: { version: active.version, config: active.config } };
}

/**
 * POST /drafts — multipart: file (.xlsx), action ("preview" | "save"), expectedFingerprint (save only).
 * preview: checks the file and returns the preview; writes nothing.
 * save: re-checks the SAME file (its fingerprint must match what was previewed) and stores a pending draft.
 */
export async function handleDraftUpload(request: Request, deps: HighlightAdminDeps): Promise<Response> {
  const actor = await gate(request, deps);
  if (actor instanceof Response) return actor;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_XLSX_BYTES + 64 * 1024) return json({ error: "The file is larger than 2 MB." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Send the file as a form upload." }, 400); }
  const file = form.get("file");
  const action = form.get("action");
  if (!(file instanceof Blob) || typeof (file as File).name !== "string") return json({ error: "Choose an .xlsx file." }, 400);
  if (action !== "preview" && action !== "save") return json({ error: "Unknown action." }, 400);
  if (file.size > MAX_XLSX_BYTES) return json({ error: "The file is larger than 2 MB." }, 413);
  const name = (file as File).name;
  if (name.length < 1 || name.length > 255) return json({ error: "Rename the file to something shorter (255 characters max)." }, 400);

  const live = await liveVersion(deps);
  if (!live.ok) return live.response;
  const result = buildHighlightDraft({ bytes: new Uint8Array(await file.arrayBuffer()), fileName: name, published: live.live });
  if (!result.ok) return json({ error: result.error, code: result.code }, 400);
  const draft = result.draft;
  if (action === "preview") return json({ saved: false, draft: toPreview(draft) });

  if (form.get("expectedFingerprint") !== draft.file.fingerprint) {
    return json({ error: "This isn't the file you previewed. Check it again before saving." }, 409);
  }
  if (!draft.report.ok) return json({ error: "Fix the errors in the Google Sheet and export again before saving." }, 400);
  if (draft.changes.kind === "none") return json({ error: "This file changes nothing players would see." }, 400);
  const { data, error } = await deps.rpc("save_highlight_draft", { p_actor: actor.userId, p_draft: draftRowPayload(draft) });
  if (error) return rpcFailure(error, deps);
  return json({ saved: true, draftId: data, draft: toPreview(draft) });
}

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const value = await request.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const optionalText = (value: unknown) => (value === undefined || value === null ? null : typeof value === "string" && value.length <= NOTE_LIMIT ? value : undefined);
const positiveInt = (value: unknown) => (Number.isInteger(value) && (value as number) > 0 ? value as number : null);

/** POST /publish — { draftId, confirmBehavior, note? }. */
export async function handlePublish(request: Request, deps: HighlightAdminDeps): Promise<Response> {
  const actor = await gate(request, deps);
  if (actor instanceof Response) return actor;
  const input = await body(request);
  const note = optionalText(input?.note);
  if (!input || typeof input.draftId !== "string" || !UUID.test(input.draftId) || typeof input.confirmBehavior !== "boolean" || note === undefined) {
    return json({ error: "Send draftId, confirmBehavior (true/false) and an optional note of up to 500 characters." }, 400);
  }
  const { data, error } = await deps.rpc("publish_highlight_draft", { p_actor: actor.userId, p_draft: input.draftId, p_confirm_behavior: input.confirmBehavior, p_note: note });
  if (error) return rpcFailure(error, deps);
  return json({ ok: true, ...(data as object) });
}

/** POST /rollback — { targetVersion, expectedVersion, reason? }. expectedVersion = the version the admin saw as live. */
export async function handleRollback(request: Request, deps: HighlightAdminDeps): Promise<Response> {
  const actor = await gate(request, deps);
  if (actor instanceof Response) return actor;
  const input = await body(request);
  const target = positiveInt(input?.targetVersion), expected = positiveInt(input?.expectedVersion), reason = optionalText(input?.reason);
  if (!input || target === null || expected === null || reason === undefined) {
    return json({ error: "Send targetVersion and expectedVersion (whole numbers) and an optional reason of up to 500 characters." }, 400);
  }
  const { data, error } = await deps.rpc("rollback_highlight_config", { p_actor: actor.userId, p_target_version: target, p_expected_version: expected, p_reason: reason });
  if (error) return rpcFailure(error, deps);
  return json({ ok: true, ...(data as object) });
}

/** POST /discard — { draftId }. */
export async function handleDiscard(request: Request, deps: HighlightAdminDeps): Promise<Response> {
  const actor = await gate(request, deps);
  if (actor instanceof Response) return actor;
  const input = await body(request);
  if (!input || typeof input.draftId !== "string" || !UUID.test(input.draftId)) return json({ error: "Send draftId." }, 400);
  const { error } = await deps.rpc("discard_highlight_draft", { p_actor: actor.userId, p_draft: input.draftId });
  if (error) return rpcFailure(error, deps);
  return json({ ok: true });
}

export interface AdminState {
  live: { version: number; configFingerprint: string } | null;
  versions: { version: number; changeKind: string; configFingerprint: string; fileName: string; note: string | null; previousVersion: number | null; publishedAt: string }[];
  drafts: {
    id: string; fileName: string; changeKind: string; changes: ChangeSummary; warnings: number; baseVersion: number | null;
    createdAt: string; expiresAt: string; stale: boolean; preview: DraftPreviewLine[];
  }[];
}

/** Everything the admin page shows, for a verified platform admin. Read-only. */
export async function loadAdminState(deps: HighlightAdminDeps): Promise<{ ok: true; state: AdminState } | { ok: false; response: Response }> {
  const actor = await gate(null, deps);
  if (actor instanceof Response) return { ok: false, response: actor };
  const [history, live, drafts] = await Promise.all([
    deps.rpc("list_highlight_config_versions", { p_actor: actor.userId }), deps.rpc("get_active_highlight_config", {}), deps.pendingDrafts(),
  ]);
  const failed = history.error ?? live.error ?? drafts.error;
  if (failed) return { ok: false, response: rpcFailure(failed, deps) };
  const active = live.data === null ? null : activeConfigFromJson(live.data);
  const list = history.data as { versions: AdminState["versions"] };
  return {
    ok: true,
    state: {
      live: active ? { version: active.version, configFingerprint: active.configFingerprint } : null,
      versions: list.versions,
      drafts: drafts.data.map((row) => ({
        id: row.id, fileName: row.file_name, changeKind: row.change_kind, changes: row.changes, warnings: row.report.warnings.length,
        baseVersion: row.base_version, createdAt: row.created_at, expiresAt: row.expires_at,
        stale: row.base_version !== (active?.version ?? null), preview: previewLines(row.config),
      })),
    },
  };
}

/** GET / — the page's data. */
export async function handleState(deps: HighlightAdminDeps): Promise<Response> {
  const result = await loadAdminState(deps);
  return result.ok ? json(result.state) : result.response;
}
