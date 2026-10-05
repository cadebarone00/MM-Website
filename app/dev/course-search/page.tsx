import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { GolfCourse, GolfHole } from "@/lib/platform/golfGps/domain";
import { GolfProviderError, type GolfCourseImport, type GolfCourseSearchResponse } from "@/lib/platform/golfGps/providers/GolfCourseProvider";
import { createOpenGolfProvider } from "@/lib/platform/golfGps/providers/openGolf/provider";
import { enrichGolfCourse, type PlayableCourse } from "@/lib/platform/golfGps/courseEnrichment";
import { getCourseLibrary } from "@/lib/platform/golfGps/repository/courseLibrary";
import type { CourseLibraryEntry } from "@/lib/platform/golfGps/repository/courseRepository";
import { LibraryPanel } from "./LibraryPanel";
import { OsmGeometryPanel } from "./OsmGeometryPanel";
import styles from "./CourseSearch.module.css";

export const metadata: Metadata = { title: "Course search (dev) | The Maroon", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * LOCAL DEV TEST HARNESS for the OpenGolf course provider — not production UI. Searches and course details run on the
 * server through the provider, so this page only ever sees normalized Maroon types. 404 unless NODE_ENV=development.
 */
export default async function CourseSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; state?: string; id?: string; osm?: string; library?: string; libraryError?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { q = "", state = "", id = "", osm = "", library = "", libraryError = "" } = await searchParams;
  const provider = createOpenGolfProvider();

  let search: GolfCourseSearchResponse | null = null, searchError: string | null = null;
  if (q.trim()) {
    try { search = await provider.searchCourses({ text: q, state: state.trim() || undefined }); } catch (error) { searchError = message(error); }
  }
  let detail: GolfCourseImport | null = null, detailError: string | null = null;
  if (id) {
    try {
      detail = await provider.getCourseDetail(id);
      if (!detail) detailError = "OpenGolf has no course with that id.";
    } catch (error) { detailError = message(error); }
  }
  // Is this OpenGolf course already in the Maroon course library? (Reads Supabase only — no provider calls.)
  let saved: CourseLibraryEntry | null = null, lookupError: string | null = null;
  if (detail) {
    try { saved = await getCourseLibrary().findCourseByExternalId("open_golf", id); } catch (error) {
      lookupError = error instanceof Error ? error.message : "Couldn't read the course library.";
    }
  }
  const libraryNotice = libraryError || ({ saved: "Saved to the Maroon course library.", "already-saved": "Already in the library — loaded the stored copy (no provider calls).", refreshed: "Refreshed from OpenGolf + OpenStreetMap and saved." } as Record<string, string>)[library] || null;
  // Only when "Load OSM Geometry" is clicked: Overpass is a shared public service, so it's never queried automatically.
  let playable: PlayableCourse | null = null, osmError: string | null = null;
  if (detail && osm === "1") {
    try { playable = await enrichGolfCourse(detail.course); } catch (error) {
      osmError = error instanceof GolfProviderError ? error.message : "Loading OpenStreetMap geometry failed.";
    }
  }
  const link = (externalId: string, extra: Record<string, string> = {}) => `?${new URLSearchParams({ q, ...(state && { state }), id: externalId, ...extra })}`;

  return <main className={styles.page}>
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>Course search · OpenGolf provider (dev only)</h1>
        <p>Shows what OpenGolf gives The Maroon after normalizing. <span className={styles.tag}>OpenGolf</span> = came from OpenGolf; <span className={styles.na}>unavailable</span> = The Maroon has no data for it.</p>
      </header>

      <section className={styles.panel}>
        <form className={styles.form} method="get">
          <input name="q" defaultValue={q} placeholder="Course name, e.g. Pinehurst" aria-label="Course name" />
          <input name="state" defaultValue={state} placeholder="State" aria-label="State (optional, two letters)" maxLength={2} />
          <button type="submit">Search</button>
        </form>
      </section>

      {(search || searchError) && <section className={styles.panel} aria-label="Search results">
        <h2>Results{search?.total !== undefined && ` · ${search.results.length} of ${search.total}`}</h2>
        {searchError && <p className={styles.error}>{searchError}</p>}
        {search && !search.results.length && <p>No courses found.</p>}
        {search && <ul className={styles.results}>
          {search.results.map((result) => <li key={result.externalId.id}>
            <a href={link(result.externalId.id)} aria-current={result.externalId.id === id}>
              <strong>{result.name}</strong>
              <small>{[result.city, result.state].filter(Boolean).join(", ") || "City / state unavailable"}{result.par && ` · par ${result.par}`}</small>
              <small>{result.externalId.provider} id: {result.externalId.id}</small>
            </a>
          </li>)}
        </ul>}
        {search && <p className={styles.credit}>{search.attribution}</p>}
      </section>}

      {detailError && <section className={styles.panel}><p className={styles.error}>{detailError}</p></section>}
      {detail && <LibraryPanel entry={saved} lookupError={lookupError} notice={libraryNotice} form={{ q, state, id }} />}
      {detail && <CourseDetail course={detail.course} notes={detail.notes} />}
      {detail && <section className={styles.panel} aria-label="OpenStreetMap">
        <h2>OpenStreetMap geometry (dev)</h2>
        <a className={styles.action} href={link(id, { osm: "1" })}>Load OSM Geometry</a>
        <p className={styles.credit}>Queries the public Overpass API around this course&apos;s location (two small, cached requests).</p>
        {osmError && <p className={styles.error}>{osmError}</p>}
      </section>}
      {playable && <OsmGeometryPanel enrichment={playable.geometry} targets={playable.targets} gpsHref={`/dev/gps?course=${encodeURIComponent(id)}&hole=1`} />}
    </div>
  </main>;
}

function message(error: unknown): string {
  if (!(error instanceof GolfProviderError)) return "Something went wrong.";
  return { bad_request: error.message, timeout: "OpenGolf took too long to answer.", network: "Couldn't reach OpenGolf.",
    rate_limited: "OpenGolf's daily request limit was reached — try again tomorrow.", http: error.message, malformed: "OpenGolf sent a reply we couldn't read." }[error.kind];
}

/** A value from OpenGolf, or "unavailable" when the normalized course has nothing for it. */
function Value({ value }: { value: ReactNode }) {
  return value === undefined || value === null || value === "" ? <span className={styles.na}>unavailable</span> : <>{value}<span className={styles.tag}>OpenGolf</span></>;
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return <dl className={styles.fields}>{rows.map(([label, value]) => <div key={label} style={{ display: "contents" }}><dt>{label}</dt><dd><Value value={value} /></dd></div>)}</dl>;
}

const unavailable = <span className={styles.na}>unavailable</span>;
const present = (yes: boolean, text = "available") => yes ? <>{text}</> : unavailable;

function holeGps(hole: GolfHole) {
  return {
    tee: present(hole.tees.some((tee) => tee.location)),
    green: present(Boolean(hole.green?.center || hole.green?.polygon)),
    fairways: present(hole.fairways.length > 0, `${hole.fairways.length}`),
    hazards: present(hole.bunkers.length + hole.penaltyAreas.length > 0, `${hole.bunkers.length + hole.penaltyAreas.length}`),
    elevation: present(Boolean(hole.elevation)),
  };
}

function CourseDetail({ course, notes }: { course: GolfCourse; notes: string[] }) {
  const source = course.sources[0];
  return <>
    <section className={styles.panel} aria-label="Normalized course">
      <h2>Course · Maroon GolfCourse</h2>
      <Fields rows={[
        ["Maroon id (provisional)", course.id],
        ["External ids", course.externalIds.map((e) => `${e.provider}: ${e.id}`).join(", ")],
        ["Name", course.name],
        ["Facility / club", course.facilityName],
        ["Street", course.address.street],
        ["City", course.address.city],
        ["State", course.address.state],
        ["Postal code", course.address.postalCode],
        ["Country", course.address.country],
        ["Location", course.location && `${course.location.lat}, ${course.location.lng}`],
        ["Time zone", course.timezone],
        ["Hole count", course.holeCount || undefined],
        ["Holes with scorecard", course.holes.length || undefined],
        ["Architect", course.metadata?.architect],
        ["Year opened", course.metadata?.yearOpened],
        ["Access", course.metadata?.access],
        ["Website", course.metadata?.website],
        ["Phone", course.metadata?.phone],
      ]} />
    </section>

    <section className={styles.panel} aria-label="Coverage and source">
      <h2>Coverage · source</h2>
      <dl className={styles.fields}>
        <dt>Coverage level</dt><dd><strong>{course.coverage.level}</strong></dd>
        <dt>Holes with GPS</dt><dd>{course.coverage.holesWithGps ?? 0} of {course.holeCount}</dd>
        {Object.entries(course.coverage.features).map(([feature, on]) => <div key={feature} style={{ display: "contents" }}><dt>{feature}</dt><dd>{present(on, "yes")}</dd></div>)}
        <dt>Verification</dt><dd>{course.verification.status}</dd>
        <dt>Source</dt><dd>{source ? `${source.provider} · record ${source.providerRecordId} · imported ${source.importedAt}` : unavailable}</dd>
      </dl>
    </section>

    {notes.length > 0 && <section className={styles.panel} aria-label="Data notes">
      <h2>Data notes</h2>
      <ul className={styles.notes}>{notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section>}

    <section className={styles.panel} aria-label="Tee sets">
      <h2>Tee sets ({course.teeSets.length})</h2>
      {course.teeSets.length ? <table className={styles.table}>
        <thead><tr><th>Tee</th><th>Color</th><th>Yards</th><th>Par</th><th>Rating / slope</th></tr></thead>
        <tbody>{course.teeSets.map((set) => <tr key={set.id}>
          <td>{set.name}</td><td><Value value={set.color} /></td><td><Value value={set.totalYards} /></td><td><Value value={set.par} /></td>
          <td><Value value={set.ratings?.map((r) => `${r.gender} ${r.courseRating} / ${r.slopeRating}`).join(" · ")} /></td>
        </tr>)}</tbody>
      </table> : unavailable}
    </section>

    <section className={styles.panel} aria-label="Holes">
      <h2>Holes ({course.holes.length})</h2>
      {course.holes.length ? <table className={styles.table}>
        <thead><tr><th>Hole</th><th>Par</th><th>Stroke index</th><th>Tee yardages</th><th>Tee GPS</th><th>Green geometry</th><th>Fairways</th><th>Hazards</th><th>Elevation</th></tr></thead>
        <tbody>{course.holes.map((hole) => {
          const gps = holeGps(hole);
          return <tr key={hole.id}>
            <td>{hole.number}</td><td><Value value={hole.par} /></td><td><Value value={hole.strokeIndex} /></td>
            <td><Value value={hole.tees.map((tee) => `${tee.name} ${tee.yardage ?? "?"}`).join(" · ")} /></td>
            <td>{gps.tee}</td><td>{gps.green}</td><td>{gps.fairways}</td><td>{gps.hazards}</td><td>{gps.elevation}</td>
          </tr>;
        })}</tbody>
      </table> : unavailable}
    </section>

    <section className={styles.panel}>
      <details><summary>Normalized GolfCourse JSON</summary><pre className={styles.json}>{JSON.stringify(course, null, 2)}</pre></details>
      {source?.attribution && <p className={styles.credit}>{source.attribution}</p>}
    </section>
  </>;
}
