"use client";

import { useState } from "react";
import type { HandicapCourseOption } from "@/lib/handicap/types";

/**
 * First screen of "Submit a score": search a course, or tap one you've
 * recently played. Selecting a course hands it back to the wizard.
 */
export function HandicapCourseLookup({
  courses,
  recentCourseIds,
  onSelect,
}: {
  courses: HandicapCourseOption[];
  recentCourseIds: string[];
  onSelect: (course: HandicapCourseOption) => void;
}) {
  const [search, setSearch] = useState("");
  const trimmed = search.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const recentCourses = recentCourseIds
    .map((id) => courses.find((course) => course.id === id))
    .filter((course): course is HandicapCourseOption => !!course);

  const results = isSearching
    ? courses.filter((course) => course.name.toLowerCase().includes(trimmed))
    : recentCourses;

  return (
    <div className="rounded-md border border-ink-100 bg-white p-4">
      <h1 className="font-serif text-2xl font-bold text-ink-900">Select course</h1>

      <label className="mt-4 flex flex-col gap-1">
        <span className="sr-only">Search for a course</span>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter course name"
          className="rounded-sm border border-ink-200 px-3 py-2 font-sans text-sm"
        />
      </label>

      {!isSearching && results.length > 0 && (
        <p className="mt-4 font-condensed text-xs font-semibold uppercase tracking-wide text-ink-500">Recently played</p>
      )}

      {isSearching && results.length === 0 && (
        <p className="mt-4 font-sans text-sm text-ink-500">No courses match &ldquo;{search.trim()}&rdquo;.</p>
      )}

      {results.length > 0 && (
        <div className="mt-2 divide-y divide-stone-200 border-y border-stone-200">
          {results.map((course) => (
            <button
              key={course.id}
              type="button"
              onClick={() => onSelect(course)}
              className="block w-full px-1 py-3 text-left font-sans text-sm text-ink-900 hover:text-maroon-700"
            >
              {course.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
