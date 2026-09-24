"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { HandicapCourseOption } from "@/lib/handicap/types";
import { formatCourseLocation } from "@/lib/data/courseLocation";
import { useFavoriteCourses } from "./useFavoriteCourses";

type Tab = "recent" | "nearby" | "my-courses";
const TABS: { id: Tab; label: string }[] = [
  { id: "recent", label: "Recently Played" },
  { id: "nearby", label: "Nearby" },
  { id: "my-courses", label: "My Courses" },
];

function CourseRow({
  course,
  favorited,
  onToggleFavorite,
  onSelect,
}: {
  course: HandicapCourseOption;
  favorited: boolean;
  onToggleFavorite: () => void;
  onSelect: () => void;
}) {
  const location = formatCourseLocation(course.city, course.state);
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onSelect} className="block flex-1 py-3 pl-1 text-left font-sans text-sm text-ink-900 hover:text-maroon-700">
        {course.name}
        {location && <span className="block text-xs text-ink-500">{location}</span>}
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={favorited ? `Remove ${course.name} from My Courses` : `Add ${course.name} to My Courses`}
        aria-pressed={favorited}
        className="shrink-0 p-2 text-ink-300 hover:text-gold-500"
      >
        <Star size={18} fill={favorited ? "currentColor" : "none"} className={favorited ? "text-gold-500" : ""} />
      </button>
    </div>
  );
}

/**
 * First screen of "Submit a score": search a course, or tap one from
 * Recently Played / Nearby / My Courses. Selecting a course hands it back
 * to the wizard.
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
  const [tab, setTab] = useState<Tab>("recent");
  const { isFavorite, toggleFavorite } = useFavoriteCourses();

  const trimmed = search.trim().toLowerCase();
  const isSearching = trimmed.length > 0;

  const recentCourses = recentCourseIds
    .map((id) => courses.find((course) => course.id === id))
    .filter((course): course is HandicapCourseOption => !!course);
  const myCourses = courses.filter((course) => isFavorite(course.id));

  const results = isSearching
    ? courses.filter((course) => course.name.toLowerCase().includes(trimmed))
    : tab === "recent"
    ? recentCourses
    : tab === "my-courses"
    ? myCourses
    : [];

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

      {!isSearching && (
        <div className="mt-4 flex border-b border-ink-200" role="tablist" aria-label="Course list">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex-1 px-1 pb-2 font-condensed text-xs font-bold uppercase tracking-wide transition-colors ${tab === t.id ? "text-maroon-700" : "text-ink-400 hover:text-ink-700"}`}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-maroon-700" />}
            </button>
          ))}
        </div>
      )}

      {isSearching && results.length === 0 && (
        <p className="mt-4 font-sans text-sm text-ink-500">No courses match &ldquo;{search.trim()}&rdquo;.</p>
      )}

      {!isSearching && tab === "nearby" && (
        <p className="mt-4 font-sans text-sm text-ink-500">Nearby is coming in a later round.</p>
      )}

      {results.length > 0 && (
        <div className="mt-2 divide-y divide-stone-200 border-y border-stone-200">
          {results.map((course) => (
            <CourseRow
              key={course.id}
              course={course}
              favorited={isFavorite(course.id)}
              onToggleFavorite={() => toggleFavorite(course.id)}
              onSelect={() => onSelect(course)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
