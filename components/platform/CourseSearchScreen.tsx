"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, FlagTriangleRight, X } from "lucide-react";
import { SearchBar } from "@/components/search/SearchBar";
import { useRecents } from "@/components/search/recents";
import styles from "@/components/search/Search.module.css";
import { cityState } from "@/lib/data/usStates";

/** One search result as /api/courses/search returns it. `ref` opens the course later; it is never shown. */
export interface CourseResult { ref: string; name: string; city: string | null; state: string | null; par: number | null }

export const place = (course: Pick<CourseResult, "city" | "state">) => cityState(course.city, course.state);

type SearchState =
  | { status: "loading" }
  | { status: "done"; courses: CourseResult[]; attribution: string }
  | { status: "error"; message: string };

type RecentCourse = CourseResult & { id: string };
const isRecentCourse = (value: unknown): value is RecentCourse => {
  const v = value as RecentCourse | null;
  return !!v && typeof v.id === "string" && typeof v.ref === "string" && typeof v.name === "string";
};
const RECENT_KEY = "maroon-course-recent-v1";
const DEBOUNCE_MS = 350;

/**
 * Course search in the app's standard search look (owner request 2026-11-22: looks like Friends search). Full screen,
 * maroon: Back · search box · Cancel, then Recent courses (this phone only) before typing, results after 2+ letters.
 * Searches run on the server (/api/courses/search → our course library, then GolfCourseAPI) a moment after typing stops;
 * a newer query cancels the older request so a stale reply never shows. The words typed live in the parent (`query`), so
 * coming back from a course keeps them. `overlay`: opened over another screen (Explore → Courses) instead of being the page.
 */
export function CourseSearchScreen({ query, onQuery, onPick, onBack, overlay = false }: {
  query: string;
  onQuery: (value: string) => void;
  onPick: (course: CourseResult) => void;
  onBack: () => void;
  overlay?: boolean;
}) {
  const [result, setResult] = useState<SearchState>({ status: "loading" });
  const { recents, remember, forget } = useRecents(RECENT_KEY, isRecentCourse);
  const words = query.trim();
  const typing = words.length >= 2;

  useEffect(() => {
    if (!typing) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResult({ status: "loading" });
      try {
        const response = await fetch(`/api/courses/search?q=${encodeURIComponent(words)}`, { signal: controller.signal });
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
  }, [words, typing]);

  // Over another screen: the page underneath doesn't scroll while this is open.
  useEffect(() => {
    if (!overlay) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = before; };
  }, [overlay]);

  function pick(course: CourseResult) {
    remember({ id: course.ref, ref: course.ref, name: course.name, city: course.city, state: course.state, par: course.par });
    onPick(course);
  }
  const sub = (course: CourseResult) => [place(course), course.par !== null ? `Par ${course.par}` : null].filter(Boolean).join(" · ") || "Location unavailable";
  /** One row: flag icon, name (bold), "City, ST · Par 72" (grey); a chevron unless the row has its own × (Recent). */
  const row = (course: CourseResult, chevron = true) => <button type="button" className={styles.who} onClick={() => pick(course)}>
    <span className={styles.icon} aria-hidden="true"><FlagTriangleRight size={20} /></span>
    <span className={styles.names}><b>{course.name}</b><small>{sub(course)}</small></span>
    {chevron && <ChevronRight size={18} aria-hidden="true" className={styles.chevron} />}
  </button>;

  const shown = result;
  const screen = <main className={`${styles.page} ${overlay ? styles.overlay : "app-own-top-clearance"}`} aria-label="Search golf courses">
    <div className={styles.inner}>
      <div className={styles.top}>
        <SearchBar value={query} onChange={onQuery} onBack={onBack} placeholder="Course, club, or city" label="Search golf courses by name, club or city"
          maxLength={100} autoFocus={!query} />
      </div>
      {typing && shown.status === "error" && <p className={styles.problem} role="alert">{shown.message}</p>}

      {typing ? (shown.status === "loading" ? <p className={styles.note}>Searching…</p>
        : shown.status === "error" ? null
        : !shown.courses.length ? <p className={styles.note}>No results for &ldquo;{words}&rdquo;. Try the club name or the city.</p>
        : <>
          <ul className={styles.list} aria-label="Courses">{shown.courses.map((c) => <li key={c.ref}>{row(c)}</li>)}</ul>
          {shown.attribution && <p className={styles.credit}>{shown.attribution}</p>}
        </>)
      : recents.length > 0 ? <section aria-labelledby="course-recent">
        <div className={styles.headingRow}><h2 id="course-recent" className={styles.heading}>Recent</h2><button type="button" className={styles.clear} onClick={() => forget(null)}>Clear all</button></div>
        <ul className={styles.list}>{recents.map((c) => <li key={c.id}>
          {row(c, false)}
          <button type="button" className={styles.remove} aria-label={`Remove ${c.name} from recent`} onClick={() => forget(c.id)}><X size={18} aria-hidden="true" /></button>
        </li>)}</ul>
      </section>
      : <p className={styles.note}>Search for a course by name, club or city.</p>}
    </div>
  </main>;
  return overlay ? createPortal(screen, document.body) : screen;
}
