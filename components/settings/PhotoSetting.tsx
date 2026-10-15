"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import styles from "./Settings.module.css";

/**
 * Settings → Profile photo: pick a photo (JPG / PNG / WebP, up to 3 MB) or remove it. Initials show when there's none.
 * `onSave` (dev profile preview only) saves somewhere else instead of the account: a file, or null to remove; returns the new URL.
 */
export function PhotoSetting({ initialUrl, initials, available, onSave }: { initialUrl: string | null; initials: string; available: boolean; onSave?: (file: File | null) => Promise<string | null> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(request: () => Promise<Response>, file: File | null) {
    setBusy(true); setError(null);
    try {
      if (onSave) { setUrl(await onSave(file)); return; }
      const response = await request();
      const body = await response.json().catch(() => null) as { ok?: boolean; url?: string | null; error?: string } | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "Couldn't change your photo. Try again.");
      setUrl(body.url ?? null);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Couldn't change your photo. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError("That photo is too big. Use one under 3 MB."); return; }
    const form = new FormData();
    form.append("photo", file);
    void send(() => fetch("/api/account/photo", { method: "POST", body: form }), file);
  }

  return <div className={styles.photoRow}>
    <span className={styles.avatar} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a stored photo URL, shown as-is */}
      {url ? <img src={url} alt="" /> : initials}
    </span>
    <div className={styles.photoActions}>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => upload(event.target.files?.[0])} />
      <button type="button" className={styles.primary} disabled={busy || !available} onClick={() => input.current?.click()}>
        <Camera size={16} aria-hidden="true" /> {busy ? "Saving…" : url ? "Change photo" : "Add a photo"}
      </button>
      {url && <button type="button" className={styles.secondary} disabled={busy} onClick={() => void send(() => fetch("/api/account/photo", { method: "DELETE" }), null)}>
        <Trash2 size={16} aria-hidden="true" /> Remove
      </button>}
      {!available && <p className={styles.note}>Profile photos are coming soon.</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  </div>;
}
