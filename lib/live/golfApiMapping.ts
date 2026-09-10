import type { LiveTeeSet } from "./types";
import { validTeeSets } from "./teeSets";

type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const str = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => value !== "" && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
export type GolfSearchResult = { id: string; name: string; location: string; holes: number };
export function normalizedCourseName(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}
export function courseName(row: Row): string {
  const club = str(row.clubName), course = str(row.courseName);
  return !course || course === "18-hole course" || course === club ? club : club ? `${club} — ${course}` : course;
}
export function mapGolfSearch(payload: unknown): { courses: GolfSearchResult[]; total: number } {
  const data = object(payload);
  if (!Array.isArray(data.courses)) throw new Error("The course provider returned an unexpected search response.");
  return { total: number(data.numAllCourses) ?? data.courses.length, courses: data.courses.map(object).filter((row) => str(row.courseID)).map((row) => ({ id: str(row.courseID), name: courseName(row), location: [row.city, row.state, row.country].filter(Boolean).join(", "), holes: number(row.numHoles) ?? 0 })) };
}

export function mapGolfCourse(payload: unknown, expectedId: string, syncedAt: string): { name: string; teeSets: LiveTeeSet[] } {
  const data = object(payload);
  if (str(data.courseID) !== expectedId || !courseName(data)) throw new Error("The course provider returned an unexpected course.");
  if (number(data.numHoles) !== 18) throw new Error("The current scorecard editor supports 18-hole courses. Choose an 18-hole layout.");
  if (data.measure !== "y" && data.measure !== "m") throw new Error("The course provider did not specify yardage units.");
  if (!Array.isArray(data.tees) || !data.tees.length) throw new Error("No tee sets are available for this course yet.");
  const teeSets = data.tees.map(object).flatMap((tee): LiveTeeSet[] => {
    if (!str(tee.teeID)) throw new Error("A provider tee set is missing its ID.");
    const variants = ["Men", ...(number(tee.courseRatingWomen) || number(tee.slopeWomen) ? ["Women"] : [])];
    return variants.map((gender) => {
      const teeId = `${str(tee.teeID)}:${gender}`;
      const pars = gender === "Women" ? tee.parsWomen ?? data.parsWomen : tee.pars ?? data.parsMen;
      const rating = number(tee[`courseRating${gender}`]);
      const slope = number(tee[`slope${gender}`]);
      const baseline = {
        name: `${str(tee.teeName) || "Unnamed tees"} (${gender})`,
        color: /^#[0-9a-f]{6}$/i.test(str(tee.teeColor)) ? str(tee.teeColor) : undefined,
        rating: rating && rating > 0 ? rating : null,
        slope: slope && Number.isInteger(slope) && slope >= 55 && slope <= 155 ? slope : null,
        holes: Array.from({ length: 18 }, (_, index) => {
          const par = Array.isArray(pars) ? number(pars[index]) : null;
          const length = number(tee[`length${index + 1}`]);
          return { number: index + 1, par: par && Number.isInteger(par) && par >= 3 && par <= 6 ? par : 0, yards: length && length > 0 ? Math.round(length * (data.measure === "m" ? 1 / 0.9144 : 1)) : 0 };
        }),
      };
      return { ...baseline, id: `golfapi:${expectedId}:${teeId}`, locked: false, apiSource: { courseId: expectedId, teeId, syncedAt, baseline } };
    });
  });
  if (!validTeeSets(teeSets)) throw new Error("The provider returned invalid or duplicate tee sets.");
  return { name: courseName(data), teeSets };
}

/** Update only values that still match the previous provider snapshot. */
export function refreshGolfTees(existing: LiveTeeSet[], incoming: LiveTeeSet[]): LiveTeeSet[] {
  const result = [...existing];
  for (const fresh of incoming) {
    let index = result.findIndex((tee) => tee.apiSource?.provider === fresh.apiSource?.provider && tee.apiSource?.courseId === fresh.apiSource?.courseId && tee.apiSource?.teeId === fresh.apiSource?.teeId);
    if (index < 0) {
      const names = [fresh.name.toLowerCase().trim(), fresh.name.replace(/ \(Men\)$/, "").toLowerCase().trim()];
      const matches = result.map((tee, i) => (!tee.apiSource || fresh.apiSource?.provider === "golfcore" && tee.apiSource.provider !== "golfcore") && names.includes(tee.name.toLowerCase().trim()) ? i : -1).filter((i) => i >= 0);
      if (matches.length > 1) throw new Error(`Multiple existing tees match ${fresh.name}. Give them distinct names before linking.`);
      if (matches.length === 1) {
        index = matches[0];
        const old = result[index];
        result[index] = { ...old, apiSource: fresh.apiSource, locked: false, color: old.color ?? fresh.color, rating: old.rating ?? fresh.rating, slope: old.slope ?? fresh.slope,
          holes: fresh.holes.map((hole) => { const existing = old.holes.find((h) => h.number === hole.number); return { ...hole, par: existing?.par || hole.par, yards: existing?.yards || hole.yards }; }),
        };
        continue;
      }
    }
    if (index < 0) { result.push(fresh); continue; }
    const old = result[index], base = old.apiSource!.baseline;
    const next = { ...old, apiSource: fresh.apiSource,
      name: old.name === base.name ? fresh.name : old.name,
      color: old.color === base.color ? fresh.color : old.color,
      rating: old.rating === base.rating ? fresh.rating : old.rating,
      slope: old.slope === base.slope ? fresh.slope : old.slope,
      holes: old.holes.map((hole) => {
        const previous = base.holes.find((h) => h.number === hole.number), updated = fresh.holes.find((h) => h.number === hole.number);
        return !previous || !updated ? hole : { ...hole, par: hole.par === previous.par ? updated.par : hole.par, yards: hole.yards === previous.yards ? updated.yards : hole.yards };
      }),
    };
    const changed = next.name !== old.name || next.color !== old.color || next.rating !== old.rating || next.slope !== old.slope || JSON.stringify(next.holes) !== JSON.stringify(old.holes);
    result[index] = { ...next, locked: changed ? false : old.locked };
  }
  return result;
}
