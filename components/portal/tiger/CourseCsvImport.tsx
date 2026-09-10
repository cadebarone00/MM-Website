"use client";
import { useState } from "react";
import type { LiveCourse } from "@/lib/live/types";

export function CourseCsvImport({ course, onSaved }: { course: LiveCourse; onSaved: (course: LiveCourse) => void }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div className="mt-3 text-xs">
    <label className="inline-block cursor-pointer rounded border border-maroon-700 px-3 py-2 font-bold text-maroon-700">{busy ? "Importing…" : "Import CSV"}<input type="file" accept=".csv,text/csv" disabled={busy} className="sr-only" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      if (file.size > 1000000) { setMessage("Choose a CSV under 1 MB."); return; }
      if (!window.confirm(`Update tee sets for ${course.name}? Matching tee names will be updated and imported tees will unlock for review.`)) return;
      setBusy(true); setMessage("");
      try {
        const response = await fetch("/api/portal/tiger/courses/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: course.id, csv: await file.text() }) });
        const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error ?? "Import failed.");
        onSaved(data.course); setMessage("Imported. Review the tee sets, then save and lock them.");
      } catch (err) { setMessage(err instanceof Error ? err.message : "Import failed."); } finally { setBusy(false); }
    }} /></label>
    <a href="/templates/course-library.csv" download className="ml-3 underline">CSV template</a>
    {message && <p role="status" className="mt-2">{message}</p>}
  </div>;
}
