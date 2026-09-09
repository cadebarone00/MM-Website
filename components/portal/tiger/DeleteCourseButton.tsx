"use client";

import { useState } from "react";

export function DeleteCourseButton({ course, onDeleted }: { course: { id: string; name: string }; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 font-condensed text-xs font-bold uppercase text-red-700 underline" aria-label={`Delete ${course.name}`}>Delete course</button>;

  return <form className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3" onSubmit={async (event) => {
    event.preventDefault();
    if (busy || name !== course.name) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: course.id, confirmationName: name }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not delete the course.");
      onDeleted();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete the course. Try again."); setBusy(false); }
  }}>
    <p className="font-sans text-sm text-ink-900">Delete this course and its tee sets? This cannot be undone.</p>
    <label className="mt-3 block font-sans text-sm text-ink-700">Type <strong>{course.name}</strong> to confirm.
      <input autoFocus autoComplete="off" spellCheck={false} disabled={busy} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 block w-full rounded border border-red-300 bg-white px-3 py-2 text-ink-900" />
    </label>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    <div className="mt-3 flex flex-wrap gap-3">
      <button type="submit" disabled={busy || name !== course.name} className="rounded bg-red-700 px-3 py-2 font-condensed text-xs font-bold uppercase text-white disabled:opacity-40">{busy ? "Deleting…" : "Confirm deletion"}</button>
      <button type="button" disabled={busy} onClick={() => { setOpen(false); setName(""); setError(null); }} className="px-3 py-2 font-condensed text-xs font-bold uppercase text-ink-600">Cancel</button>
    </div>
  </form>;
}
