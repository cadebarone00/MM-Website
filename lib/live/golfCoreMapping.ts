import type { LiveTeeSet } from "./types";
import type { GolfSearchResult } from "./golfApiMapping";
import { validTeeSets } from "./teeSets";

type Row = Record<string, unknown>;
const object = (v: unknown): Row => v && typeof v === "object" && !Array.isArray(v) ? v as Row : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;
export const golfCoreUrl = (slug: string) => `https://www.golfcore.org/courses/${encodeURIComponent(slug)}/`;

export function mapGolfCoreSearch(payload: unknown): { courses: GolfSearchResult[]; total: number } {
  const data = object(payload);
  if (!Array.isArray(data.courses)) throw new Error("GolfCore returned an unexpected search response.");
  return { total: num(data.total), courses: data.courses.map(object).filter((c) => str(c.slug) && str(c.name)).map((c) => ({ id: str(c.slug), name: str(c.name), location: [c.city, c.region, c.country].filter(Boolean).join(", "), holes: num(c.hole_count) })) };
}

export function mapGolfCoreCourse(payload: unknown, slug: string, syncedAt: string): { name: string; teeSets: LiveTeeSet[] } {
  const course = object(payload);
  if (course.slug !== slug || !str(course.name)) throw new Error("GolfCore returned an unexpected course.");
  if (num(course.hole_count) !== 18) throw new Error("The current scorecard editor supports 18-hole courses.");
  const layouts = Array.isArray(course.layouts) ? course.layouts.map(object) : [];
  const teeSets: LiveTeeSet[] = layouts.flatMap((layout) => (Array.isArray(layout.tees) ? layout.tees : []).map(object).map((tee) => {
    const gender = tee.gender === "M" ? "Men" : tee.gender === "F" || tee.gender === "W" ? "Women" : str(tee.gender);
    const teeId = JSON.stringify([str(layout.name), str(tee.name), str(tee.gender)]);
    const holes = Array.isArray(tee.holes) ? tee.holes.map(object) : [];
    const baseline = {
      name: `${layouts.length > 1 ? `${str(layout.name)} — ` : ""}${str(tee.name) || "Unnamed tees"}${gender ? ` (${gender})` : ""}`,
      rating: num(tee.rating) > 0 ? num(tee.rating) : null,
      slope: Number.isInteger(tee.slope) && num(tee.slope) >= 55 && num(tee.slope) <= 155 ? num(tee.slope) : null,
      holes: Array.from({ length: 18 }, (_, i) => {
        const hole = holes.find((h) => h.position === i + 1) ?? {};
        const par = num(hole.par), yards = num(hole.yards);
        return { number: i + 1, par: Number.isInteger(par) && par >= 3 && par <= 6 ? par : 0, yards: yards > 0 ? Math.round(yards) : 0 };
      }),
    };
    return { ...baseline, id: `golfcore:${slug}:${teeId}`, locked: false, apiSource: { provider: "golfcore" as const, courseId: slug, teeId, syncedAt, baseline } };
  }));
  if (!teeSets.length) throw new Error("GolfCore has no tee sets for this course yet.");
  if (!validTeeSets(teeSets)) throw new Error("GolfCore returned invalid or duplicate tee sets.");
  return { name: str(course.name), teeSets };
}
