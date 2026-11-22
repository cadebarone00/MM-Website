"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FlagTriangleRight, LoaderCircle, Search } from "lucide-react";
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
 * (/api/courses/search → GolfCourseAPI) a moment after typing stops; older replies are dropped. Picking a
 * course opens its preview here (ExploreCourseProfile).
 */
/**
 * `onPick` (Play a round): picking a course hands it back instead of opening its preview. `kicker` / `title` change the
 * heading. "Courses near me" is off for now (owner, 2026-11-21): GolfCourseAPI only offers it on a paid plan.
 */
export function ExploreCourseSearch({ onPick, kicker = "The Maroon · Courses", title = "Find a course." }: { onPick?: (course: CourseResult) => void; kicker?: string; title?: string } = {}) {
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

  const pick = (course: CourseResult) => onPick ? onPick(course) : setSelected(course);
  const list = (courses: CourseResult[], label: string) => <ul className={styles.results} aria-label={label}>
    {courses.map((course) => <li key={course.ref}>
      <button type="button" onClick={() => pick(course)}>
        <span className={styles.flag} aria-hidden="true"><FlagTriangleRight size={18} /></span>
        <span className={styles.resultText}>
          <strong>{course.name}</strong>
          <small>{[place(course), course.par !== null ? `Par ${course.par}` : null].filter(Boolean).join(" · ") || "Location unavailable"}</small>
        </span>
        <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />
      </button>
    </li>)}
  </ul>;
  const skeleton = <ul className={styles.results} aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className={styles.skeleton} />)}</ul>;

  return <section className={styles.panel} aria-label="Search golf courses">
    <p className={styles.kicker}>{kicker}</p>
    <h2 className={styles.title}>{title}</h2>
    <label className={styles.searchBox}>
      <Search size={18} aria-hidden="true" />
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Course, club, or city"
        aria-label="Search golf courses" autoComplete="off" enterKeyHint="search" maxLength={100} />
      {search.status === "loading" && <LoaderCircle size={18} className={styles.spinner} aria-label="Searching" />}
    </label>

    {search.status === "loading" && skeleton}
    {search.status === "error" && <p className={styles.hint} role="alert">{search.message}</p>}
    {search.status === "done" && (search.courses.length === 0
      ? <p className={styles.hint}>No courses found for &ldquo;{query.trim()}&rdquo;. Try the club name or the city.</p>
      : <>{list(search.courses, "Courses")}{search.attribution && <p className={styles.credit}>{search.attribution}</p>}</>)}
  </section>;
}
