"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse } from "@/lib/live/types";
import { AddCourseForm } from "./AddCourseForm";
import { CourseCsvImport } from "./CourseCsvImport";
import { DeleteCourseButton } from "./DeleteCourseButton";

export function CourseLibraryPanel({ initialCourses }: { initialCourses: LiveCourse[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [adding, setAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  return <div className="mt-6">
    <section className="rounded-xl border border-gold-300 bg-cream-50 p-5">
      <p className="font-condensed text-2xs font-bold uppercase tracking-[0.16em] text-ink-500">Global data</p>
      <h1 className="mt-1 font-serif text-3xl font-bold text-ink-900">Course Library</h1>
      <p className="mt-2 font-sans text-sm text-ink-600">Every course setup lives here once. Any tournament year can select a saved course, while the archive and odds model use the same hole, par, and yardage data.</p>
      <div className="mt-4"><button type="button" onClick={() => setAdding((value) => !value)} className="rounded-sm border border-maroon-700 px-4 py-2 font-condensed text-xs font-bold uppercase tracking-wide text-maroon-700">{adding ? "Cancel" : "Add a course"}</button></div>
      {adding && <AddCourseForm onSaved={(course) => { setCourses((current) => [...current, course].sort((a, b) => a.name.localeCompare(b.name))); setAdding(false); }} />}
      <CourseCsvImport onSaved={(course) => setCourses((current) => [...current, course].sort((a, b) => a.name.localeCompare(b.name)))} />
    </section>

    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3"><h2 className="font-serif text-2xl font-bold text-ink-900">Saved courses</h2><span className="font-condensed text-2xs font-bold uppercase tracking-wide text-ink-500">{courses.length} total</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {courses.map((course) => <article key={course.id} className="rounded-lg border border-stone-300 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><h3 className="font-serif text-lg font-bold text-ink-900">{course.name}</h3><p className="mt-1 font-sans text-sm text-ink-600">Par {course.holes.reduce((sum, hole) => sum + hole.par, 0)} · {course.holes.reduce((sum, hole) => sum + hole.yards, 0).toLocaleString()} yards</p></div><Link href={`/portal/admin/course-library/${course.id}`} className="shrink-0 font-condensed text-2xs font-bold uppercase text-maroon-700 underline">Edit course</Link></div><p className="mt-1 font-sans text-xs text-ink-500">{course.teeSets?.length ?? 1} tee set{(course.teeSets?.length ?? 1) === 1 ? "" : "s"} · {course.rating != null ? `Rating ${course.rating}` : "Rating not entered"}{course.slope != null ? ` · Slope ${course.slope}` : ""}</p><div className="mt-3"><button type="button" onClick={() => setUpdatingId(updatingId === course.id ? null : course.id)} className="font-condensed text-xs font-bold uppercase text-maroon-700 underline">{updatingId === course.id ? "Close CSV update" : "Update course"}</button></div>{updatingId === course.id && <CourseCsvImport courseId={course.id} onSaved={(updated) => setCourses((current) => current.map((entry) => entry.id === updated.id ? updated : entry))} />}<DeleteCourseButton course={course} onDeleted={() => setCourses((current) => current.filter((entry) => entry.id !== course.id))} /></article>)}
        {courses.length === 0 && <p className="font-sans text-sm text-ink-500">No saved courses yet. Import the corrected historical setups or add one from a scorecard.</p>}
      </div>
    </section>
  </div>;
}
