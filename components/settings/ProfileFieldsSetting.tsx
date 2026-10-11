"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { BIO_MAX, NAME_MAX, USERNAME_RULE } from "@/lib/profile/profileEdit";
import styles from "./Settings.module.css";

type Field = "displayName" | "username" | "bio";
const LABELS: Record<Field, string> = { displayName: "Name", username: "Username", bio: "Bio" };

/**
 * Settings → Account: Name, Username and Bio, each with its own Edit button that edits in place (no new page).
 * Each saves on its own through PATCH /api/account/profile with just that field. `email` shows first, read only (it comes
 * from the login).
 */
export function ProfileFieldsSetting({ initial, bioAvailable, email }: { initial: Record<Field, string>; bioAvailable: boolean; email?: string | null }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [editing, setEditing] = useState<Field | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = (field: Field) => { setEditing(field); setDraft(values[field]); setError(null); };
  async function save(field: Field) {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: draft }) });
      const body = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "Couldn't save that. Try again.");
      setValues((all) => ({ ...all, [field]: draft.trim() }));
      setEditing(null);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const fields: Field[] = bioAvailable ? ["displayName", "username", "bio"] : ["displayName", "username"];
  return <ul className={styles.fieldList}>
    {email && <li className={styles.fieldRow}>
      <span className={styles.fieldLabel}>Email</span>
      <span className={styles.fieldText}>{email}</span>
      <span />
    </li>}
    {fields.map((field) => <li key={field} className={`${styles.fieldRow} ${editing === field ? styles.fieldRowEditing : ""}`}>
      {editing === field ? <form className={styles.fieldEdit} onSubmit={(event) => { event.preventDefault(); void save(field); }}>
        <label className={styles.fieldLabel} htmlFor={`edit-${field}`}>{LABELS[field]}</label>
        {field === "bio"
          ? <textarea id={`edit-${field}`} className={styles.fieldInput} rows={4} maxLength={BIO_MAX} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
          : <input id={`edit-${field}`} className={styles.fieldInput} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus
              maxLength={field === "displayName" ? NAME_MAX : 30} autoComplete={field === "displayName" ? "name" : "username"} autoCapitalize={field === "username" ? "none" : undefined} />}
        {field === "username" && <p className={styles.note}>{USERNAME_RULE}</p>}
        {field === "bio" && <p className={styles.note}>{draft.length} / {BIO_MAX}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.fieldButtons}>
          <button type="submit" className={styles.primary} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" className={styles.secondary} disabled={saving} onClick={() => { setEditing(null); setError(null); }}>Cancel</button>
        </div>
      </form> : <>
        <span className={styles.fieldLabel}>{LABELS[field]}</span>
        <span className={field === "bio" ? styles.fieldBio : styles.fieldText}>{values[field] ? (field === "username" ? `@${values[field]}` : values[field]) : <em className={styles.muted}>Not set</em>}</span>
        <button type="button" className={styles.editButton} disabled={editing !== null} onClick={() => start(field)} aria-label={`Edit ${LABELS[field].toLowerCase()}`}><Pencil size={14} aria-hidden="true" /> Edit</button>
      </>}
    </li>)}
  </ul>;
}
