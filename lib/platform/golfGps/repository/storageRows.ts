import type {
  GolfCourse, GolfDataProvider, GolfDerivation, GolfExternalId, GolfGreen, GolfHazardGeometry, GolfHole, GolfPolygon, GolfSourceMetadata, GolfTee,
} from "../domain";

/**
 * Maroon GolfCourse ⇄ the rows of supabase/golf_course_data.sql. Pure functions: no database, no providers.
 *
 * Every stored row carries a provider and a license so open data (ODbL) and any future proprietary data stay
 * distinguishable:
 * - open_golf / openstreetmap → "ODbL-1.0"
 * - golf_intelligence (paid provider) → "proprietary"; maroon (entered by Maroon staff) → "maroon"
 * - no known source → "unknown" (kept, never quietly relabelled as Maroon's)
 * - Maroon-derived green targets → the license of their inputs (all ODbL inputs → "ODbL-1.0", since a value derived
 *   from an ODbL database is still covered by it); mixed or unknown inputs → "unknown".
 * Scorecard rows with no source of their own (tee sets, scorecard yardages) inherit the course's first source — the
 * scorecard provider that created the course.
 */

export const OPEN_DATA_LICENSE = "ODbL-1.0";

export function licenseFor(provider: GolfDataProvider | undefined): string {
  if (provider === "open_golf" || provider === "openstreetmap") return OPEN_DATA_LICENSE;
  if (provider === "golf_intelligence") return "proprietary";
  if (provider === "maroon") return "maroon";
  return "unknown";
}

/** Data the storage can't hold yet; saving refuses it rather than dropping it quietly. */
export class UnsupportedCourseDataError extends Error {}

type Json = Record<string, unknown>;

/** Leave out undefined / null values, so "absent" is stored as absent (SQL NULL), never as an empty value. */
const compact = <T extends Json>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;

const hazardSource = (geometry: GolfHazardGeometry) => geometry.kind === "point" ? geometry.source : geometry.polygon.source;
const teeSource = (tee: GolfTee) => tee.location?.kind === "point" ? tee.location.source : tee.location?.polygon.source;

function feature(kind: string, key: string, data: object, source: GolfSourceMetadata | undefined) {
  return compact({ kind, key, data, provider: source?.provider, provider_record_id: source?.providerRecordId, license: licenseFor(source?.provider) });
}

function derivedLicense(derivations: (GolfDerivation | undefined)[], fallback: string): string {
  const inputs = derivations.flatMap((d) => d?.inputs ?? []);
  if (!derivations.some(Boolean)) return fallback;
  return inputs.length > 0 && inputs.every((input) => licenseFor(input.provider) === OPEN_DATA_LICENSE) ? OPEN_DATA_LICENSE : "unknown";
}

/** The save_golf_course payload for a normalized course. */
export function toStoragePayload(course: GolfCourse) {
  const scorecardProvider = course.sources[0]?.provider;
  const holes = course.holes.map((hole) => {
    if (hole.elevation || hole.green?.elevation || hole.green?.slope || hole.green?.contours) {
      throw new UnsupportedCourseDataError(`Hole ${hole.number} has elevation / slope / contour data, which can't be stored yet.`);
    }
    const green = hole.green;
    const greenSource = green?.polygon?.source;
    // golf_green_targets only holds Maroon-derived points (each with its derivation); provider-given points would need
    // their own provider columns first.
    if ((green?.center && !green.derivation?.center) || (green?.front && !green.derivation?.frontBack)) {
      throw new UnsupportedCourseDataError(`Hole ${hole.number} has green points given by a source (not derived by The Maroon), which can't be stored yet.`);
    }
    const features = [
      ...(green?.polygon ? [feature("green", "green", green.polygon, greenSource)] : []),
      ...hole.fairways.map((f) => feature("fairway", f.id, f, f.polygon.source)),
      ...hole.bunkers.map((b) => feature("bunker", b.id, b, hazardSource(b.geometry))),
      ...hole.penaltyAreas.map((p) => feature("penalty_area", p.id, p, hazardSource(p.geometry))),
      ...(hole.boundary ? [feature("boundary", "boundary", hole.boundary, hole.boundary.source)] : []),
      ...(hole.centerline ? [feature("centerline", "centerline", hole.centerline, hole.centerline.source)] : []),
    ];
    const targets = green?.center ? compact({
      center: green.center, front: green.front, back: green.back,
      center_derivation: green.derivation?.center, front_back_derivation: green.derivation?.frontBack,
      license: derivedLicense([green.derivation?.center, green.derivation?.frontBack], licenseFor(greenSource?.provider)),
    }) : undefined;
    return compact({
      number: hole.number, par: hole.par, stroke_index: hole.strokeIndex, external_ids: hole.externalIds, sources: hole.sources,
      coverage: hole.coverage, coverage_level: hole.coverage.level, verification: hole.verification,
      tees: hole.tees.map((tee) => {
        const source = teeSource(tee);
        const provider = source?.provider ?? (tee.location ? undefined : scorecardProvider);
        return compact({
          key: tee.id, tee_set_key: tee.teeSetId, name: tee.name, color: tee.color, yardage: tee.yardage, par: tee.par,
          stroke_index: tee.strokeIndex, location: tee.location, provider, provider_record_id: source?.providerRecordId, license: licenseFor(provider),
        });
      }),
      features,
      targets,
    });
  });
  const importedAt = course.sources.map((s) => s.importedAt).filter((t): t is string => Boolean(t)).sort()[0];
  return {
    course: compact({
      name: course.name, facility_name: course.facilityName, address: course.address,
      latitude: course.location?.lat, longitude: course.location?.lng, timezone: course.timezone, hole_count: course.holeCount,
      metadata: course.metadata, coverage: course.coverage, coverage_level: course.coverage.level, verification: course.verification,
      imported_at: importedAt,
    }),
    external_ids: course.externalIds,
    sources: course.sources.map((s) => compact({
      provider: s.provider, provider_record_id: s.providerRecordId, imported_at: s.importedAt, last_updated_at: s.lastUpdatedAt,
      confidence: s.confidence, attribution: s.attribution, license: licenseFor(s.provider),
    })),
    tee_sets: course.teeSets.map((t) => compact({
      key: t.id, name: t.name, color: t.color, total_yards: t.totalYards, par: t.par, ratings: t.ratings, provider: scorecardProvider, license: licenseFor(scorecardProvider),
    })),
    holes,
  };
}

export type StoragePayload = ReturnType<typeof toStoragePayload>;

// --- Loading ---------------------------------------------------------------------------------------------------------

/** What get_golf_course returns: rows as JSON (snake_case columns). */
export interface StoredCourseRows {
  course: Json;
  external_ids: GolfExternalId[];
  sources: Json[];
  tee_sets: Json[];
  holes: (Json & { tees: Json[]; features: (Json & { kind: string; data: Json })[]; targets: Json | null })[];
}

/** Timestamps come back from Postgres as "2026-10-05 17:01:42.09+00"; turn them back into the ISO form they were saved in. */
const iso = (value: unknown) => typeof value === "string" ? new Date(value).toISOString() : undefined;
const optional = <T>(value: unknown) => (value === null || value === undefined ? undefined : value as T);

/** A stored course back as a Maroon GolfCourse (ids are now the stored Maroon UUIDs). */
export function fromStoredRows(rows: StoredCourseRows): GolfCourse {
  const c = rows.course;
  const holes: GolfHole[] = rows.holes.map((h) => {
    const of = (kind: string) => h.features.filter((f) => f.kind === kind).map((f) => f.data);
    const [greenPolygon] = of("green") as unknown as GolfPolygon[];
    const t = h.targets;
    const derivation = t && (t.center_derivation || t.front_back_derivation)
      ? compact({ center: optional<GolfDerivation>(t.center_derivation), frontBack: optional<GolfDerivation>(t.front_back_derivation) })
      : undefined;
    const green: GolfGreen | undefined = greenPolygon || t ? compact({
      polygon: greenPolygon, center: optional(t?.center), front: optional(t?.front), back: optional(t?.back), derivation,
    }) as GolfGreen : undefined;
    const [boundary] = of("boundary");
    const [centerline] = of("centerline");
    return compact({
      id: h.id as string, number: h.number as number, par: h.par as number, strokeIndex: optional<number>(h.stroke_index),
      externalIds: optional(h.external_ids), sources: optional(h.sources),
      tees: h.tees.map((tee) => compact({
        id: tee.key as string, teeSetId: optional<string>(tee.tee_set_key), name: tee.name as string, color: optional<string>(tee.color),
        location: optional(tee.location), yardage: optional<number>(tee.yardage), par: optional<number>(tee.par), strokeIndex: optional<number>(tee.stroke_index),
      })) as GolfTee[],
      green, fairways: of("fairway"), bunkers: of("bunker"), penaltyAreas: of("penalty_area"), boundary, centerline,
      coverage: h.coverage, verification: h.verification,
    }) as unknown as GolfHole;
  });
  const latitude = optional<number>(c.latitude), longitude = optional<number>(c.longitude);
  return compact({
    id: c.id as string,
    externalIds: rows.external_ids,
    name: c.name as string,
    facilityName: optional<string>(c.facility_name),
    address: c.address,
    location: latitude !== undefined && longitude !== undefined ? { lat: latitude, lng: longitude } : undefined,
    timezone: optional<string>(c.timezone),
    holeCount: c.hole_count as number,
    holes,
    teeSets: rows.tee_sets.map((t) => compact({
      id: t.key as string, name: t.name as string, color: optional<string>(t.color), totalYards: optional<number>(t.total_yards),
      par: optional<number>(t.par), ratings: optional(t.ratings),
    })),
    metadata: optional(c.metadata),
    sources: rows.sources.map((s) => compact({
      provider: s.provider as GolfDataProvider, providerRecordId: optional<string>(s.provider_record_id), importedAt: iso(s.imported_at),
      lastUpdatedAt: iso(s.last_updated_at), confidence: optional<number>(s.confidence === null ? null : Number(s.confidence)), attribution: optional<string>(s.attribution),
    })),
    coverage: c.coverage,
    verification: c.verification,
  }) as unknown as GolfCourse;
}
