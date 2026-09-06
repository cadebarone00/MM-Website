"use client";

import { useState } from "react";
import type { LiveCourse } from "@/lib/live/types";
import { AddCourseForm } from "./AddCourseForm";
import { CourseTeeSetEditor } from "./CourseTeeSetEditor";

export function CourseLibraryPanel({ initialCourses }: { initialCourses: LiveCourse[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [adding, setAdding] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function importHistory() {
    setSeeding(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/portal/tiger/courses/seed-history", { method: "POST" });
      const data = await response.json();
      if (!data.ok) { setError(data.error); return; }
      setNotice(data.added ? `Added ${data.added} corrected historical course setups to the library.` : "All corrected historical course setups are already in the library.");
      const reload = await fetch("/api/portal/tiger/courses", { cache: "no-store" });
      const latest = await reload.json();
      if (latest.ok) setCourses(latest.courses);
    } finally { setSeeding(false); }
  }

  return <div className="mt-6">
    <section className="rounded-xl border border-gold-300 bg-cream-50 p-5">
      <p className="font-condensed text-2xs font-bold uppercase tracking-[0.16em] text-ink-500">Global data</p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-ink-900">Course Library</h1>
      <p className="mt-2 font-sans text-sm text-ink-600">Every course setup lives here once. Any tournament year can select a saved course, while the archive and odds model use the same hole, par, and yardage data.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={importHistory} disabled={seeding} className="rounded-sm bg-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-white disabled:opacity-50">{seeding ? "Importing…" : "Import 2024–2026 courses"}</button>
        <button type="button" onClick={() => setAdding((value) => !value)} className="rounded-sm border border-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">{adding ? "Cancel" : "Add a course"}</button>
      </div>
      {notice && <p className="mt-4 rounded-sm bg-fairway-800 px-3 py-2 font-sans text-sm text-white">{notice}</p>}
      {error && <p className="mt-4 rounded-sm bg-red-50 px-3 py-2 font-sans text-sm text-red-700">{error}</p>}
      {adding && <AddCourseForm onSaved={(course) => { setCourses((current) => [...current, course].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); }} />}
    </section>

    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3"><h2 className="font-serif text-2xl font-bold text-ink-900">Saved courses</h2><span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{courses.length} total</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {courses.map((course) => <article key={course.id} className="rounded-lg border border-stone-300 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-serif text-lg font-bold text-ink-900">{course.name}</h3><p className="mt-1 font-sans text-sm text-ink-600">Par {course.holes.reduce((sum, hole) => sum + hole.par, 0)} · {course.holes.reduce((sum, hole) => sum + hole.yards, 0).toLocaleString()} yards</p></div><button type="button" onClick={() => setEditingId((id) => id === course.id ? null : course.id)} className="shrink-0 font-condensed text-2xs font-bold uppercase text-maroon-700 underline">{editingId === course.id ? "Close" : "Edit tees"}</button></div><p className="mt-1 font-sans text-xs text-ink-500">{course.teeSets?.length ?? 1} tee set{(course.teeSets?.length ?? 1) === 1 ? "" : "s"} · {course.rating != null ? `Rating ${course.rating}` : "Rating not entered"}{course.slope != null ? ` · Slope ${course.slope}` : ""}</p>{editingId === course.id && <CourseTeeSetEditor course={course} onSaved={(teeSets) => setCourses((current) => current.map((entry) => entry.id === course.id ? { ...entry, teeSets, holes: teeSets[0].holes, rating: teeSets[0].rating, slope: teeSets[0].slope } : entry))} />}</article>)}
        {courses.length === 0 && <p className="font-sans text-sm text-ink-500">No saved courses yet. Import the corrected historical setups or add one from a scorecard.</p>}
      </div>
    </section>
  </div>;
}
