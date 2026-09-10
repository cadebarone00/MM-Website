"use client";

import { useState } from "react";
import Link from "next/link";
import type { LiveCourse } from "@/lib/live/types";
import { CourseNameEditor } from "./CourseNameEditor";
import { DeleteCourseButton } from "./DeleteCourseButton";
import { golfCoreUrl } from "@/lib/live/golfCoreMapping";
import { CourseApiSearch } from "./CourseApiSearch";

export function CourseLibraryPanel({ initialCourses, apiConfigured = true }: { initialCourses: LiveCourse[]; apiConfigured?: boolean }) {
  const [courses, setCourses] = useState(initialCourses);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  function save(course: LiveCourse) {
    setCourses((current) => [...current.filter((entry) => entry.id !== course.id), course].sort((a, b) => a.name.localeCompare(b.name)));
  }
  async function refresh(course: LiveCourse) {
    const providerId = course.teeSets?.find((tee) => tee.apiSource?.provider === "golfcore")?.apiSource?.courseId;
    if (!providerId) return;
    setBusyId(course.id); setError(null); setMessage("");
    try {
      const response = await fetch("/api/portal/tiger/courses/provider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, providerId }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Refresh failed.");
      save(data.course); setMessage(`${course.name} refreshed. Your manual edits were preserved; changed tee sets are drafts for review.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Refresh failed."); }
    finally { setBusyId(null); }
  }
  const visible = courses.filter((course) => course.name.toLowerCase().includes(filter.toLowerCase()));
  return <div className="mt-6">
    <section className="rounded-xl border border-gold-300 bg-cream-50 p-5">
      <h1 className="font-serif text-3xl font-bold text-ink-900">Course Library</h1>
      <p className="mt-2 text-sm text-ink-600">Find a course, download its tee sets, and make it ready for play.</p>
      <CourseApiSearch configured={apiConfigured} courses={courses} onSaved={save} />
    </section>
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3"><h2 className="font-serif text-2xl font-bold">Saved courses</h2><span className="text-xs text-ink-500">{courses.length} total</span></div>
      <input aria-label="Filter saved courses" placeholder="Filter saved courses" value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-3 w-full rounded border border-stone-300 px-3 py-2 text-sm" />
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-3 text-sm text-maroon-700">{message}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{visible.map((course) => {
        const source = course.teeSets?.find((tee) => tee.apiSource?.provider === "golfcore")?.apiSource;
        const locked = course.teeSets?.filter((tee) => tee.locked).length ?? 0;
        return <article key={course.id} className="rounded-lg border border-stone-300 bg-white p-4">
          <h3 className="font-serif text-lg font-bold">{course.name}</h3><CourseNameEditor id={course.id} name={course.name} onSaved={(name) => save({ ...course, name })} />
          <p className="mt-1 text-sm text-ink-600">{course.teeSets?.length ?? 1} tee sets · {locked} available</p>
          <p className="mt-1 text-xs text-ink-500">{source ? `GolfCore · Updated ${new Date(source.syncedAt).toLocaleDateString()}` : "Manually maintained"}</p>
          {source && <a href={golfCoreUrl(source.courseId)} target="_blank" rel="noreferrer" className="text-xs underline">Course data: GolfCore</a>}
          <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold text-maroon-700">
            <Link href={`/portal/admin/course-library/${course.id}`} className="underline">Review / edit tees</Link>
            {source ? <button type="button" disabled={!!busyId || !apiConfigured} onClick={() => refresh(course)} className="underline disabled:opacity-40">{busyId === course.id ? "Refreshing…" : "Refresh from API"}</button> : <button type="button" onClick={() => setLinkingId(linkingId === course.id ? null : course.id)} className="underline">Find course online</button>}
          </div>
          {linkingId === course.id && <CourseApiSearch key={course.id} configured={apiConfigured} courses={courses} target={course} onSaved={save} onCancel={() => setLinkingId(null)} />}
          <DeleteCourseButton course={course} onDeleted={() => setCourses((current) => current.filter((entry) => entry.id !== course.id))} />
        </article>;
      })}</div>
      {!visible.length && <p className="mt-4 text-sm text-ink-500">{courses.length ? "No saved courses match your search." : "Search above to import your first course."}</p>}
    </section>
  </div>;
}
