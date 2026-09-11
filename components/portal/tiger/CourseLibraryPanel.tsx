"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse } from "@/lib/live/types";
import { formatCourseLocation } from "@/lib/data/courseLocation";
import { CourseNameEditor } from "./CourseNameEditor";
import { CourseLocationEditor } from "./CourseLocationEditor";
import { DeleteCourseButton } from "./DeleteCourseButton";

import { CourseCsvImport } from "./CourseCsvImport";

export function CourseLibraryPanel({ initialCourses }: { initialCourses: LiveCourse[] }) {
  const [courses, setCourses] = useState(initialCourses);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  function save(course: LiveCourse) {
    setCourses((current) => [...current.filter((entry) => entry.id !== course.id), course].sort((a, b) => a.name.localeCompare(b.name)));
  }
  async function create() {
    setBusyId("new"); setError(null); setMessage("");
    try {
      const response = await fetch("/api/portal/tiger/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not create course.");
      save(data.course); setNewName(""); setMessage("Course created. Open Review / edit tees to add tee sets, or import a CSV.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create course."); }
    finally { setBusyId(null); }
  }
  const visible = courses.filter((course) => course.name.toLowerCase().includes(filter.toLowerCase()));
  return <div className="mt-6">
    <section className="rounded-xl border border-gold-300 bg-cream-50 p-5">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Course Library</h1>
      <p className="mt-2 text-sm text-ink-600">Create a course, verify its tee sets and yardages, then lock them for play.</p>
      <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void create(); }}><input aria-label="New course name" placeholder="Course name" required maxLength={200} value={newName} onChange={(event) => setNewName(event.target.value)} className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-3 py-2" /><button disabled={!!busyId || !newName.trim()} className="rounded bg-maroon-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{busyId ? "Creating..." : "Add course"}</button></form>
    </section>
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3"><h2 className="font-serif text-2xl font-bold">Saved courses</h2><span className="text-xs text-ink-500">{courses.length} total</span></div>
      <input aria-label="Filter saved courses" placeholder="Filter saved courses" value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-3 w-full rounded border border-stone-300 px-3 py-2 text-sm" />
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-maroon-700">{message}</p>}
      <div className="mt-3 flex flex-col gap-2">{visible.map((course) => {
        const locked = course.teeSets?.filter((tee) => tee.locked).length ?? 0;
        const location = formatCourseLocation(course.city, course.state);
        return <article key={course.id} className="flex flex-wrap items-start gap-x-5 gap-y-2 rounded-lg border border-stone-300 bg-white p-3">
          <div className="min-w-[11rem] flex-1 basis-48">
            <h3 className="truncate font-serif text-sm font-bold">{course.name}</h3>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-x-3">
              {location && <p className="text-xs text-ink-500">{location}</p>}
              <CourseNameEditor id={course.id} name={course.name} onSaved={(name) => save({ ...course, name })} />
            </div>
            <CourseLocationEditor id={course.id} city={course.city ?? null} state={course.state ?? null} zipCode={course.zipCode ?? null} onSaved={(loc) => save({ ...course, ...loc })} />
          </div>
          <div className="min-w-[9rem] flex-1 basis-40">
            <p className="text-xs text-ink-600">{course.teeSets?.length ?? 1} tee sets · {locked} available</p>
            <Link href={`/portal/admin/course-library/${course.id}`} className="mt-1 block text-xs font-bold text-maroon-700 underline">Review / edit tees</Link>
          </div>
          <CourseCsvImport course={course} onSaved={save} />
          <DeleteCourseButton course={course} onDeleted={() => setCourses((current) => current.filter((entry) => entry.id !== course.id))} />
        </article>;
      })}</div>
      {!visible.length && <p className="mt-4 text-sm text-ink-500">{courses.length ? "No saved courses match your search." : "Add your first course above."}</p>}
    </section>
  </div>;
}
