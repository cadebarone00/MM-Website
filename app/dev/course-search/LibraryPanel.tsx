import type { CourseLibraryEntry } from "@/lib/platform/golfGps/repository/courseRepository";
import { refreshSources, saveToMaroon } from "./libraryActions";
import styles from "./CourseSearch.module.css";

/**
 * DEV ONLY: the selected OpenGolf course in the Maroon course library — saved or not, and what the saved copy holds,
 * read straight back from Supabase (no provider calls).
 */
export function LibraryPanel({ entry, lookupError, notice, form }: {
  entry: CourseLibraryEntry | null;
  lookupError: string | null;
  notice: string | null;
  form: { q: string; state: string; id: string };
}) {
  const hidden = <>
    <input type="hidden" name="q" value={form.q} /><input type="hidden" name="state" value={form.state} /><input type="hidden" name="id" value={form.id} />
  </>;
  return <section className={styles.panel} aria-label="Maroon course library">
    <h2>Maroon course library (Supabase)</h2>
    {notice && <p className={notice.startsWith("Refresh failed") || notice.includes("isn't set up") ? styles.error : undefined}>{notice}</p>}
    {lookupError && <p className={styles.error}>{lookupError}</p>}
    {!lookupError && !entry && <form action={saveToMaroon}>{hidden}
      <button type="submit" className={styles.action}>Save to Maroon</button>
      <span className={styles.credit}> Imports OpenGolf + OpenStreetMap + green targets once and stores the result.</span>
    </form>}
    {entry && <StoredCourse entry={entry} hidden={hidden} />}
  </section>;
}

function StoredCourse({ entry, hidden }: { entry: CourseLibraryEntry; hidden: React.ReactNode }) {
  const { course } = entry;
  const holes = course.holes;
  const count = (test: (h: (typeof holes)[number]) => boolean) => holes.filter(test).length;
  return <>
    <dl className={styles.fields}>
      <dt>Saved Maroon course ID</dt><dd><code>{course.id}</code></dd>
      <dt>Last refreshed</dt><dd>{entry.refreshedAt}{entry.stale && <strong> · stale (refresh suggested)</strong>}</dd>
      <dt>First imported</dt><dd>{entry.importedAt ?? "—"}</dd>
      <dt>Coverage</dt><dd>{course.coverage.level} · {course.coverage.holesWithGps ?? 0} of {course.holeCount} holes at GPS level · verification: {course.verification.status}</dd>
      <dt>Green targets</dt><dd>center on {count((h) => Boolean(h.green?.center))} · front / back on {count((h) => Boolean(h.green?.front && h.green?.back))} · derived by {count((h) => h.green?.derivation?.frontBack?.derivedBy === "maroon")} holes</dd>
      <dt>Hazards stored</dt><dd>{holes.reduce((n, h) => n + h.bunkers.length, 0)} bunkers · {holes.reduce((n, h) => n + h.penaltyAreas.length, 0)} penalty areas</dd>
      <dt>External ids</dt><dd>{course.externalIds.map((e) => `${e.provider}: ${e.id}`).join(" · ")}</dd>
      <dt>Sources</dt><dd>{course.sources.map((s) => `${s.provider}${s.providerRecordId ? ` (${s.providerRecordId})` : ""}${s.attribution ? ` — ${s.attribution}` : ""}`).join(" · ")}</dd>
    </dl>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
      <a className={styles.action} href={`/dev/gps?maroonCourse=${course.id}`}>Open saved course in GPS</a>
      <form action={refreshSources} style={{ display: "inline" }}>{hidden}<input type="hidden" name="maroonCourse" value={course.id} />
        <button type="submit" className={styles.action}>Refresh Sources</button>
      </form>
      <span className={styles.credit}>Refresh re-imports OpenGolf + OpenStreetMap and re-derives targets. Only all-imported courses can be refreshed; if a source fails, the stored copy stays as it is.</span>
    </div>
  </>;
}
