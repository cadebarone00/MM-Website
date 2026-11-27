"use client";

import { useState } from "react";
import type { AdminState, DraftPreview } from "@/lib/highlights/adminApi";
import type { HighlightChange } from "@/lib/highlights/changes";
import type { HighlightIssue } from "@/lib/highlights/types";
import type { DraftPreviewLine } from "@/lib/highlights/draft";

/**
 * Highlights Admin: check an .xlsx export → save it as a draft → publish (explicitly) → version history → roll back.
 * Uploading never publishes. Every action goes through /api/portal/admin/highlights/*, which re-checks the session's
 * platform-admin status, and the database re-checks again.
 */

const API = "/api/portal/admin/highlights";
const KIND_STYLE: Record<string, string> = {
  behavior: "bg-maroon-700 text-white", copy: "bg-gold-300 text-ink-900", metadata: "bg-ink-100 text-ink-700", none: "bg-ink-100 text-ink-500",
};
const KIND_LABEL: Record<string, string> = {
  behavior: "Behavior change", copy: "Wording change", metadata: "Notes only", none: "No change",
};
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

async function send(path: string, init: RequestInit): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const response = await fetch(`${API}${path}`, { ...init, cache: "no-store" });
    return { ok: response.ok, data: await response.json().catch(() => ({ error: "Unexpected response." })) };
  } catch { return { ok: false, data: { error: "You're offline or the server didn't answer. Nothing was changed." } }; }
}
const postJson = (path: string, body: unknown) => send(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function KindBadge({ kind }: { kind: string }) {
  return <span className={`inline-block rounded px-2 py-0.5 font-condensed text-2xs font-bold uppercase tracking-wider ${KIND_STYLE[kind] ?? KIND_STYLE.none}`}>{KIND_LABEL[kind] ?? kind}</span>;
}

function Issues({ title, issues, tone }: { title: string; issues: HighlightIssue[]; tone: "error" | "warning" }) {
  if (!issues.length) return null;
  return <div className={`rounded border p-3 ${tone === "error" ? "border-red-400 bg-red-50" : "border-amber-400 bg-amber-50"}`}>
    <p className="font-semibold">{title} ({issues.length})</p>
    <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">
      {issues.map((issue, i) => <li key={i}>
        <span className="font-mono text-xs">{[issue.source && `${issue.source.tab}, row ${issue.source.row}`, issue.id].filter(Boolean).join(" · ") || "Sheet"}</span>
        {" — "}{issue.message}
      </li>)}
    </ul>
  </div>;
}

function Changes({ changes }: { changes: HighlightChange[] }) {
  if (!changes.length) return <p className="text-sm text-ink-600">Nothing players would see changes.</p>;
  const order = ["behavior", "copy", "metadata"];
  return <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
    {[...changes].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map((change, i) => <li key={i} className="flex flex-wrap items-baseline gap-2">
      <KindBadge kind={change.kind} />
      <span className="font-mono text-xs">{change.id}</span>
      <span>{change.field === "added" ? `turns on: ${change.after}` : change.field === "removed" ? `turns off: ${change.before}` : `${change.field}: "${change.before ?? ""}" → "${change.after ?? ""}"`}</span>
    </li>)}
  </ul>;
}

function Messages({ lines }: { lines: DraftPreviewLine[] }) {
  if (!lines.length) return <p className="text-sm text-ink-600">No messages would be live.</p>;
  return <ul className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
    {lines.map((line) => <li key={line.variationId} className="rounded-lg border border-ink-200 bg-white p-3 shadow-sm">
      <p className="font-mono text-2xs text-ink-500">{line.variationId}</p>
      <p className="font-semibold text-ink-900">{line.headline}</p>
      <p className="text-sm text-ink-700">{line.body}</p>
    </li>)}
  </ul>;
}

export function HighlightsAdmin({ initial }: { initial: AdminState }) {
  const [state, setState] = useState(initial);
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<DraftPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [confirmBehavior, setConfirmBehavior] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  async function refresh() {
    const { ok, data } = await send("", { method: "GET" });
    if (ok) setState(data as unknown as AdminState);
  }
  async function act(label: string, run: () => Promise<{ ok: boolean; data: Record<string, unknown> }>, success: (data: Record<string, unknown>) => string) {
    setBusy(label);
    setMessage(null);
    const { ok, data } = await run();
    setMessage(ok ? { text: success(data), tone: "ok" } : { text: String(data.error ?? "Something went wrong."), tone: "error" });
    if (ok) await refresh();
    setBusy(null);
    return ok;
  }
  const upload = (action: "preview" | "save") => {
    const form = new FormData();
    form.append("file", file!);
    form.append("action", action);
    if (action === "save" && checked) form.append("expectedFingerprint", checked.file.fingerprint);
    return send("/drafts", { method: "POST", body: form });
  };

  return <div className="space-y-8">
    {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded border p-3 text-sm ${message.tone === "error" ? "border-red-400 bg-red-50" : "border-green-500 bg-green-50"}`}>{message.text}</p>}

    <section className="rounded-xl border border-gold-300 bg-cream-50 p-5">
      <p className="font-condensed text-2xs font-bold uppercase tracking-[0.16em] text-ink-500">Live now</p>
      <p className="mt-1 font-serif text-2xl font-bold text-ink-900">{state.live ? `Version ${state.live.version}` : "Nothing published yet"}</p>
      <p className="mt-1 text-sm text-ink-600">Players only ever get messages from the live version. Uploading or saving a file never changes it.</p>
    </section>

    <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
      <h2 className="font-serif text-2xl font-bold text-ink-900">1. Check a new file</h2>
      <p className="text-sm text-ink-600">In Google Sheets: File → Download → Microsoft Excel (.xlsx). Only the six category tabs are read.</p>
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" accept=".xlsx" aria-label="Highlights .xlsx file" disabled={busy !== null}
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setChecked(null); }} className="text-sm" />
        <button type="button" disabled={!file || busy !== null} className="rounded-lg bg-maroon-700 px-5 py-2 font-semibold text-white disabled:opacity-40"
          onClick={async () => {
            setBusy("check"); setMessage(null);
            const { ok, data } = await upload("preview");
            if (ok) setChecked(data.draft as DraftPreview); else setMessage({ text: String(data.error ?? "Couldn't check the file."), tone: "error" });
            setBusy(null);
          }}>{busy === "check" ? "Checking…" : "Check file"}</button>
      </div>

      {checked && <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <KindBadge kind={checked.changes.kind} />
          <span>{checked.counts.rules} rules · {checked.counts.conditionals} triggers · {checked.counts.variations} messages</span>
          <span>Would be live: {checked.counts.liveConditionals} triggers, {checked.counts.liveVariations} messages</span>
          <span className="text-ink-500">Compared with {checked.baseVersion ? `version ${checked.baseVersion}` : "nothing live"}</span>
        </div>
        <Issues title="Errors — fix these in the Google Sheet and export again" issues={checked.report.errors} tone="error" />
        <Issues title="Warnings" issues={checked.report.warnings} tone="warning" />
        <div><h3 className="mb-2 font-semibold">What changes for players</h3><Changes changes={checked.changes.changes} /></div>
        <div><h3 className="mb-2 font-semibold">Live messages, with sample names</h3><Messages lines={checked.preview} /></div>
        <button type="button" disabled={!checked.canPublish || busy !== null} className="rounded-lg border-2 border-maroon-700 px-5 py-2 font-semibold text-maroon-700 disabled:opacity-40"
          onClick={() => act("save", () => upload("save"), () => "Saved as a draft. Nothing is live yet — publish it below.").then((ok) => { if (ok) { setChecked(null); setFile(null); } })}>
          {busy === "save" ? "Saving…" : "Save as draft"}
        </button>
        {!checked.canPublish && <p className="text-sm text-ink-600">{checked.report.ok ? "This file changes nothing players would see." : "Drafts with errors can't be saved."}</p>}
      </div>}
    </section>

    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-bold text-ink-900">2. Drafts waiting to publish</h2>
      {!state.drafts.length && <p className="text-sm text-ink-600">No drafts. Check and save a file above.</p>}
      {state.drafts.map((draft) => {
        const needsConfirm = draft.changeKind === "behavior";
        const blocked = draft.stale || (needsConfirm && !confirmBehavior[draft.id]);
        return <article key={draft.id} className="space-y-3 rounded-xl border border-ink-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <KindBadge kind={draft.changeKind} />
            <span className="font-semibold">{draft.fileName}</span>
            <span className="text-sm text-ink-500">Saved {when(draft.createdAt)} · expires {when(draft.expiresAt)}</span>
          </div>
          {draft.stale && <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">Out of date: another version went live after this file was checked. Check the file again.</p>}
          <details><summary className="cursor-pointer text-sm font-semibold">Changes ({draft.changes.changes.length}){draft.warnings ? ` · ${draft.warnings} warnings` : ""}</summary><div className="mt-2"><Changes changes={draft.changes.changes} /></div></details>
          <details><summary className="cursor-pointer text-sm font-semibold">Messages ({draft.preview.length})</summary><div className="mt-2"><Messages lines={draft.preview} /></div></details>
          {needsConfirm && <label className="flex items-start gap-2 rounded border border-maroon-700 bg-cream-50 p-3 text-sm">
            <input type="checkbox" checked={!!confirmBehavior[draft.id]} onChange={(e) => setConfirmBehavior((c) => ({ ...c, [draft.id]: e.target.checked }))} className="mt-1" />
            <span>I understand this changes <strong>which highlights fire</strong> (triggers turning on or off, or tiers changing), not just their wording.</span>
          </label>}
          <input type="text" maxLength={500} placeholder="Note for the version history (optional)" value={notes[draft.id] ?? ""}
            onChange={(e) => setNotes((n) => ({ ...n, [draft.id]: e.target.value }))} className="w-full rounded border border-ink-300 px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={blocked || busy !== null} className="rounded-lg bg-maroon-700 px-5 py-2 font-semibold text-white disabled:opacity-40"
              onClick={() => act(`publish-${draft.id}`, () => postJson("/publish", { draftId: draft.id, confirmBehavior: !!confirmBehavior[draft.id], note: notes[draft.id] || null }),
                (data) => `Published version ${data.version}. It's live now.`)}>
              {busy === `publish-${draft.id}` ? "Publishing…" : "Publish"}
            </button>
            <button type="button" disabled={busy !== null} className="rounded-lg border border-ink-300 px-5 py-2 font-semibold text-ink-700 disabled:opacity-40"
              onClick={() => act(`discard-${draft.id}`, () => postJson("/discard", { draftId: draft.id }), () => "Draft discarded.")}>Discard</button>
          </div>
        </article>;
      })}
    </section>

    <section className="space-y-4">
      <h2 className="font-serif text-2xl font-bold text-ink-900">3. Version history</h2>
      {!state.versions.length && <p className="text-sm text-ink-600">Nothing has been published yet.</p>}
      <ul className="space-y-2">
        {state.versions.map((version) => {
          const isLive = state.live?.version === version.version;
          return <li key={version.version} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white p-4">
            <span className="font-serif text-lg font-bold">v{version.version}</span>
            <KindBadge kind={version.changeKind} />
            <span className="text-sm">{version.fileName}</span>
            <span className="text-sm text-ink-500">{when(version.publishedAt)}</span>
            {version.note && <span className="text-sm italic text-ink-600">“{version.note}”</span>}
            <span className="ml-auto">
              {isLive ? <span className="rounded bg-green-100 px-2 py-1 text-sm font-semibold text-green-800">Live</span>
                : rollbackTarget === version.version
                  ? <span className="flex flex-wrap items-center gap-2 text-sm">Make v{version.version} live again?
                    <button type="button" disabled={busy !== null} className="rounded bg-maroon-700 px-3 py-1 font-semibold text-white disabled:opacity-40"
                      onClick={() => act(`rollback-${version.version}`, () => postJson("/rollback", { targetVersion: version.version, expectedVersion: state.live?.version }),
                        (data) => `Version ${data.version} is live again (was ${data.previousVersion}).`).then(() => setRollbackTarget(null))}>Yes, make it live</button>
                    <button type="button" className="rounded border border-ink-300 px-3 py-1" onClick={() => setRollbackTarget(null)}>Cancel</button></span>
                  : <button type="button" disabled={busy !== null || !state.live} className="rounded border border-maroon-700 px-3 py-1 text-sm font-semibold text-maroon-700 disabled:opacity-40"
                    onClick={() => setRollbackTarget(version.version)}>Make live again</button>}
            </span>
          </li>;
        })}
      </ul>
    </section>
  </div>;
}
