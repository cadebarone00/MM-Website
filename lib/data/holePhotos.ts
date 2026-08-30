/** "Pete Dye #1" -> "pete-dye-1", "Danzante Bay" -> "danzante-bay" */
export function slugifyCourse(course: string): string {
  return course
    .toLowerCase()
    .replace(/#/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Try the common image naming patterns used by the repo and the imported course/hole JPEGs. */
export function holePhotoCandidates(course: string, hole: number): string[] {
  const base = slugifyCourse(course).replace(/-(?:course|cc|country-club)$/, "");
  const holeStr = String(hole);

  return Array.from(
    new Set([
      `/hole-photos/${base}${holeStr}.jpg`,
      `/hole-photos/${base}${holeStr}.jpeg`,
      `/hole-photos/${base}-${holeStr}.jpg`,
      `/hole-photos/${base}-${holeStr}.jpeg`,
      `/hole-photos/${base}/${holeStr}.jpg`,
      `/hole-photos/${base}/${holeStr}.jpeg`,
      `/hole-photos/${base}/hole-${holeStr}.jpg`,
      `/hole-photos/${base}/hole-${holeStr}.jpeg`,
      `/hole-photos/${base}/hole${holeStr}.jpg`,
      `/hole-photos/${base}/hole${holeStr}.jpeg`,
      `/hole-photos/${base}-${holeStr}.png`,
      `/hole-photos/${base}${holeStr}.png`,
    ])
  );
}

/** Preferred path for a hole photo; callers can try each candidate until one loads. */
export function holePhotoSrc(course: string, hole: number): string {
  return holePhotoCandidates(course, hole)[0];
}
