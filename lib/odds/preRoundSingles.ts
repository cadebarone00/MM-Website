import { canonicalCourseName } from "@/lib/data/canonicalCourse";
import type { CareerCourseHole, CareerHoleRecord } from "@/lib/data/careerStats";

type Category = "eagles" | "birdies" | "pars" | "bogeys" | "doubles";
type Profile = Record<Category, { mean: number; sd: number }>;
type Score = { score: number; par: number };
type Pair = { a: number; b: number };

export type PreRoundSinglesResult = {
  a: number; tie: number; b: number;
  measureOneMinimum: [number, number];
  measureTwoMinimum: [number, number];
  formatDeltas: [number, number];
};

const HOLE_SIMULATIONS = 10_000;
const MATCH_SIMULATIONS = 10_000;
const ROUND_SHAPE_STRENGTH = 0.015;
const FORMAT_STRENGTH = 0.08;
const categories: Category[] = ["eagles", "birdies", "pars", "bogeys", "doubles"];
const pick = <T,>(rows: T[]) => rows[Math.floor(Math.random() * rows.length)];
const bucket = (yards: number) => Math.floor((yards - 101) / 10);

function counts(rows: Score[]): Record<Category, number> {
  return rows.reduce<Record<Category, number>>((result, row) => {
    const relative = row.score - row.par;
    if (relative <= -2) result.eagles += 1;
    else if (relative === -1) result.birdies += 1;
    else if (relative === 0) result.pars += 1;
    else if (relative === 1) result.bogeys += 1;
    else result.doubles += 1;
    return result;
  }, { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 });
}

function profile(rows: CareerHoleRecord[]): Profile {
  const rounds = new Map<string, CareerHoleRecord[]>();
  rows.forEach((row) => { const id = `${row.year}:${row.round}:${row.course}:${row.format}`; rounds.set(id, [...(rounds.get(id) ?? []), row]); });
  const complete = [...rounds.values()].filter((round) => round.length === 18).map(counts);
  return Object.fromEntries(categories.map((category) => {
    const values = complete.map((round) => round[category]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    return [category, { mean, sd: Math.max(0.75, Math.sqrt(variance)) }];
  })) as Profile;
}

function shapeDistance(round: Score[], shape: Profile) {
  const actual = counts(round);
  return categories.reduce((sum, category) => sum + ((actual[category] - shape[category].mean) / shape[category].sd) ** 2, 0);
}

export function calculatePreRoundSinglesOdds({ records, courseHoles, playerA, playerB, course }: { records: CareerHoleRecord[]; courseHoles: CareerCourseHole[]; playerA: string; playerB: string; course: string }): PreRoundSinglesResult | null {
  const canonicalCourse = canonicalCourseName(course);
  const setup = [...new Map(courseHoles.filter((row) => canonicalCourseName(row.course) === canonicalCourse).map((row) => [row.hole, row])).values()].sort((a, b) => a.hole - b.hole);
  const individual = records.filter((row) => row.roundHoles === 18 && (row.format === "Singles" || row.format === "Fourball"));
  const aRows = individual.filter((row) => row.player === playerA);
  const bRows = individual.filter((row) => row.player === playerB);
  if (setup.length !== 18 || !aRows.length || !bRows.length) return null;

  const pairs = setup.map((hole) => {
    const aOne = aRows.filter((row) => row.par === hole.par);
    const bOne = bRows.filter((row) => row.par === hole.par);
    const targetBucket = bucket(hole.yards);
    const aTwo = aRows.filter((row) => Math.abs(bucket(row.yards) - targetBucket) <= 1);
    const bTwo = bRows.filter((row) => Math.abs(bucket(row.yards) - targetBucket) <= 1);
    if (!aOne.length || !bOne.length || !aTwo.length || !bTwo.length) return null;
    const outcomes: Pair[] = [];
    for (let i = 0; i < HOLE_SIMULATIONS; i += 1) outcomes.push({ a: pick(aOne).score, b: pick(bOne).score });
    for (let i = 0; i < HOLE_SIMULATIONS; i += 1) outcomes.push({ a: pick(aTwo).score, b: pick(bTwo).score });
    return { hole, outcomes, one: [aOne.length, bOne.length] as [number, number], two: [aTwo.length, bTwo.length] as [number, number] };
  });
  if (pairs.some((row) => row === null)) return null;
  const validPairs = pairs as NonNullable<typeof pairs[number]>[];
  const profileA = profile(aRows); const profileB = profile(bRows);
  const mean = (rows: CareerHoleRecord[]) => rows.reduce((sum, row) => sum + row.score - row.par, 0) / rows.length;
  const formatDeltaA = mean(aRows.filter((row) => row.format === "Singles")) - mean(aRows);
  const formatDeltaB = mean(bRows.filter((row) => row.format === "Singles")) - mean(bRows);
  let weightedA = 0; let weightedTie = 0; let weightedB = 0;
  for (let simulation = 0; simulation < MATCH_SIMULATIONS; simulation += 1) {
    const scoresA: Score[] = []; const scoresB: Score[] = []; let lead = 0;
    validPairs.forEach(({ hole, outcomes }) => { const outcome = pick(outcomes); scoresA.push({ score: outcome.a, par: hole.par }); scoresB.push({ score: outcome.b, par: hole.par }); if (outcome.a < outcome.b) lead += 1; else if (outcome.b < outcome.a) lead -= 1; });
    const toParA = scoresA.reduce((sum, row) => sum + row.score - row.par, 0);
    const toParB = scoresB.reduce((sum, row) => sum + row.score - row.par, 0);
    const weight = Math.exp(-ROUND_SHAPE_STRENGTH * (shapeDistance(scoresA, profileA) + shapeDistance(scoresB, profileB))) * Math.exp(FORMAT_STRENGTH * (formatDeltaA - formatDeltaB) * (toParA - toParB));
    if (lead > 0) weightedA += weight; else if (lead < 0) weightedB += weight; else weightedTie += weight;
  }
  const total = weightedA + weightedTie + weightedB;
  return { a: weightedA / total, tie: weightedTie / total, b: weightedB / total, measureOneMinimum: [Math.min(...validPairs.map((row) => row.one[0])), Math.min(...validPairs.map((row) => row.one[1]))], measureTwoMinimum: [Math.min(...validPairs.map((row) => row.two[0])), Math.min(...validPairs.map((row) => row.two[1]))], formatDeltas: [formatDeltaA, formatDeltaB] };
}
