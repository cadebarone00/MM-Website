import { canonicalCourseName } from "@/lib/data/canonicalCourse";
import type { CareerCourseHole, CareerHoleRecord, CareerTeamHoleRecord } from "@/lib/data/careerStats";

type Category = "eagles" | "birdies" | "pars" | "bogeys" | "doubles";
type Profile = Record<Category, { mean: number; sd: number }>;
type Score = { score: number; par: number };
type Pair = { a: number; b: number };

export type PreRoundSinglesResult = {
  a: number; tie: number; b: number;
  measureOneMinimum: [number, number];
  measureTwoMinimum: [number, number];
  formatDeltas: [number, number];
  finalLeadDistribution?: Record<string, number>;
};

const HOLE_SIMULATIONS = 10_000;
const MATCH_SIMULATIONS = 10_000;
const ROUND_SHAPE_STRENGTH = 0.015;
const FORMAT_STRENGTH = 0.08;
const categories: Category[] = ["eagles", "birdies", "pars", "bogeys", "doubles"];
const pick = <T,>(rows: T[]) => rows[Math.floor(Math.random() * rows.length)];
const bucket = (yards: number) => Math.floor((yards - 101) / 10);
// Historical nine-hole rounds remain excluded. Confirmed live 2027+ holes
// have a running roundHoles count below 18 and intentionally enter the raw
// sampling pool immediately; an unplayed hole has no record to include.
const isEligibleIndividualHole = (row: CareerHoleRecord) =>
  row.roundHoles !== 9 && (row.format === "Singles" || row.format === "Fourball");

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

export function calculatePreRoundSinglesOdds({ records, courseHoles, playerA, playerB, course, holesFinished = 0, playerALead = 0, completedScores = [] }: { records: CareerHoleRecord[]; courseHoles: CareerCourseHole[]; playerA: string; playerB: string; course: string; holesFinished?: number; playerALead?: number; completedScores?: { a: number; b: number; par: number }[] }): PreRoundSinglesResult | null {
  const canonicalCourse = canonicalCourseName(course);
  const setup = [...new Map(courseHoles.filter((row) => canonicalCourseName(row.course) === canonicalCourse).map((row) => [row.hole, row])).values()].sort((a, b) => a.hole - b.hole);
  const individual = records.filter(isEligibleIndividualHole);
  const aRows = individual.filter((row) => row.player === playerA);
  const bRows = individual.filter((row) => row.player === playerB);
  if (setup.length !== 18 || !aRows.length || !bRows.length) return null;

  if (holesFinished < 0 || holesFinished > 18 || Math.abs(playerALead) > holesFinished) return null;
  if (holesFinished === 18) return playerALead > 0 ? { a: 1, tie: 0, b: 0, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] } : playerALead < 0 ? { a: 0, tie: 0, b: 1, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] } : { a: 0, tie: 1, b: 0, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] };
  const pairs = setup.slice(holesFinished).map((hole) => {
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
  const finalLeads = new Map<number, number>();
  for (let simulation = 0; simulation < MATCH_SIMULATIONS; simulation += 1) {
    const scoresA: Score[] = completedScores.map((score) => ({ score: score.a, par: score.par })); const scoresB: Score[] = completedScores.map((score) => ({ score: score.b, par: score.par })); let lead = playerALead;
    validPairs.forEach(({ hole, outcomes }) => { const outcome = pick(outcomes); scoresA.push({ score: outcome.a, par: hole.par }); scoresB.push({ score: outcome.b, par: hole.par }); if (outcome.a < outcome.b) lead += 1; else if (outcome.b < outcome.a) lead -= 1; });
    const toParA = scoresA.reduce((sum, row) => sum + row.score - row.par, 0);
    const toParB = scoresB.reduce((sum, row) => sum + row.score - row.par, 0);
    const measureThreeWeight = completedScores.length === holesFinished ? Math.exp(-ROUND_SHAPE_STRENGTH * (shapeDistance(scoresA, profileA) + shapeDistance(scoresB, profileB))) : 1;
    const weight = measureThreeWeight * Math.exp(FORMAT_STRENGTH * (formatDeltaA - formatDeltaB) * (toParA - toParB));
    finalLeads.set(lead, (finalLeads.get(lead) ?? 0) + weight);
    if (lead > 0) weightedA += weight; else if (lead < 0) weightedB += weight; else weightedTie += weight;
  }
  const total = weightedA + weightedTie + weightedB;
  return { a: weightedA / total, tie: weightedTie / total, b: weightedB / total, measureOneMinimum: [Math.min(...validPairs.map((row) => row.one[0])), Math.min(...validPairs.map((row) => row.one[1]))], measureTwoMinimum: [Math.min(...validPairs.map((row) => row.two[0])), Math.min(...validPairs.map((row) => row.two[1]))], formatDeltas: [formatDeltaA, formatDeltaB], finalLeadDistribution: Object.fromEntries([...finalLeads.entries()].map(([lead, value]) => [String(lead), value / total])) };
}

export function calculatePreRoundFourballOdds({ records, courseHoles, teamA, teamB, course, holesFinished = 0, teamALead = 0, completedScores = [] }: { records: CareerHoleRecord[]; courseHoles: CareerCourseHole[]; teamA: [string, string]; teamB: [string, string]; course: string; holesFinished?: number; teamALead?: number; completedScores?: { a1: number; a2: number; b1: number; b2: number; par: number }[] }): PreRoundSinglesResult | null {
  const canonicalCourse = canonicalCourseName(course);
  const setup = [...new Map(courseHoles.filter((row) => canonicalCourseName(row.course) === canonicalCourse).map((row) => [row.hole, row])).values()].sort((a, b) => a.hole - b.hole);
  const individual = records.filter(isEligibleIndividualHole);
  const playerRows = [...teamA, ...teamB].map((player) => individual.filter((row) => row.player === player));
  if (setup.length !== 18 || playerRows.some((rows) => !rows.length)) return null;
  if (holesFinished < 0 || holesFinished > 18 || Math.abs(teamALead) > holesFinished) return null;
  if (holesFinished === 18) return teamALead > 0 ? { a: 1, tie: 0, b: 0, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] } : teamALead < 0 ? { a: 0, tie: 0, b: 1, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] } : { a: 0, tie: 1, b: 0, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] };
  const pairs = setup.slice(holesFinished).map((hole) => {
    const targetBucket = bucket(hole.yards);
    const one = playerRows.map((rows) => rows.filter((row) => row.par === hole.par));
    const two = playerRows.map((rows) => rows.filter((row) => Math.abs(bucket(row.yards) - targetBucket) <= 1));
    if (one.some((rows) => !rows.length) || two.some((rows) => !rows.length)) return null;
    const outcomes: { a1: number; a2: number; b1: number; b2: number }[] = [];
    for (let i = 0; i < HOLE_SIMULATIONS; i += 1) outcomes.push({ a1: pick(one[0]).score, a2: pick(one[1]).score, b1: pick(one[2]).score, b2: pick(one[3]).score });
    for (let i = 0; i < HOLE_SIMULATIONS; i += 1) outcomes.push({ a1: pick(two[0]).score, a2: pick(two[1]).score, b1: pick(two[2]).score, b2: pick(two[3]).score });
    return { hole, outcomes, one: [Math.min(one[0].length, one[1].length), Math.min(one[2].length, one[3].length)] as [number, number], two: [Math.min(two[0].length, two[1].length), Math.min(two[2].length, two[3].length)] as [number, number] };
  });
  if (pairs.some((row) => row === null)) return null;
  const validPairs = pairs as NonNullable<typeof pairs[number]>[];
  const shapes = playerRows.map(profile);
  const mean = (rows: CareerHoleRecord[]) => rows.reduce((sum, row) => sum + row.score - row.par, 0) / rows.length;
  const deltas = playerRows.map((rows) => { const fourball = rows.filter((row) => row.format === "Fourball"); return fourball.length ? mean(fourball) - mean(rows) : 0; });
  let weightedA = 0; let weightedTie = 0; let weightedB = 0;
  const finalLeads = new Map<number, number>();
  for (let simulation = 0; simulation < MATCH_SIMULATIONS; simulation += 1) {
    const scores: Score[][] = [completedScores.map((score) => ({ score: score.a1, par: score.par })), completedScores.map((score) => ({ score: score.a2, par: score.par })), completedScores.map((score) => ({ score: score.b1, par: score.par })), completedScores.map((score) => ({ score: score.b2, par: score.par }))]; let lead = teamALead;
    validPairs.forEach(({ hole, outcomes }) => { const outcome = pick(outcomes); const values = [outcome.a1, outcome.a2, outcome.b1, outcome.b2]; values.forEach((score, index) => scores[index].push({ score, par: hole.par })); const teamAValue = Math.min(outcome.a1, outcome.a2); const teamBValue = Math.min(outcome.b1, outcome.b2); if (teamAValue < teamBValue) lead += 1; else if (teamBValue < teamAValue) lead -= 1; });
    const teamAToPar = scores[0].reduce((sum, row, index) => sum + Math.min(row.score, scores[1][index].score) - row.par, 0);
    const teamBToPar = scores[2].reduce((sum, row, index) => sum + Math.min(row.score, scores[3][index].score) - row.par, 0);
    const measureThreeWeight = completedScores.length === holesFinished ? Math.exp(-ROUND_SHAPE_STRENGTH * scores.reduce((sum, round, index) => sum + shapeDistance(round, shapes[index]), 0)) : 1;
    const formatDeltaA = (deltas[0] + deltas[1]) / 2; const formatDeltaB = (deltas[2] + deltas[3]) / 2;
    const weight = measureThreeWeight * Math.exp(FORMAT_STRENGTH * (formatDeltaA - formatDeltaB) * (teamAToPar - teamBToPar));
    finalLeads.set(lead, (finalLeads.get(lead) ?? 0) + weight);
    if (lead > 0) weightedA += weight; else if (lead < 0) weightedB += weight; else weightedTie += weight;
  }
  const total = weightedA + weightedTie + weightedB;
  return { a: weightedA / total, tie: weightedTie / total, b: weightedB / total, measureOneMinimum: [Math.min(...validPairs.map((row) => row.one[0])), Math.min(...validPairs.map((row) => row.one[1]))], measureTwoMinimum: [Math.min(...validPairs.map((row) => row.two[0])), Math.min(...validPairs.map((row) => row.two[1]))], formatDeltas: [(deltas[0] + deltas[1]) / 2, (deltas[2] + deltas[3]) / 2], finalLeadDistribution: Object.fromEntries([...finalLeads.entries()].map(([lead, value]) => [String(lead), value / total])) };
}

/** Alternate Shot keeps target-hole matching in Measures 1/2. Format
 * calibration uses every historical Alternate Shot team hole; an exact-pair
 * adjustment is shrunk toward zero when the partnership has little history. */
export function calculatePreRoundAlternateShotOdds({ records, teamRecords, courseHoles, teamA, teamB, course, holesFinished = 0, teamALead = 0 }: { records: CareerHoleRecord[]; teamRecords: CareerTeamHoleRecord[]; courseHoles: CareerCourseHole[]; teamA: [string, string]; teamB: [string, string]; course: string; holesFinished?: number; teamALead?: number }): PreRoundSinglesResult | null {
  const canonicalCourse = canonicalCourseName(course);
  const setup = [...new Map(courseHoles.filter((row) => canonicalCourseName(row.course) === canonicalCourse).map((row) => [row.hole, row])).values()].sort((a, b) => a.hole - b.hole);
  const individual = records.filter(isEligibleIndividualHole);
  const individualRows = [...teamA, ...teamB].map((player) => individual.filter((row) => row.player === player));
  const alternate = teamRecords.filter((row) => row.format === "Alternate Shot");
  const pairKey = (pair: [string, string]) => [...pair].sort().join(":");
  const pairRows = (pair: [string, string]) => alternate.filter((row) => pairKey([row.player1, row.player2 ?? ""]) === pairKey(pair));
  const aPair = pairRows(teamA); const bPair = pairRows(teamB);
  if (setup.length !== 18 || individualRows.some((rows) => !rows.length) || !alternate.length) return null;
  if (holesFinished < 0 || holesFinished > 18 || Math.abs(teamALead) > holesFinished) return null;
  if (holesFinished === 18) return teamALead > 0 ? { a: 1, tie: 0, b: 0, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] } : teamALead < 0 ? { a: 0, tie: 0, b: 1, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] } : { a: 0, tie: 1, b: 0, measureOneMinimum: [0, 0], measureTwoMinimum: [0, 0], formatDeltas: [0, 0] };
  const averageRelative = (rows: CareerTeamHoleRecord[]) => rows.reduce((sum, row) => sum + row.score - row.par, 0) / rows.length;
  const formatRelative = averageRelative(alternate);
  // A new pair gets zero pair-specific adjustment. An established pair moves
  // toward its own all-hole Alternate Shot average, but never fully overrides
  // the individual target-hole model on a small history.
  const pairAdjustment = (rows: CareerTeamHoleRecord[]) => rows.length ? (rows.length / (rows.length + 36)) * (averageRelative(rows) - formatRelative) : 0;
  const aAdjustment = pairAdjustment(aPair); const bAdjustment = pairAdjustment(bPair);
  const holes = setup.slice(holesFinished).map((hole) => {
    const targetBucket = bucket(hole.yards);
    const individualPools = (measure: 1 | 2) => individualRows.map((rows) => rows.filter((row) => measure === 1 ? row.par === hole.par : Math.abs(bucket(row.yards) - targetBucket) <= 1));
    const one = individualPools(1); const two = individualPools(2);
    if (one.some((rows) => !rows.length) || two.some((rows) => !rows.length)) return null;
    const combine = (left: CareerHoleRecord, right: CareerHoleRecord, adjustment: number) => Math.max(1, Math.round(hole.par + 0.75 * (((left.score - left.par) + (right.score - right.par)) / 2) + 0.25 * formatRelative + adjustment));
    const outcomes: Pair[] = [];
    for (let i = 0; i < HOLE_SIMULATIONS; i += 1) outcomes.push({ a: combine(pick(one[0]), pick(one[1]), aAdjustment), b: combine(pick(one[2]), pick(one[3]), bAdjustment) });
    for (let i = 0; i < HOLE_SIMULATIONS; i += 1) outcomes.push({ a: combine(pick(two[0]), pick(two[1]), aAdjustment), b: combine(pick(two[2]), pick(two[3]), bAdjustment) });
    return { hole, outcomes, one: [Math.min(one[0].length, one[1].length), Math.min(one[2].length, one[3].length)] as [number, number], two: [Math.min(two[0].length, two[1].length), Math.min(two[2].length, two[3].length)] as [number, number] };
  });
  if (holes.some((row) => row === null)) return null;
  const validHoles = holes as NonNullable<typeof holes[number]>[];
  let aWins = 0; let ties = 0; let bWins = 0;
  for (let simulation = 0; simulation < MATCH_SIMULATIONS; simulation += 1) { let lead = teamALead; validHoles.forEach(({ outcomes }) => { const score = pick(outcomes); if (score.a < score.b) lead += 1; else if (score.b < score.a) lead -= 1; }); if (lead > 0) aWins += 1; else if (lead < 0) bWins += 1; else ties += 1; }
  return { a: aWins / MATCH_SIMULATIONS, tie: ties / MATCH_SIMULATIONS, b: bWins / MATCH_SIMULATIONS, measureOneMinimum: [Math.min(...validHoles.map((row) => row.one[0])), Math.min(...validHoles.map((row) => row.one[1]))], measureTwoMinimum: [Math.min(...validHoles.map((row) => row.two[0])), Math.min(...validHoles.map((row) => row.two[1]))], formatDeltas: [0, 0] };
}
