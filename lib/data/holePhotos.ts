/** "Pete Dye #1" -> "pete-dye-1", "Danzante Bay" -> "danzante-bay" */
export function slugifyCourse(course: string): string {
  return course
    .toLowerCase()
    .replace(/#/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Where a hole photo would live if one has been added for this course/hole. */
export function holePhotoSrc(course: string, hole: number): string {
  return `/hole-photos/${slugifyCourse(course)}/${hole}.jpg`;
}
