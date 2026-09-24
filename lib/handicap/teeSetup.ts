import type { ArchivedTeeSetup } from "./types";

export function mapHandicapSetup(value: unknown): ArchivedTeeSetup | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<ArchivedTeeSetup>;
  if (typeof v.courseId !== "string" || typeof v.teeSetId !== "string" || typeof v.teeSetName !== "string") return null;
  if (!Array.isArray(v.holes)) return null;
  if (v.rating !== null && typeof v.rating !== "number") return null;
  if (v.slope !== null && typeof v.slope !== "number") return null;
  return {
    courseId: v.courseId,
    teeSetId: v.teeSetId,
    teeSetName: v.teeSetName,
    rating: v.rating ?? null,
    slope: v.slope ?? null,
    holes: v.holes,
    ...(v.holeTeeSetIds ? { holeTeeSetIds: v.holeTeeSetIds } : {}),
  };
}

