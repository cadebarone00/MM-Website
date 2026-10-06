"use client";

import { useEffect, useState } from "react";
import { ChevronRight, LoaderCircle, Search } from "lucide-react";
import { ExploreCourseProfile } from "./ExploreCourseProfile";
import styles from "./ExploreCourseSearch.module.css";
import { cityState } from "@/lib/data/usStates";

/** One search result as /api/courses/search returns it. `ref` opens the course later; it is never shown. */
export interface CourseResult { ref: string; name: string; city: string | null; state: string | null; par: number | null }

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; courses: CourseResult[]; attribution: string }
  | { status: "error"; message: string };

const DEBOUNCE_MS = 350;
export const place = (course: Pick<CourseResult, "city" | "state">) => cityState(course.city, course.state);

/**
 * Explore → Courses: search golf courses by name, club or city, and pick one. Searches run on the server
 * (/api/courses/search → the OpenGolf provider) a moment after typing stops; older replies are dropped. Picking a
 * course opens its preview here (ExploreCourseProfile).
 */
export function ExploreCourseSearch() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<CourseResult | null>(null);
  // Under two letters nothing is searched, whatever the last reply was.
  const search: SearchState = query.trim().length < 2 ? { status: "idle" } : result;

  // A moment after typing stops, search; a newer query cancels the older request so a stale reply never shows.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResult({ status: "loading" });
      try {
        const response = await fetch(`/api/courses/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        const body = await response.json() as { ok: boolean; courses?: CourseResult[]; attribution?: string; code?: string };
        if (!body.ok || !body.courses) {
          setResult({ status: "error", message: body.code === "busy" ? "Course search is busy right now. Try again in a few minutes." : "Course search isn't available right now." });
          return;
        }
        setResult({ status: "done", courses: body.courses, attribution: body.attribution ?? "" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResult({ status: "error", message: "Couldn't reach course search. Check your connection." });
      }
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  if (selected) return <ExploreCourseProfile course={selected} onBack={() => setSelected(null)} />;

  return <section className={styles.panel} aria-label="Search golf courses">
    <p className={styles.kicker}>The Maroon &middot; Courses</p>
    <h2 className={styles.title}>Find a course.</h2>
    <label className={styles.searchBox}>
      <Search size={18} aria-hidden="true" />
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by course, club, or city…"
        aria-label="Search golf courses" autoComplete="off" enterKeyHint="search" maxLength={100} />
      {search.status === "loading" && <LoaderCircle size={18} className={styles.spinner} aria-label="Searching" />}
    </label>

    {search.status === "idle" && <p className={styles.hint}>Type at least two letters to search courses across the country.</p>}
    {search.status === "error" && <p className={styles.hint} role="alert">{search.message}</p>}
    {search.status === "done" && (search.courses.length === 0
      ? <p className={styles.hint}>No courses found for “{query.trim()}”. Try the club name or the city.</p>
      : <>
        <ul className={styles.results} aria-label="Courses">
          {search.courses.map((course) => <li key={course.ref}>
            <button type="button" onClick={() => setSelected(course)}>
              <span className={styles.resultText}>
                <strong>{course.name}</strong>
                <small>{[place(course), course.par !== null ? `Par ${course.par}` : null].filter(Boolean).join(" · ") || "Location unavailable"}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </li>)}
        </ul>
        {search.attribution && <p className={styles.credit}>Course data {search.attribution}</p>}
      </>)}
  </section>;
}
