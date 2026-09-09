"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse } from "@/lib/live/types";
import { COURSE_CSV_MAX_BYTES } from "@/lib/live/courseCsv";

export function CourseCsvImport({ onSaved }: { onSaved: (course: LiveCourse) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<LiveCourse | null>(null);
  return <div className="mt-4 rounded-lg border border-gold-300 bg-white p-4">
    <h2 className="font-serif text-lg font-bold text-ink-900">Import a course CSV</h2>
    <p className="mt-2 font-sans text-sm text-ink-600">Upload whatever course information you have. Missing holes, par, yardage, rating, and slope can be filled in later. Use one row per hole; without hole numbers, rows are assigned in order. Totals are calculated automatically.</p>
    <p className="mt-2 font-sans text-xs text-ink-500">If names are missing, the filename becomes the course name and the tee set is named Standard. Blank names on later rows continue the previous course and tee set.</p>
    <p className="mt-2 font-sans text-xs text-ink-500">One new course per file, up to 1 MB. Imported tee sets save as unlocked drafts. Review and lock them to make them available for rounds.</p>
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <a href="/templates/course-library.csv" download className="font-condensed text-xs font-bold uppercase text-maroon-700 underline">Download CSV template</a>
      <label className="font-condensed text-xs font-bold uppercase text-maroon-700">Upload and save CSV
        <input type="file" accept=".csv,text/csv" disabled={busy} className="mt-2 block max-w-full font-sans text-sm normal-case" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setError(null); setImported(null);
          if (file.size > COURSE_CSV_MAX_BYTES) { setError("CSV files must be 1 MB or smaller."); return; }
          setBusy(true);
          try {
            const form = new FormData(); form.append("file", file);
            const response = await fetch("/api/portal/tiger/courses/import", { method: "POST", body: form });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not import the course.");
            setImported(data.course); onSaved(data.course);
          } catch (err) { setError(err instanceof Error ? err.message : "Could not import the course. Try again."); }
          finally { setBusy(false); }
        }} />
      </label>
    </div>
    {busy && <p role="status" className="mt-3 text-sm text-ink-500">Validating and saving course…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {imported && <p role="status" className="mt-3 text-sm text-maroon-700">Saved {imported.name} with {imported.teeSets?.length} draft tee sets. <Link className="font-bold underline" href={`/portal/admin/course-library/${imported.id}`}>Review, edit, and lock tee sets</Link></p>}
  </div>;
}
