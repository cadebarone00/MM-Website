"use client";

import { useState, type DragEvent } from "react";
import { Check, Copy, Download, FileSpreadsheet, Mail } from "lucide-react";
import { inviteRows, inviteTemplate, type InviteProblem, type InviteRow } from "@/lib/platform/inviteImport";
import styles from "./PlayRound.module.css";
import own from "./CodeTournament.module.css";

type Result = { sent: number; failed: string[]; emailReady: boolean; links: { name: string; email: string; url: string }[] };

/**
 * Created screen → Invite players: drop (or pick) a CSV or Excel file with a Name and an Email column (and Handicap for
 * net). It's checked here first (each row that can't be used is listed), then Send invites emails everyone "Join
 * <tournament>" with the code and their own link. Without email set up the invites are still saved and each link is
 * listed to copy. `sample` (simulator): checks the file, sends nothing.
 */
export function InvitePlayersCard({ id, net, sample = false }: { id: string; net: boolean; sample?: boolean }) {
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<{ invites: InviteRow[]; problems: InviteProblem[]; missing: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function read(picked: File) {
    setError(null); setResult(null); setFile(picked.name);
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.read(await picked.arrayBuffer());
      const sheet = book.Sheets[book.SheetNames[0]];
      setRows(inviteRows(sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }) : [], net));
    } catch {
      setRows(null); setError("Couldn't read that file. Use a CSV or Excel file with a Name and an Email column.");
    }
  }
  async function send() {
    if (!rows?.invites.length) return;
    if (sample) { setResult({ sent: 0, failed: [], emailReady: false, links: rows.invites.map((r) => ({ ...r, url: "(sample: no link)" })) }); return; }
    setBusy(true); setError(null);
    const reply = await fetch(`/api/code-tournaments/${encodeURIComponent(id)}/invites`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invites: rows.invites }) })
      .then((r) => r.json() as Promise<{ ok: boolean; message?: string } & Partial<Result>>).catch(() => null);
    setBusy(false);
    if (reply?.ok) { setResult({ sent: reply.sent ?? 0, failed: reply.failed ?? [], emailReady: Boolean(reply.emailReady), links: reply.links ?? [] }); return; }
    setError(reply?.message ?? "No connection. Try again when you're back online.");
  }
  const copy = (key: string, text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(key); window.setTimeout(() => setCopied(null), 1800); }).catch(() => {});
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); const picked = event.dataTransfer.files?.[0]; if (picked) void read(picked); };
  const unsent = result ? result.emailReady ? result.links.filter((l) => result.failed.includes(l.email)) : result.links : [];

  return <section className={`${styles.panel} ${own.readyCard}`} aria-label="Invite players">
    <p className={styles.kicker}>Invite players</p>
    <p className={own.readyCardNote}>Drop in a file with each player&apos;s name and email{net ? " and handicap" : ""}. Everyone gets an email to join, with the code and a link to get the app.</p>
    {!result && <>
      <label className={`${own.dropZone} ${dragging ? own.dropZoneOn : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <FileSpreadsheet size={26} aria-hidden="true" />
        <span>{file ?? "Drop a CSV or Excel file, or tap to choose"}</span>
        <input type="file" accept=".csv,.xlsx,.xls,text/csv" className={own.dropInput} onChange={(e) => { const picked = e.target.files?.[0]; e.target.value = ""; if (picked) void read(picked); }} />
      </label>
      <a className={own.templateLink} href={`data:text/csv;charset=utf-8,${encodeURIComponent(inviteTemplate(net))}`} download="players.csv"><Download size={14} aria-hidden="true" /> Download a template</a>
      {rows && (rows.missing.length ? <p className={styles.error} role="alert">The file needs a {rows.missing.join(", ")} column.</p>
        : <>
          <p className={styles.note}><b>{rows.invites.length}</b> {rows.invites.length === 1 ? "player" : "players"} ready to invite{rows.problems.length ? ` · ${rows.problems.length} ${rows.problems.length === 1 ? "row needs" : "rows need"} a fix` : ""}</p>
          {rows.problems.length > 0 && <ul className={own.importProblems}>{rows.problems.slice(0, 8).map((p) => <li key={p.row}>Row {p.row}: {p.message}</li>)}
            {rows.problems.length > 8 && <li>…and {rows.problems.length - 8} more</li>}</ul>}
          {rows.invites.length > 0 && <button type="button" className={styles.primary} disabled={busy} onClick={() => void send()}><Mail size={16} aria-hidden="true" /> {busy ? "Sending…" : `Send ${rows.invites.length} ${rows.invites.length === 1 ? "invite" : "invites"}`}</button>}
        </>)}
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {result && <>
      <p className={styles.note}>{sample ? `Sample: ${result.links.length} players checked. Nothing is sent in the simulator.`
        : result.emailReady ? `Sent ${result.sent} ${result.sent === 1 ? "invite" : "invites"}.${result.failed.length ? ` ${result.failed.length} didn't go through: share their links below.` : ""}`
        : `Invites saved for ${result.links.length} players, but email isn't set up yet, so nothing was sent. Share each player's link below.`}</p>
      {!sample && unsent.length > 0 && <>
        <button type="button" className={styles.secondary} onClick={() => copy("all", unsent.map((l) => `${l.name}: ${l.url}`).join("\n"))}>{copied === "all" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied === "all" ? "Copied" : "Copy all links"}</button>
        <ul className={own.inviteLinks}>{unsent.map((l) => <li key={l.email}><span>{l.name}<small>{l.email}</small></span>
          <button type="button" aria-label={`Copy ${l.name}'s link`} onClick={() => copy(l.email, l.url)}>{copied === l.email ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}</button></li>)}</ul>
      </>}
      <button type="button" className={own.templateLink} onClick={() => { setResult(null); setRows(null); setFile(null); }}>Invite more players</button>
    </>}
  </section>;
}
