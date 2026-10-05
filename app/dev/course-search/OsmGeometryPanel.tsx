import { moveAlong } from "@/lib/platform/golfGps/distance";
import type { GolfCoordinate, GolfHazardGeometry, GolfPolygon } from "@/lib/platform/golfGps/domain";
import type { GolfGeometryEnrichment } from "@/lib/platform/golfGps/providers/GolfGeometryProvider";
import { OSM_COPYRIGHT_URL } from "@/lib/platform/golfGps/providers/openStreetMap/client";
import type { HoleTargetReport } from "@/lib/platform/golfGps/targets/deriveGreenTargets";
import { OsmPreviewMap, type PreviewKind, type PreviewShape } from "./OsmPreviewMap";
import styles from "./CourseSearch.module.css";

/**
 * DEV ONLY: what OpenStreetMap added to the selected course — match evidence, counts, per-hole coverage and derived
 * green targets, leftovers, and a map with the derived front / center / back points and approach direction drawn in.
 */
export function OsmGeometryPanel({ enrichment, targets, gpsHref }: { enrichment: GolfGeometryEnrichment; targets: HoleTargetReport[]; gpsHref: string }) {
  const { status, match, candidates, counts, course, unassigned, notes, attribution } = enrichment;
  const yes = (on: boolean) => on ? "yes" : <span className={styles.na}>no</span>;
  return <>
    <section className={styles.panel} aria-label="OSM enrichment">
      <h2>OpenStreetMap geometry · {status.replace("_", " ")}</h2>
      {match && <p>Matched <strong>{match.candidate.name}</strong> ({match.candidate.externalId.id}) · match confidence {match.confidence}</p>}
      {candidates.length > 0 && <table className={styles.table}>
        <thead><tr><th>OSM course nearby</th><th>Id</th><th>Distance</th><th>Location inside</th><th>Name similarity</th></tr></thead>
        <tbody>{candidates.map((c) => <tr key={c.externalId.id}><td>{c.name ?? <span className={styles.na}>unnamed</span>}</td><td>{c.externalId.id}</td><td>{c.distanceMeters} m</td><td>{yes(c.containsLocation)}</td><td>{c.nameSimilarity}</td></tr>)}</tbody>
      </table>}
      {status === "matched" && <dl className={styles.fields}>
        <dt>Course boundary</dt><dd>{yes(counts.courseBoundary)}</dd>
        <dt>Hole centerlines</dt><dd>{counts.holeCenterlines} / {course.holeCount}</dd>
        <dt>Greens</dt><dd>{counts.greens}</dd>
        <dt>Tees</dt><dd>{counts.tees}</dd>
        <dt>Fairways</dt><dd>{counts.fairways}</dd>
        <dt>Bunkers</dt><dd>{counts.bunkers}</dd>
        <dt>Penalty areas</dt><dd>{counts.penaltyAreas}</dd>
        <dt>Unassigned features</dt><dd>{counts.unassigned}</dd>
        <dt>Green targets</dt><dd>center on {targets.filter((t) => t.center).length} holes · front / back on {targets.filter((t) => t.frontBack).length} holes</dd>
        <dt>Course coverage</dt><dd><strong>{course.coverage.level}</strong> · {course.coverage.holesWithGps ?? 0} of {course.holeCount} holes at GPS level · verification: {course.verification.status}</dd>
      </dl>}
      {notes.length > 0 && <ul className={styles.notes}>{notes.map((note) => <li key={note}>{note}</li>)}</ul>}
      {status === "matched" && <p><a className={styles.action} href={gpsHref}>Open in GPS</a> <span className={styles.credit}>Opens this course in the GPS prototype (in the /dev simulator, the GPS test panel moves the mock player).</span></p>}
      <p className={styles.credit}>Map data {attribution} · <a href={OSM_COPYRIGHT_URL}>openstreetmap.org/copyright</a></p>
    </section>

    {status === "matched" && <>
      <section className={styles.panel} aria-label="OSM per-hole coverage">
        <h2>Per-hole geometry (from OpenStreetMap)</h2>
        <table className={styles.table}>
          <thead><tr><th>Hole</th><th>Coverage</th><th>Green polygon</th><th>Tees</th><th>Fairways</th><th>Bunkers</th><th>Penalty areas</th><th>Centerline</th><th>Green center</th><th>Front / back</th><th>Direction from</th><th>Why not</th></tr></thead>
          <tbody>{course.holes.map((hole) => <tr key={hole.id}>
            <td>{hole.number}</td><td>{hole.coverage.level}</td><td>{yes(Boolean(hole.green?.polygon))}</td>
            <td>{hole.tees.filter((tee) => tee.location).length || <span className={styles.na}>0</span>}</td>
            <td>{hole.fairways.length || <span className={styles.na}>0</span>}</td>
            <td>{hole.bunkers.length || <span className={styles.na}>0</span>}</td>
            <td>{hole.penaltyAreas.length || <span className={styles.na}>0</span>}</td>
            <td>{yes(Boolean(hole.centerline))}</td>
            <td>{yes(Boolean(hole.green?.center))}{hole.green?.derivation?.center && <small> ({hole.green.derivation.center.method.replace(/_/g, " ")})</small>}</td>
            <td>{yes(Boolean(hole.green?.front && hole.green?.back))}</td>
            <td>{hole.green?.derivation?.frontBack ? `${hole.green.derivation.frontBack.directionSource?.replace(/_/g, " ")} · ${hole.green.derivation.frontBack.approachBearingDegrees}°` : <span className={styles.na}>—</span>}</td>
            <td>{targets.find((t) => t.number === hole.number)?.reason ?? ""}</td>
          </tr>)}</tbody>
        </table>
      </section>

      <section className={styles.panel} aria-label="OSM map preview">
        <h2>Map preview (alignment check only)</h2>
        <OsmPreviewMap shapes={previewShapes(enrichment)} attribution={attribution} />
      </section>

      {unassigned.length > 0 && <section className={styles.panel} aria-label="Unassigned OSM features">
        <h2>Unassigned features ({unassigned.length}) — mapped, but not tied to a hole</h2>
        <table className={styles.table}>
          <thead><tr><th>Kind</th><th>OSM id</th><th>Why</th></tr></thead>
          <tbody>{unassigned.map((feature) => <tr key={feature.id}><td>{feature.kind}</td><td>{feature.source.providerRecordId}</td><td>{feature.reason}</td></tr>)}</tbody>
        </table>
      </section>}
    </>}
  </>;
}

/** Maroon geometry → plain shapes for the preview map. */
function previewShapes({ course, courseBoundary, unassigned }: GolfGeometryEnrichment): PreviewShape[] {
  const shapes: PreviewShape[] = [];
  const polygon = (kind: PreviewKind, label: string, p: GolfPolygon) => shapes.push({ kind, label, path: p.coordinates.map(flat), closed: true });
  const hazard = (kind: PreviewKind, label: string, g: GolfHazardGeometry) =>
    g.kind === "point" ? shapes.push({ kind, label, point: flat(g.point) }) : polygon(kind, label, g.polygon);
  courseBoundary.forEach((p) => polygon("boundary", "Course boundary", p));
  for (const hole of course.holes) {
    const at = `Hole ${hole.number}`;
    hole.fairways.forEach((f) => polygon("fairway", `${at} fairway`, f.polygon));
    if (hole.green?.polygon) polygon("green", `${at} green`, hole.green.polygon);
    hole.bunkers.forEach((b) => hazard("bunker", `${at} bunker`, b.geometry));
    hole.penaltyAreas.forEach((a) => hazard(a.kind === "water" ? "water" : "penalty", `${at} ${a.kind}`, a.geometry));
    for (const tee of hole.tees) {
      if (tee.location?.kind === "point") shapes.push({ kind: "tee", label: `${at} tee`, point: flat(tee.location.coordinate) });
      else if (tee.location) polygon("tee", `${at} tee`, tee.location.polygon);
    }
    if (hole.centerline) shapes.push({ kind: "centerline", label: `${at} centerline`, path: hole.centerline.coordinates.map(flat) });
    // Debug: derived targets, and the direction of play onto the green (35 yd shaft ending at the center).
    const green = hole.green;
    const bearing = green?.derivation?.frontBack?.approachBearingDegrees;
    if (green?.center && bearing !== undefined) shapes.push({ kind: "approach", label: `${at} approach`, path: [moveAlong(green.center, bearing + 180, 35), flat(green.center)] });
    if (green?.front) shapes.push({ kind: "front", label: `${at} front`, point: flat(green.front) });
    if (green?.back) shapes.push({ kind: "back", label: `${at} back`, point: flat(green.back) });
    if (green?.center) shapes.push({ kind: "center", label: `${at} center`, point: flat(green.center) });
  }
  for (const feature of unassigned) {
    const g = feature.geometry;
    if (g.kind === "point") shapes.push({ kind: "unassigned", label: feature.reason, point: flat(g.point) });
    else if (g.kind === "line") shapes.push({ kind: "unassigned", label: feature.reason, path: g.line.coordinates.map(flat) });
    else polygon("unassigned", feature.reason, g.polygon);
  }
  return shapes;
}

const flat = (p: GolfCoordinate) => ({ lat: p.lat, lng: p.lng });
