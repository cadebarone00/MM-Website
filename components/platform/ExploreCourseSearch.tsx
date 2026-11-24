"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { CourseSearchScreen, type CourseResult } from "./CourseSearchScreen";
import { ExploreCourseProfile } from "./ExploreCourseProfile";
import styles from "./ExploreCourseSearch.module.css";

export { place, type CourseResult } from "./CourseSearchScreen";

/**
 * Explore → Courses. The search box here is a tap target: it pulls up the full-screen course search in the app's
 * standard search look (CourseSearchScreen, owner request 2026-11-22). Picking a course opens its preview here
 * (ExploreCourseProfile); Back from the preview goes back to the search with the words still typed.
 * "Courses near me" is off for now (owner, 2026-11-21): GolfCourseAPI only offers it on a paid plan.
 */
export function ExploreCourseSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CourseResult | null>(null);

  if (selected) return <ExploreCourseProfile course={selected} onBack={() => { setSelected(null); setOpen(true); }} />;

  return <section className={styles.panel} aria-label="Search golf courses">
    <p className={styles.kicker}>The Maroon · Courses</p>
    <h2 className={styles.title}>Find a course.</h2>
    <button type="button" className={styles.searchBox} onClick={() => setOpen(true)} aria-label="Search golf courses">
      <Search size={18} aria-hidden="true" />
      <span className={query ? styles.searchText : styles.searchPlaceholder}>{query || "Course, club, or city"}</span>
    </button>
    {open && <CourseSearchScreen overlay query={query} onQuery={setQuery} onBack={() => setOpen(false)}
      onPick={(course) => { setOpen(false); setSelected(course); }} />}
  </section>;
}
