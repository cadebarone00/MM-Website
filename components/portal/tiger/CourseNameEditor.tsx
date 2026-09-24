"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CourseNameEditor({ id, name, onSaved }: { id: string; name: string; onSaved?: (name: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!editing) return <button type="button" onClick={() => { setValue(name); setError(""); setEditing(true); }} className="mt-2 text-xs font-bold text-maroon-700 underline">Edit course name</button>;
  return <form className="mt-3" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name: value }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not rename course.");
      onSaved?.(data.course.name); setEditing(false); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not rename course."); }
    finally { setBusy(false); }
  }}>
    <label className="block text-sm font-semibold">Course name<input autoFocus required maxLength={200} disabled={busy} value={value} onChange={(event) => setValue(event.target.value)} className="mt-1 w-full rounded border border-stone-300 bg-white px-3 py-2 text-ink-900" /></label>
    <div className="mt-2 flex gap-3"><button disabled={busy || !value.trim()} className="rounded bg-maroon-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? "Saving…" : "Save name"}</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className="text-xs underline">Cancel</button></div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </form>;
}
