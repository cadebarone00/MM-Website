"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { GolfTripActionSheet } from "./GolfTripActionSheet";
import gameStyles from "./GolfTripGames.module.css";
import styles from "./TripScheduleCoursePicker.module.css";
import { cityState } from "@/lib/data/usStates";

/** A course picked for a Trip Schedule round, with its optional settings (set now or later). */
export interface PickedCourse {
  ref: string;
  name: string;
  place: string;
  par: number | null;
  /** Course settings — undefined until set up ("Later"). */
  settings?: { tees: string | null; teeTime: string; handicap: boolean };
}

interface CourseResult { ref: string; name: string; city: string | null; state: string | null; par: number | null }
interface CourseDetail { teeSets: { name: string; totalYards?: number }[]; attribution: string }
type Search = { status: "idle" } | { status: "loading" } | { status: "done"; courses: CourseResult[]; attribution: string } | { status: "error"; message: string };

const DEBOUNCE_MS = 350;
const placeOf = (course: Pick<CourseResult, "city" | "state">) => cityState(course.city, course.state);

/** The app's course search (/api/courses/search) for what's typed: a moment after typing stops; a newer query cancels an
 *  older request so a stale reply never shows. Under two letters: idle. */
function useCourseSearch(query: string): Search {
  const [result, setResult] = useState<Search>({ status: "idle" });
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setResult({ status: "loading" });
      try {
        const response = await fetch(`/api/courses/search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        const body = await response.json() as { ok: boolean; courses?: CourseResult[]; attribution?: string; code?: string };
        if (!body.ok || !body.courses) setResult({ status: "error", message: body.code === "busy" ? "Course search is busy right now. Try again in a few minutes." : "Course search isn't available right now." });
        else setResult({ status: "done", courses: body.courses, attribution: body.attribution ?? "" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResult({ status: "error", message: "Couldn't reach course search. Check your connection." });
      }
    }, DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  return query.trim().length < 2 ? { status: "idle" } : result;
}

/**
 * A golf course search bar: type a course, club or city and tap a result. `floating`: the results open over the page below
 * (nothing moves); otherwise they list right under the bar (inside the Edit course pop-up). Closes once one is picked.
 */
export function CourseSearchBar({ roundLabel, onPick, floating = true, autoFocus = false }: { roundLabel: string; onPick: (course: PickedCourse) => void; floating?: boolean; autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const search = useCourseSearch(query);
  const open = query.trim().length >= 2;
  return <div className={floating ? styles.searchBar : styles.searchBarInline}>
    <label className={styles.searchBox}>
      <Search size={18} aria-hidden="true" />
      <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search golf courses…"
        aria-label={`Search golf courses for ${roundLabel}`} autoComplete="off" enterKeyHint="search" maxLength={100} autoFocus={autoFocus} />
      {search.status === "loading" && <LoaderCircle size={18} className={styles.spinner} aria-label="Searching" />}
    </label>
    {open && <div className={floating ? styles.searchResults : styles.searchResultsInline} role="region" aria-label="Course results">
      {search.status === "loading" && <p className={gameStyles.sheetHint} role="status">Searching…</p>}
      {search.status === "error" && <p className={gameStyles.sheetHint} role="alert">{search.message}</p>}
      {search.status === "done" && (search.courses.length === 0
        ? <p className={gameStyles.sheetHint}>No courses found for “{query.trim()}”. Try the club name or the city.</p>
        : <>
          {search.courses.map((course) => <button type="button" key={course.ref} className={gameStyles.sheetGame}
            onClick={() => { onPick({ ref: course.ref, name: course.name, place: placeOf(course), par: course.par }); setQuery(""); }}>
            <strong>{course.name}</strong><span>{[placeOf(course), course.par !== null ? `Par ${course.par}` : null].filter(Boolean).join(" · ") || "Location unavailable"}</span>
          </button>)}
          {search.attribution && <p className={styles.credit}>{search.attribution}</p>}
        </>)}
    </div>}
  </div>;
}

/**
 * Trip Schedule → tap a round's course: the same pop-up as Games → New game. 1) Search golf courses (the app's course
 * search, /api/courses/search) and tap one. 2) Choose course settings now or later. 3) Now: tee box (from the course's
 * real tee sets), tee time and handicap, then Save course. Later saves just the course.
 * `askSettings={false}` (History's past rounds) saves the course as soon as it's tapped — no settings step.
 */
export function TripScheduleCoursePicker({ roundLabel, current, onPick, onClose, askSettings = true }: {
  roundLabel: string;
  current?: PickedCourse;
  onPick: (course: PickedCourse) => void;
  onClose: () => void;
  askSettings?: boolean;
}) {
  // Same fixed size as New game: top just covers the trip tabs (or 16px), bottom sits 5% of the screen above the bottom nav.
  const [sheetBox] = useState(() => {
    const tabs = document.querySelector("[aria-label='Trip sections']")?.getBoundingClientRect();
    const nav = document.querySelector("[data-site-bottom-nav]")?.getBoundingClientRect();
    return { top: Math.max(16, tabs?.top ?? 16), bottom: (nav && nav.height > 0 ? window.innerHeight - nav.top : 0) + window.innerHeight * 0.05 };
  });
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<CourseResult | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const search = useCourseSearch(query);

  const pick = (settings?: PickedCourse["settings"]) => {
    if (!chosen) return;
    onPick({ ref: chosen.ref, name: chosen.name, place: placeOf(chosen), par: chosen.par, settings });
  };

  return <GolfTripActionSheet label={`Choose course for ${roundLabel}`} onClose={onClose} className={gameStyles.gameSheet} style={sheetBox}>
    {!chosen ? <div className={gameStyles.sheetBody}>
      <h3 className={gameStyles.sheetTitle}>Choose course</h3>
      <p className={styles.subtitle}>{roundLabel}{current ? ` · Now: ${current.name}` : ""}</p>
      <label className={styles.searchBox}>
        <Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by course, club, or city…"
          aria-label="Search golf courses" autoComplete="off" enterKeyHint="search" maxLength={100} autoFocus />
        {search.status === "loading" && <LoaderCircle size={18} className={styles.spinner} aria-label="Searching" />}
      </label>
      {search.status === "idle" && <p className={gameStyles.sheetHint}>Type at least two letters to search courses.</p>}
      {search.status === "error" && <p className={gameStyles.sheetHint} role="alert">{search.message}</p>}
      {search.status === "done" && (search.courses.length === 0
        ? <p className={gameStyles.sheetHint}>No courses found for “{query.trim()}”. Try the club name or the city.</p>
        : <section className={gameStyles.sheetGroup} aria-label="Courses">
          <h4 className={gameStyles.sheetGroupTitle}>Courses</h4>
          {search.courses.map((course) => <button type="button" key={course.ref} className={gameStyles.sheetGame} onClick={() => { if (!askSettings) onPick({ ref: course.ref, name: course.name, place: placeOf(course), par: course.par }); else { setChosen(course); setSettingUp(false); } }}>
            <strong>{course.name}</strong><span>{[placeOf(course), course.par !== null ? `Par ${course.par}` : null].filter(Boolean).join(" · ") || "Location unavailable"}</span>
          </button>)}
          {search.attribution && <p className={styles.credit}>{search.attribution}</p>}
        </section>)}
    </div>
    : !settingUp ? <div className={gameStyles.sheetBody}>
      <button type="button" className={gameStyles.sheetBack} onClick={() => setChosen(null)}>← Search courses</button>
      <h3 className={gameStyles.sheetTitle}>{chosen.name}</h3>
      <p className={styles.subtitle}>{[placeOf(chosen), chosen.par !== null ? `Par ${chosen.par}` : null, roundLabel].filter(Boolean).join(" · ")}</p>
      <div className={gameStyles.sheetSetting}><span>Course settings</span>
        <p className={gameStyles.sheetHint}>Set the tee box, tee time and handicap now, or come back to it later.</p>
      </div>
      <button type="button" className={gameStyles.sheetPrimary} onClick={() => setSettingUp(true)}>Set up now</button>
      <button type="button" className={styles.secondary} onClick={() => pick()}>Later</button>
    </div>
    : <CourseSettings course={chosen} initial={current?.ref === chosen.ref ? current.settings : undefined} onBack={() => setSettingUp(false)} onSave={pick} />}
  </GolfTripActionSheet>;
}

/** Screen 3: tee box (the course's real tee sets when available), tee time and handicap. */
function CourseSettings({ course, initial, onBack, onSave }: {
  course: CourseResult; initial?: PickedCourse["settings"]; onBack: () => void; onSave: (settings: NonNullable<PickedCourse["settings"]>) => void;
}) {
  const [detail, setDetail] = useState<CourseDetail | "loading" | "unavailable">("loading");
  const [tees, setTees] = useState<string | null>(initial?.tees ?? null);
  const [teeTime, setTeeTime] = useState(initial?.teeTime ?? "08:00");
  const [handicap, setHandicap] = useState(initial?.handicap ?? true);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courses/${encodeURIComponent(course.ref)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ ok: boolean; course?: CourseDetail }>)
      .then((body) => setDetail(body.ok && body.course ? body.course : "unavailable"))
      .catch((error: Error) => { if (error.name !== "AbortError") setDetail("unavailable"); });
    return () => controller.abort();
  }, [course.ref]);

  const teeSets = typeof detail === "object" ? detail.teeSets : [];
  return <div className={gameStyles.sheetBody}>
    <button type="button" className={gameStyles.sheetBack} onClick={onBack}>← {course.name}</button>
    <h3 className={gameStyles.sheetTitle}>Course settings</h3>
    <div className={gameStyles.sheetSetting}><span>Tee box</span>
      {detail === "loading" && <p className={gameStyles.sheetHint} role="status">Loading tee boxes…</p>}
      {detail !== "loading" && teeSets.length === 0 && <p className={gameStyles.sheetHint}>No tee box info for this course — you can set it later.</p>}
      {teeSets.length > 0 && <div className={gameStyles.sheetChoices}>
        {teeSets.map((set) => <button type="button" key={set.name} aria-pressed={tees === set.name} onClick={() => setTees(set.name)}>
          {set.name}{set.totalYards ? ` · ${set.totalYards.toLocaleString("en-US")} yds` : ""}</button>)}
      </div>}
    </div>
    <label className={gameStyles.sheetSetting}><span>Tee time</span>
      <input type="time" className={styles.timeInput} value={teeTime} onChange={(event) => setTeeTime(event.target.value)} />
    </label>
    <div className={gameStyles.sheetSetting}><span>Handicap</span><div className={gameStyles.sheetChoices}>
      {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={handicap === value} onClick={() => setHandicap(value)}>{value ? "On" : "Off"}</button>)}
    </div></div>
    <button type="button" className={gameStyles.sheetPrimary} disabled={!teeTime} onClick={() => onSave({ tees, teeTime, handicap })}>Save course</button>
    {typeof detail === "object" && detail.attribution && <p className={styles.credit}>{detail.attribution}</p>}
  </div>;
}

/**
 * Golf Schedule → a round's page → Edit (next to the course): a pop-up with the course search bar. Tapping a result makes
 * it the round's course and closes the pop-up.
 */
/** `title`: "Select course" for a round just added (+ Add Round), "Edit course" otherwise. */
export function CourseEditSheet({ roundLabel, current, onPick, onClose, title = "Edit course" }: { roundLabel: string; current: string; onPick: (course: PickedCourse) => void; onClose: () => void; title?: "Edit course" | "Select course" }) {
  // Top 16px below the phone's notch / status bar; bottom 5% of the screen above the bottom nav.
  const [sheetBox] = useState(() => {
    const nav = document.querySelector("[data-site-bottom-nav]")?.getBoundingClientRect();
    return { top: "calc(16px + var(--app-safe-top, 0px))", bottom: (nav && nav.height > 0 ? window.innerHeight - nav.top : 0) + window.innerHeight * 0.05 };
  });
  return <GolfTripActionSheet label={`${title} for ${roundLabel}`} onClose={onClose} className={gameStyles.gameSheet} style={sheetBox}>
    <div className={gameStyles.sheetBody}>
      <h3 className={gameStyles.sheetTitle}>{title}</h3>
      <p className={styles.subtitle}>{roundLabel} · Now: {current}</p>
      <CourseSearchBar roundLabel={roundLabel} onPick={onPick} floating={false} autoFocus />
    </div>
  </GolfTripActionSheet>;
}
