/**
 * Repeatable pre-round Singles test for docs/odds-model-spec.md.
 *
 * Measure 1: 10,000 par-matched score-pair draws per target hole.
 * Measure 2: 10,000 three-10-yard-bucket score-pair draws per target hole.
 * The two pools are combined, then 10,000 complete matches are drawn from
 * them. Measure 3 softly reweights unlikely round shapes. Measure 4 softly
 * reweights results consistent with a player's Singles score-to-par delta.
 * A separate Singles win/loss record is deliberately neutral until that
 * canonical match-result data is present in Career Archive.
 */
import { careerArchiveCourseHoles, careerArchiveRecords } from "../lib/data/careerArchive.generated";
import { canonicalCourseName } from "../lib/data/canonicalCourse";
import type { CareerHoleRecord } from "../lib/data/careerStats";

const [playerA = "PETE", playerB = "CADE", targetCourse = "Palmer"] = process.argv.slice(2);
const HOLE_RUNS = 10_000;
const MATCH_RUNS = 10_000;
const ROUND_SHAPE_STRENGTH = 0.015;
const FORMAT_STRENGTH = 0.08;

type Pair = { a: number; b: number };
type Category = "eagles" | "birdies" | "pars" | "bogeys" | "doubles";
type Profile = Record<Category, { mean: number; standardDeviation: number }>;

const individual = careerArchiveRecords.filter((row) => row.roundHoles === 18 && (row.format === "Singles" || row.format === "Fourball"));
const course = canonicalCourseName(targetCourse);
const setup = [...new Map(
  careerArchiveCourseHoles
    .filter((row) => canonicalCourseName(row.course) === course)
    .map((row) => [row.hole, row]),
).values()].sort((a, b) => a.hole - b.hole);

if (setup.length !== 18) throw new Error(`${course} does not have one complete 18-hole setup in Career Archive.`);

const random = <T,>(rows: T[]): T => rows[Math.floor(Math.random() * rows.length)];
const yardageIndex = (yards: number) => Math.floor((yards - 101) / 10);
const playerRows = (player: string) => individual.filter((row) => row.player === player);

function measureOnePool(player: string, hole: typeof setup[number]): CareerHoleRecord[] {
  return playerRows(player).filter((row) => row.par === hole.par);
}

function measureTwoPool(player: string, hole: typeof setup[number]): CareerHoleRecord[] {
  const targetIndex = yardageIndex(hole.yards);
  return playerRows(player).filter((row) => Math.abs(yardageIndex(row.yards) - targetIndex) <= 1);
}

function categoryCounts(rows: { score: number; par: number }[]): Record<Category, number> {
  return rows.reduce<Record<Category, number>>((counts, row) => {
    const relative = row.score - row.par;
    if (relative <= -2) counts.eagles += 1;
    else if (relative === -1) counts.birdies += 1;
    else if (relative === 0) counts.pars += 1;
    else if (relative === 1) counts.bogeys += 1;
    else counts.doubles += 1;
    return counts;
  }, { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 });
}

function profileFor(player: string): Profile {
  const rounds = new Map<string, CareerHoleRecord[]>();
  playerRows(player).forEach((row) => {
    const id = `${row.year}:${row.round}:${row.course}:${row.format}`;
    rounds.set(id, [...(rounds.get(id) ?? []), row]);
  });
  const counts = [...rounds.values()].filter((round) => round.length === 18).map(categoryCounts);
  const categories: Category[] = ["eagles", "birdies", "pars", "bogeys", "doubles"];
  return Object.fromEntries(categories.map((category) => {
    const values = counts.map((round) => round[category]);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
    return [category, { mean, standardDeviation: Math.max(0.75, Math.sqrt(variance)) }];
  })) as Profile;
}

function shapeDistance(rows: { score: number; par: number }[], profile: Profile): number {
  const counts = categoryCounts(rows);
  return (Object.keys(profile) as Category[]).reduce((sum, category) => sum + ((counts[category] - profile[category].mean) / profile[category].standardDeviation) ** 2, 0);
}

function averageToPar(player: string, format?: "Singles"): number {
  const rows = playerRows(player).filter((row) => !format || row.format === format);
  return rows.reduce((sum, row) => sum + row.score - row.par, 0) / rows.length;
}

const holePairs = setup.map((hole) => {
  const aMeasureOne = measureOnePool(playerA, hole);
  const bMeasureOne = measureOnePool(playerB, hole);
  const aMeasureTwo = measureTwoPool(playerA, hole);
  const bMeasureTwo = measureTwoPool(playerB, hole);
  if (!aMeasureOne.length || !bMeasureOne.length || !aMeasureTwo.length || !bMeasureTwo.length) {
    throw new Error(`A required Measure 1 or Measure 2 pool is empty on Palmer hole ${hole.hole}.`);
  }
  const pairs: Pair[] = [];
  for (let run = 0; run < HOLE_RUNS; run += 1) pairs.push({ a: random(aMeasureOne).score, b: random(bMeasureOne).score });
  for (let run = 0; run < HOLE_RUNS; run += 1) pairs.push({ a: random(aMeasureTwo).score, b: random(bMeasureTwo).score });
  return { hole, pairs, measureOneSamples: [aMeasureOne.length, bMeasureOne.length], measureTwoSamples: [aMeasureTwo.length, bMeasureTwo.length] };
});

const profileA = profileFor(playerA);
const profileB = profileFor(playerB);
const formatDeltaA = averageToPar(playerA, "Singles") - averageToPar(playerA);
const formatDeltaB = averageToPar(playerB, "Singles") - averageToPar(playerB);
let weightedA = 0;
let weightedTie = 0;
let weightedB = 0;

for (let run = 0; run < MATCH_RUNS; run += 1) {
  const scoresA: { score: number; par: number }[] = [];
  const scoresB: { score: number; par: number }[] = [];
  let matchLead = 0;
  holePairs.forEach(({ hole, pairs }) => {
    const pair = random(pairs);
    scoresA.push({ score: pair.a, par: hole.par });
    scoresB.push({ score: pair.b, par: hole.par });
    if (pair.a < pair.b) matchLead += 1;
    else if (pair.b < pair.a) matchLead -= 1;
  });
  const toParA = scoresA.reduce((sum, row) => sum + row.score - row.par, 0);
  const toParB = scoresB.reduce((sum, row) => sum + row.score - row.par, 0);
  const measureThreeWeight = Math.exp(-ROUND_SHAPE_STRENGTH * (shapeDistance(scoresA, profileA) + shapeDistance(scoresB, profileB)));
  const measureFourWeight = Math.exp(FORMAT_STRENGTH * (formatDeltaA - formatDeltaB) * (toParA - toParB));
  const weight = measureThreeWeight * measureFourWeight;
  if (matchLead > 0) weightedA += weight;
  else if (matchLead < 0) weightedB += weight;
  else weightedTie += weight;
}

const totalWeight = weightedA + weightedTie + weightedB;
const probability = { a: weightedA / totalWeight, tie: weightedTie / totalWeight, b: weightedB / totalWeight };
const american = (value: number) => Math.round(value >= 0.5 ? -100 * value / (1 - value) : 100 * (1 - value) / value);
const displayAmerican = (value: number) => `${american(value) > 0 ? "+" : ""}${american(value)}`;
const ranges = (index: 1 | 2) => ({ minimumA: Math.min(...holePairs.map((row) => index === 1 ? row.measureOneSamples[0] : row.measureTwoSamples[0])), minimumB: Math.min(...holePairs.map((row) => index === 1 ? row.measureOneSamples[1] : row.measureTwoSamples[1])) });

console.log(JSON.stringify({
  course,
  players: [playerA, playerB],
  targetHoles: setup.length,
  measureOne: { simulationsPerHole: HOLE_RUNS, minimumSamples: ranges(1) },
  measureTwo: { simulationsPerHole: HOLE_RUNS, yardageWindow: "target bucket plus adjacent 10-yard buckets", minimumSamples: ranges(2) },
  measureThree: { roundShapeStrength: ROUND_SHAPE_STRENGTH },
  measureFour: {
    singlesToParDelta: { [playerA]: formatDeltaA, [playerB]: formatDeltaB },
    matchRecordAdjustment: "neutral: canonical Singles win/loss/halve archive data is not present yet",
  },
  matchRuns: MATCH_RUNS,
  result: {
    [playerA]: { probability: probability.a, fairAmericanOdds: displayAmerican(probability.a) },
    tie: { probability: probability.tie, fairAmericanOdds: displayAmerican(probability.tie) },
    [playerB]: { probability: probability.b, fairAmericanOdds: displayAmerican(probability.b) },
  },
}, null, 2));
