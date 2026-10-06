"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, LoaderCircle, LocateFixed, Map as MapIcon, MapPin, Navigation } from "lucide-react";
import { CourseGpsNavigator } from "@/components/platform/gps/CourseGpsNavigator";
import type { CoursePreview } from "@/lib/platform/golfGps/coursePreview";
import type { GpsCourse } from "@/lib/platform/golfGps/types";
import type { CourseResult } from "./ExploreCourseSearch";
import styles from "./ExploreCourseSearch.module.css";

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

const place = (course: { city?: string | null; state?: string | null }) => [course.city, course.state].filter(Boolean).join(", ");
const busy = (code?: string) => code === "busy" ? "Course data is busy right now. Try again in a few minutes." : "Course details aren't available right now.";

/**
 * Explore → Courses → a picked course: a preview card (name, place, par, tees, what's available) with View Course, and
 * Open GPS (saved, GPS-ready course) or Prepare GPS (the server builds and saves the course's GPS on request, then GPS
 * opens from the saved copy). Details load once, for this course only
 * (/api/courses/<ref>: the library first, else OpenGolf; never map data). "View Course" opens a simple profile here;
 * "Open GPS" opens the GPS screen full screen from the saved course.
 */
export function ExploreCourseProfile({ course, onBack }: { course: CourseResult; onBack: () => void }) {
  const [details, setDetails] = useState<Load<CoursePreview>>({ status: "loading" });
  const [view, setView] = useState<"preview" | "profile">("preview");
  const [gps, setGps] = useState<Load<{ gps: GpsCourse; holeNumbers: number[] }> | null>(null);
  // "Prepare GPS": what happened on this visit (a saved id once ready, or the reason it can't be done).
  const [prepare, setPrepare] = useState<{ status: "idle" | "preparing" } | { status: "ready"; maroonCourseId: string } | { status: "unavailable" } | { status: "retry"; message: string }>({ status: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courses/${encodeURIComponent(course.ref)}`, { signal: controller.signal })
      .then((response) => response.json() as Promise<{ ok: boolean; course?: CoursePreview; code?: string }>)
      .then((body) => setDetails(body.ok && body.course ? { status: "ready", data: body.course } : { status: "error", message: busy(body.code) }))
      .catch((error: Error) => { if (error.name !== "AbortError") setDetails({ status: "error", message: "Couldn't reach course details. Check your connection." }); });
    return () => controller.abort();
  }, [course.ref]);

  const info = details.status === "ready" ? details.data : null;
  const library = info?.library;
  const savedGpsId = prepare.status === "ready" ? prepare.maroonCourseId : library?.saved && library.gpsAvailable ? library.maroonCourseId : undefined;
  const gpsAvailable = Boolean(savedGpsId);
  const unavailable = !gpsAvailable && (prepare.status === "unavailable" || (info !== null && !library?.canPrepareGps));
  const canPrepare = Boolean(info && !gpsAvailable && !unavailable);

  /** Opens GPS from the saved course in the Maroon library (never from a live provider reply). */
  async function openGps(maroonCourseId = savedGpsId) {
    if (!maroonCourseId) return;
    setGps({ status: "loading" });
    try {
      const response = await fetch(`/api/courses/library/${encodeURIComponent(maroonCourseId)}/gps`);
      const body = await response.json() as { ok: boolean; gps?: GpsCourse; holeNumbers?: number[] };
      setGps(body.ok && body.gps ? { status: "ready", data: { gps: body.gps, holeNumbers: body.holeNumbers ?? [] } } : { status: "error", message: "GPS isn't available for this course right now." });
    } catch {
      setGps({ status: "error", message: "Couldn't load GPS. Check your connection." });
    }
  }

  /** Build (or find) the course's GPS on the server, then open it from the saved course. */
  async function prepareGps() {
    setPrepare({ status: "preparing" });
    try {
      const response = await fetch(`/api/courses/${encodeURIComponent(course.ref)}/gps`, { method: "POST" });
      const body = await response.json() as { status: string; maroonCourseId?: string };
      if (body.status === "ready" && body.maroonCourseId) { setPrepare({ status: "ready", maroonCourseId: body.maroonCourseId }); void openGps(body.maroonCourseId); return; }
      if (body.status === "unavailable" || body.status === "not_found") { setPrepare({ status: "unavailable" }); return; }
      setPrepare({ status: "retry", message: body.status === "busy" ? "Course map is temporarily busy. Try again shortly."
        : body.status === "sign_in" ? "Sign in to prepare GPS for this course." : "We couldn't prepare GPS right now. Try again later." });
    } catch {
      setPrepare({ status: "retry", message: "Couldn't reach The Maroon. Check your connection and try again." });
    }
  }

  const availability = !info ? null
    : gpsAvailable ? <p className={styles.status} data-tone="good"><LocateFixed size={15} aria-hidden="true" /> GPS available</p>
    : prepare.status === "preparing" ? <p className={styles.status}><LoaderCircle size={15} className={styles.spinner} aria-hidden="true" /> Preparing course map…</p>
    : library?.mapAvailable && !unavailable ? <p className={styles.status} data-tone="good"><MapIcon size={15} aria-hidden="true" /> Course map available</p>
    : unavailable ? <p className={styles.status}><Navigation size={15} aria-hidden="true" /> GPS isn&apos;t available for this course yet</p>
    : null;

  const actions = info && <div className={styles.actions}>
    {view === "preview" && <button type="button" className={styles.primary} onClick={() => setView("profile")}>View Course <ArrowRight size={16} aria-hidden="true" /></button>}
    {gpsAvailable && <button type="button" className={view === "preview" ? styles.secondary : styles.primary} onClick={() => openGps()} disabled={gps?.status === "loading"}>
      {gps?.status === "loading" ? <LoaderCircle size={16} className={styles.spinner} aria-hidden="true" /> : <LocateFixed size={16} aria-hidden="true" />} Open GPS
    </button>}
    {canPrepare && <button type="button" className={view === "preview" ? styles.secondary : styles.primary} onClick={prepareGps} disabled={prepare.status === "preparing"}>
      {prepare.status === "preparing" ? <><LoaderCircle size={16} className={styles.spinner} aria-hidden="true" /> Preparing course map…</> : <><LocateFixed size={16} aria-hidden="true" /> Prepare GPS</>}
    </button>}
    {prepare.status === "retry" && <p className={styles.hint} role="alert">{prepare.message}</p>}
  </div>;

  return <section className={styles.panel} aria-label="Course">
    <button type="button" className={styles.back} onClick={view === "profile" ? () => setView("preview") : onBack}>
      <ArrowLeft size={16} aria-hidden="true" /> {view === "profile" ? "Back" : "Back to results"}
    </button>
    <article className={styles.course}>
      <p className={styles.kicker}>{view === "profile" ? "Course profile" : "Course"}</p>
      <h2>{info?.name ?? course.name}</h2>
      {place(info ?? course) && <p className={styles.place}><MapPin size={14} aria-hidden="true" /> {place(info ?? course)}</p>}
      <p className={styles.facts}>
        {course.par !== null && <span>Par {course.par}</span>}
        {info?.holeCount && <span>{info.holeCount} holes</span>}
      </p>
      {details.status === "loading" && <p className={styles.hint}><LoaderCircle size={15} className={styles.spinner} aria-hidden="true" /> Loading course details…</p>}
      {details.status === "error" && <p className={styles.hint} role="alert">{details.message}</p>}
      {availability}
      {info && info.teeSets.length > 0 && <div className={styles.tees}>
        <p className={styles.kicker}>Tees</p>
        {view === "preview"
          ? <p className={styles.teeNames}>{info.teeSets.map((tee) => tee.name).join(" · ")}</p>
          : <ul className={styles.teeList}>{info.teeSets.map((tee) => <li key={tee.name}><span>{tee.name}</span>{tee.totalYards && <span>{tee.totalYards.toLocaleString("en-US")} yds</span>}</li>)}</ul>}
      </div>}
      {view === "profile" && <p className={styles.soon}>More of this course — scorecard, hole-by-hole maps and reviews — is on the way.</p>}
      {actions}
      {gps?.status === "error" && <p className={styles.hint} role="alert">{gps.message}</p>}
    </article>
    {info?.attribution && <p className={styles.credit}>Course data {info.attribution}</p>}
    {gps?.status === "ready" && createPortal(
      <div className={styles.gpsLayer} role="dialog" aria-modal="true" aria-label={`GPS · ${info?.name ?? course.name}`}>
        <CourseGpsNavigator course={gps.data.gps} holeNumbers={gps.data.holeNumbers} onClose={() => setGps(null)} />
      </div>, document.body)}
  </section>;
}
